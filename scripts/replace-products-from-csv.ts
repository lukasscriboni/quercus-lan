import "dotenv/config";

import { ImportDuplicateMode, ImportStatus, Prisma, PrismaClient, StockMovementType } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { normalizeText, parseArgentineNumber } from "../lib/normalize";

const db = new PrismaClient();
const csvArgument = process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]);
const apply = process.argv.includes("--apply");

if (!csvArgument) throw new Error("Indicá la ruta del CSV");
const csvPath = csvArgument;

type ImportRow = {
  rowNumber: number;
  sku: string;
  normalizedSku: string;
  barcode: string | null;
  name: string;
  normalizedName: string;
  stock: number;
  taxRate: number;
  cost: number;
  price: number;
  category: string | null;
  normalizedCategory: string | null;
  brand: string | null;
  supplier: string | null;
  normalizedSupplier: string | null;
};

function clean(value: string | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function numberAt(fields: string[], index: number, rowNumber: number, label: string) {
  const value = parseArgentineNumber(fields[index]);
  if (value === null) throw new Error(`Fila ${rowNumber}: ${label} inválido`);
  return value;
}

function chunks<T>(rows: T[], size = 400) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

async function main() {
  const bytes = await readFile(csvPath);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  const parsed = Papa.parse<string[]>(text, { delimiter: ";", skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error(`El CSV tiene errores de formato: ${parsed.errors[0]?.message}`);

  const errors: string[] = [];
  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  let duplicateBarcodesCleared = 0;
  let negativeStocksClamped = 0;
  const rows: ImportRow[] = [];

  parsed.data.forEach((fields, index) => {
    const rowNumber = index + 1;
    if (fields.length !== 33) {
      errors.push(`Fila ${rowNumber}: se esperaban 33 columnas y hay ${fields.length}`);
      return;
    }
    try {
      const sku = clean(fields[3]);
      const name = clean(fields[4]);
      if (!sku) throw new Error(`Fila ${rowNumber}: falta el SKU`);
      if (!name) throw new Error(`Fila ${rowNumber}: falta el nombre`);
      const normalizedSku = normalizeText(sku);
      if (seenSkus.has(normalizedSku)) throw new Error(`Fila ${rowNumber}: SKU duplicado (${sku})`);
      seenSkus.add(normalizedSku);

      const rawBarcode = clean(fields[0]);
      let barcode = rawBarcode && rawBarcode !== "0" ? rawBarcode : null;
      if (barcode && seenBarcodes.has(barcode)) {
        barcode = null;
        duplicateBarcodesCleared += 1;
      } else if (barcode) seenBarcodes.add(barcode);

      const originalStock = numberAt(fields, 6, rowNumber, "stock");
      if (originalStock < 0) negativeStocksClamped += 1;
      const stock = Math.max(0, originalStock);
      const taxRate = numberAt(fields, 7, rowNumber, "IVA");
      const cost = numberAt(fields, 8, rowNumber, "costo");
      const price = numberAt(fields, 10, rowNumber, "precio");
      if (taxRate < 0 || taxRate > 100) throw new Error(`Fila ${rowNumber}: IVA fuera de rango`);
      if (cost < 0 || price < 0) throw new Error(`Fila ${rowNumber}: costo o precio negativo`);

      const category = clean(fields[17]) || null;
      const brand = clean(fields[18]) || null;
      const supplier = clean(fields[20]) || null;
      rows.push({
        rowNumber,
        sku,
        normalizedSku,
        barcode,
        name,
        normalizedName: normalizeText(name),
        stock,
        taxRate,
        cost,
        price,
        category,
        normalizedCategory: category ? normalizeText(category) : null,
        brand,
        supplier,
        normalizedSupplier: supplier ? normalizeText(supplier) : null,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Fila ${rowNumber}: error desconocido`);
    }
  });

  if (errors.length) throw new Error(`No se modificó nada. Errores encontrados:\n${errors.slice(0, 20).join("\n")}`);

  const organization = await db.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!organization) throw new Error("No hay una organización configurada");
  const [warehouse, user, currentProducts] = await Promise.all([
    db.warehouse.findFirst({
      where: { branch: { organizationId: organization.id }, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    db.user.findFirst({
      where: { organizationId: organization.id, isActive: true },
      orderBy: [{ role: { name: "asc" } }, { createdAt: "asc" }],
      select: { id: true, displayName: true },
    }),
    db.product.findMany({
      where: { organizationId: organization.id },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        stocks: true,
        ingredient: { select: { id: true } },
        recipe: { select: { id: true } },
        _count: { select: { orderItems: true, stockMovements: true, purchaseItems: true, inventoryCountItems: true } },
      },
    }),
  ]);
  if (!warehouse) throw new Error("No hay una ubicación principal de stock");
  if (!user) throw new Error("No hay un usuario activo para registrar la importación");

  const protectedProducts = currentProducts.filter((product) =>
    product._count.orderItems > 0
    || product._count.stockMovements > 0
    || product._count.purchaseItems > 0
    || product._count.inventoryCountItems > 0
    || Boolean(product.ingredient)
    || Boolean(product.recipe),
  );
  const summary = {
    csvRows: rows.length,
    currentProducts: currentProducts.length,
    productsToDelete: currentProducts.length - protectedProducts.length,
    productsToArchiveForHistory: protectedProducts.length,
    negativeStocksClampedToZero: negativeStocksClamped,
    duplicateBarcodesCleared,
    categoriesInCsv: new Set(rows.flatMap((row) => row.normalizedCategory ? [row.normalizedCategory] : [])).size,
    suppliersInCsv: new Set(rows.flatMap((row) => row.normalizedSupplier ? [row.normalizedSupplier] : [])).size,
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: "DRY_RUN", organization, warehouse, summary, sample: rows.slice(0, 5) }, null, 2));
    return;
  }

  const backupDirectory = path.resolve(process.cwd(), "backups");
  await mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `products-before-replace-${timestamp}.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), organization, warehouse, products: currentProducts }, null, 2), "utf8");

  const result = await db.$transaction(async (tx) => {
    const protectedIds = protectedProducts.map((product) => product.id);
    const deleted = await tx.product.deleteMany({
      where: { organizationId: organization.id, ...(protectedIds.length ? { id: { notIn: protectedIds } } : {}) },
    });
    const archived = protectedIds.length
      ? await tx.product.updateMany({
          where: { id: { in: protectedIds }, organizationId: organization.id },
          data: { isActive: false, sku: null, normalizedSku: null, barcode: null, version: { increment: 1 } },
        })
      : { count: 0 };

    const existingCategories = await tx.category.findMany({ where: { organizationId: organization.id }, select: { id: true, normalizedName: true } });
    const existingCategoryNames = new Set(existingCategories.map((category) => category.normalizedName));
    const categoriesToCreate = Array.from(new Map(rows.flatMap((row) => row.category && row.normalizedCategory ? [[row.normalizedCategory, row.category] as const] : [])).entries())
      .filter(([normalizedName]) => !existingCategoryNames.has(normalizedName))
      .map(([normalizedName, name]) => ({ organizationId: organization.id, normalizedName, name }));
    if (categoriesToCreate.length) await tx.category.createMany({ data: categoriesToCreate, skipDuplicates: true });
    const categoryMap = new Map((await tx.category.findMany({ where: { organizationId: organization.id }, select: { id: true, normalizedName: true } })).map((category) => [category.normalizedName, category.id]));

    const existingSuppliers = await tx.supplier.findMany({ where: { organizationId: organization.id }, select: { id: true, normalizedName: true } });
    const existingSupplierNames = new Set(existingSuppliers.map((supplier) => supplier.normalizedName));
    const suppliersToCreate = Array.from(new Map(rows.flatMap((row) => row.supplier && row.normalizedSupplier ? [[row.normalizedSupplier, row.supplier] as const] : [])).entries())
      .filter(([normalizedName]) => !existingSupplierNames.has(normalizedName))
      .map(([normalizedName, name]) => ({ organizationId: organization.id, normalizedName, name }));
    if (suppliersToCreate.length) await tx.supplier.createMany({ data: suppliersToCreate, skipDuplicates: true });
    const supplierMap = new Map((await tx.supplier.findMany({ where: { organizationId: organization.id }, select: { id: true, normalizedName: true } })).map((supplier) => [supplier.normalizedName, supplier.id]));

    for (const group of chunks(rows)) {
      await tx.product.createMany({
        data: group.map((row) => ({
          organizationId: organization.id,
          categoryId: row.normalizedCategory ? categoryMap.get(row.normalizedCategory) ?? null : null,
          supplierId: row.normalizedSupplier ? supplierMap.get(row.normalizedSupplier) ?? null : null,
          name: row.name,
          normalizedName: row.normalizedName,
          sku: row.sku,
          normalizedSku: row.normalizedSku,
          barcode: row.barcode,
          brand: row.brand,
          price: new Prisma.Decimal(row.price),
          cost: new Prisma.Decimal(row.cost),
          taxRate: new Prisma.Decimal(row.taxRate),
          stockMode: "DIRECT",
          unit: "UNIT",
          isActive: true,
        })),
      });
    }

    const createdProducts = await tx.product.findMany({
      where: { organizationId: organization.id, normalizedSku: { in: rows.map((row) => row.normalizedSku) }, isActive: true },
      select: { id: true, normalizedSku: true },
    });
    const productMap = new Map(createdProducts.flatMap((product) => product.normalizedSku ? [[product.normalizedSku, product.id] as const] : []));
    if (productMap.size !== rows.length) throw new Error(`Se crearon ${productMap.size} productos y se esperaban ${rows.length}`);

    const job = await tx.importJob.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        fileName: path.basename(csvPath),
        duplicateMode: ImportDuplicateMode.CREATE_ONLY,
        totalRows: rows.length,
        createdRows: rows.length,
        status: ImportStatus.COMPLETED,
        mapping: {
          format: "legacy-33-columns-no-header",
          sku: 4,
          barcode: 1,
          name: 5,
          stock: 7,
          taxRate: 8,
          cost: 9,
          price: 11,
          category: 18,
          brand: 19,
          supplier: 21,
        },
        completedAt: new Date(),
      },
    });

    const stockRows = rows.map((row) => ({
      productId: productMap.get(row.normalizedSku)!,
      warehouseId: warehouse.id,
      quantity: new Prisma.Decimal(row.stock),
      minimum: new Prisma.Decimal(0),
    }));
    for (const group of chunks(stockRows)) await tx.stock.createMany({ data: group });

    const movementRows = rows.filter((row) => row.stock > 0).map((row) => ({
      productId: productMap.get(row.normalizedSku)!,
      warehouseId: warehouse.id,
      userId: user.id,
      type: StockMovementType.INITIAL_IMPORT,
      quantity: new Prisma.Decimal(row.stock),
      previousQty: new Prisma.Decimal(0),
      newQty: new Prisma.Decimal(row.stock),
      reason: `Reemplazo de catálogo desde ${path.basename(csvPath)}`,
      referenceType: "ImportJob",
      referenceId: job.id,
    }));
    for (const group of chunks(movementRows)) await tx.stockMovement.createMany({ data: group });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: "PRODUCT_CATALOG_REPLACED",
        entityType: "ImportJob",
        entityId: job.id,
        before: { productCount: currentProducts.length },
        after: { productCount: rows.length },
        metadata: { ...summary, backupPath },
      },
    });
    return { deleted: deleted.count, archived: archived.count, created: createdProducts.length, stockRows: stockRows.length, stockMovements: movementRows.length, importJobId: job.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });

  console.log(JSON.stringify({ mode: "APPLIED", backupPath, summary, result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
