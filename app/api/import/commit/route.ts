import { ImportDuplicateMode, ImportStatus, Prisma, StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { IMPORT_FIELDS, prepareRows, type ColumnMapping, type PreparedRow } from "@/lib/csv-import";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  rows: z.array(z.record(z.string(), z.string().or(z.number()).or(z.null()))).min(1).max(5000),
  mapping: z.record(z.string(), z.enum(IMPORT_FIELDS)),
  duplicateMode: z.enum(["SKIP_EXISTING", "UPDATE_EXISTING", "CREATE_ONLY"]),
  createMissingCategories: z.boolean().default(true),
});

function existingFor(row: PreparedRow, maps: {
  sku: Map<string, { id: string }>;
  barcode: Map<string, { id: string }>;
  name: Map<string, { id: string }>;
}) {
  return (row.sku ? maps.sku.get(normalizeText(row.sku)) : undefined)
    ?? (row.barcode ? maps.barcode.get(row.barcode) : undefined)
    ?? maps.name.get(row.normalizedName);
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_IMPORT);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Datos de importación inválidos o más de 5.000 filas" }, { status: 400 });
  const rows = parsed.data.rows as unknown as Record<string, string>[];
  const prepared = prepareRows(rows, parsed.data.mapping as ColumnMapping);
  if (prepared.errors.length) {
    const failed = await db.importJob.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        fileName: parsed.data.fileName,
        duplicateMode: parsed.data.duplicateMode,
        totalRows: rows.length,
        failedRows: prepared.errors.length,
        status: ImportStatus.FAILED,
        mapping: parsed.data.mapping,
        completedAt: new Date(),
        errors: { create: prepared.errors.slice(0, 500).map((error) => ({ rowNumber: error.rowNumber, message: error.message, rawData: error.rawData as Prisma.InputJsonValue })) },
      },
    });
    return Response.json({ error: "No se importó ninguna fila: corregí los errores de la vista previa", jobId: failed.id, errors: prepared.errors.slice(0, 100) }, { status: 422 });
  }

  const job = await db.importJob.create({
    data: {
      organizationId: auth.user.organizationId,
      userId: auth.user.id,
      fileName: parsed.data.fileName,
      duplicateMode: parsed.data.duplicateMode,
      totalRows: rows.length,
      status: ImportStatus.RUNNING,
      mapping: parsed.data.mapping,
    },
  });

  try {
    const summary = await db.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { branch: { organizationId: auth.user.organizationId }, isDefault: true, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (!warehouse) throw new Error("No existe un depósito predeterminado");
      const currentProducts = await tx.product.findMany({
        where: { organizationId: auth.user.organizationId },
        select: { id: true, normalizedSku: true, barcode: true, normalizedName: true },
      });
      const productMaps = {
        sku: new Map<string, { id: string }>(currentProducts.flatMap((item) => item.normalizedSku ? [[item.normalizedSku, { id: item.id }] as const] : [])),
        barcode: new Map<string, { id: string }>(currentProducts.flatMap((item) => item.barcode ? [[item.barcode, { id: item.id }] as const] : [])),
        name: new Map<string, { id: string }>(currentProducts.map((item) => [item.normalizedName, { id: item.id }] as const)),
      };
      const categoryRows = await tx.category.findMany({ where: { organizationId: auth.user.organizationId } });
      const categories = new Map(categoryRows.map((item) => [item.normalizedName, item.id]));
      const supplierRows = await tx.supplier.findMany({ where: { organizationId: auth.user.organizationId } });
      const suppliers = new Map(supplierRows.map((item) => [item.normalizedName, item.id]));
      let createdRows = 0;
      let updatedRows = 0;
      let skippedRows = 0;

      for (const row of prepared.prepared) {
        let categoryId: string | undefined;
        if (row.category) {
          const normalizedCategory = normalizeText(row.category);
          categoryId = categories.get(normalizedCategory);
          if (!categoryId && parsed.data.createMissingCategories) {
            const category = await tx.category.create({ data: { organizationId: auth.user.organizationId, name: row.category, normalizedName: normalizedCategory } });
            categoryId = category.id;
            categories.set(normalizedCategory, category.id);
          }
        }
        let supplierId: string | undefined;
        if (row.supplier) {
          const normalizedSupplier = normalizeText(row.supplier);
          supplierId = suppliers.get(normalizedSupplier);
          if (!supplierId) {
            const supplier = await tx.supplier.create({ data: { organizationId: auth.user.organizationId, name: row.supplier, normalizedName: normalizedSupplier } });
            supplierId = supplier.id;
            suppliers.set(normalizedSupplier, supplier.id);
          }
        }
        const existing = existingFor(row, productMaps);
        if (existing && parsed.data.duplicateMode !== ImportDuplicateMode.UPDATE_EXISTING) {
          skippedRows += 1;
          continue;
        }
        const values = {
          name: row.name,
          normalizedName: row.normalizedName,
          sku: row.sku ?? null,
          normalizedSku: row.sku ? normalizeText(row.sku) : null,
          barcode: row.barcode ?? null,
          brand: row.brand ?? null,
          categoryId: categoryId ?? null,
          supplierId: supplierId ?? null,
          price: new Prisma.Decimal(row.price),
          cost: new Prisma.Decimal(row.cost),
          taxRate: new Prisma.Decimal(row.taxRate),
          stockMode: row.stockMode,
          unit: row.unit,
          isActive: row.isActive,
        };
        const product = existing
          ? await tx.product.update({ where: { id: existing.id }, data: { ...values, version: { increment: 1 } } })
          : await tx.product.create({ data: { organizationId: auth.user.organizationId, ...values } });
        if (existing) updatedRows += 1;
        else {
          createdRows += 1;
          const ref = { id: product.id };
          if (row.sku) productMaps.sku.set(normalizeText(row.sku), ref);
          if (row.barcode) productMaps.barcode.set(row.barcode, ref);
          productMaps.name.set(row.normalizedName, ref);
        }
        if (row.stock !== undefined) {
          const current = await tx.stock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } });
          const previous = current?.quantity ?? new Prisma.Decimal(0);
          const next = new Prisma.Decimal(row.stock);
          await tx.stock.upsert({
            where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
            create: { productId: product.id, warehouseId: warehouse.id, quantity: next, minimum: row.minimum },
            update: { quantity: next, minimum: row.minimum, version: { increment: 1 } },
          });
          const delta = next.sub(previous);
          if (!delta.isZero()) {
            await tx.stockMovement.create({
              data: {
                productId: product.id,
                warehouseId: warehouse.id,
                userId: auth.user.id,
                type: previous.isZero() ? StockMovementType.INITIAL_IMPORT : StockMovementType.ADJUSTMENT,
                quantity: delta,
                previousQty: previous,
                newQty: next,
                reason: `Importación CSV: ${parsed.data.fileName}`,
                referenceType: "ImportJob",
                referenceId: job.id,
              },
            });
          }
        }
      }
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "CSV_IMPORTED",
          entityType: "ImportJob",
          entityId: job.id,
          metadata: { fileName: parsed.data.fileName, totalRows: rows.length, createdRows, updatedRows, skippedRows },
        },
      });
      await tx.importJob.update({
        where: { id: job.id },
        data: { status: ImportStatus.COMPLETED, createdRows, updatedRows, skippedRows, completedAt: new Date() },
      });
      return { jobId: job.id, totalRows: rows.length, createdRows, updatedRows, skippedRows, failedRows: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000, maxWait: 10_000 });
    publishEvent("products.imported", { jobId: job.id });
    return Response.json(summary);
  } catch (error) {
    await db.importJob.update({ where: { id: job.id }, data: { status: ImportStatus.FAILED, failedRows: rows.length, completedAt: new Date() } });
    return Response.json({ error: error instanceof Error ? error.message : "La importación falló y fue revertida", jobId: job.id }, { status: 500 });
  }
}
