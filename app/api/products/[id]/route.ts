import { Prisma, StockMovementType } from "@prisma/client";
import { z } from "zod";
import { can, requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidProductPrice } from "@/lib/pricing-rules";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).nullable().optional(),
  barcode: z.string().trim().max(80).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  kitchenStationId: z.string().nullable().optional(),
  price: z.coerce.number().refine(isValidProductPrice, "El precio debe ser un múltiplo de $100"),
  cost: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
  stockMode: z.enum(["NONE", "DIRECT", "RECIPE"]),
  unit: z.enum(["UNIT", "GRAM", "KILOGRAM", "MILLILITER", "LITER"]),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  stockQuantity: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
  stockMinimum: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_WRITE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues.find((issue) => issue.path[0] === "price")?.message ?? "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  if ((parsed.data.stockQuantity !== undefined || parsed.data.stockMinimum !== undefined) && !can(auth.user, PERMISSIONS.STOCK_ADJUST)) return Response.json({ error: "Tu perfil no permite modificar el stock" }, { status: 403 });
  if ((parsed.data.stockQuantity !== undefined || parsed.data.stockMinimum !== undefined) && parsed.data.stockMode !== "DIRECT") return Response.json({ error: "Sólo se puede editar el stock de productos con control directo" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, organizationId: auth.user.organizationId } });
      if (!before) throw new Error("PRODUCT_NOT_FOUND");
      if (parsed.data.kitchenStationId) {
        const station = await tx.kitchenStation.findFirst({ where: { id: parsed.data.kitchenStationId, branch: { organizationId: auth.user.organizationId }, isActive: true } });
        if (!station) throw new Error("KITCHEN_STATION_NOT_FOUND");
      }
      const changed = await tx.product.updateMany({
        where: { id, organizationId: auth.user.organizationId, version: parsed.data.version },
        data: {
          name: parsed.data.name,
          normalizedName: normalizeText(parsed.data.name),
          sku: parsed.data.sku || null,
          normalizedSku: parsed.data.sku ? normalizeText(parsed.data.sku) : null,
          barcode: parsed.data.barcode || null,
          categoryId: parsed.data.categoryId || null,
          kitchenStationId: parsed.data.kitchenStationId || null,
          price: parsed.data.price,
          cost: parsed.data.cost,
          taxRate: parsed.data.taxRate,
          stockMode: parsed.data.stockMode,
          unit: parsed.data.unit,
          isActive: parsed.data.isActive,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("PRODUCT_CONFLICT");

      const product = await tx.product.findUniqueOrThrow({ where: { id } });
      let stockChanged = false;
      let warehouseId: string | null = null;
      if (parsed.data.stockQuantity !== undefined || parsed.data.stockMinimum !== undefined) {
        const warehouse = await tx.warehouse.findFirst({
          where: { branch: { organizationId: auth.user.organizationId }, isActive: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });
        if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
        warehouseId = warehouse.id;
        const current = await tx.stock.upsert({
          where: { productId_warehouseId: { productId: id, warehouseId: warehouse.id } },
          create: { productId: id, warehouseId: warehouse.id, quantity: 0, minimum: 0 },
          update: {},
        });
        const previous = new Prisma.Decimal(current.quantity);
        const next = new Prisma.Decimal(parsed.data.stockQuantity ?? current.quantity);
        const nextMinimum = new Prisma.Decimal(parsed.data.stockMinimum ?? current.minimum);
        const difference = next.sub(previous);
        if (!difference.isZero() || !nextMinimum.equals(current.minimum)) {
          const stockUpdate = await tx.stock.updateMany({ where: { id: current.id, version: current.version }, data: { quantity: next, minimum: nextMinimum, version: { increment: 1 } } });
          if (stockUpdate.count !== 1) throw new Error("STOCK_CONFLICT");
          const movement = !difference.isZero() ? await tx.stockMovement.create({
            data: { productId: id, warehouseId: warehouse.id, userId: auth.user.id, type: StockMovementType.ADJUSTMENT, quantity: difference, previousQty: previous, newQty: next, reason: "Edición manual desde la ficha del producto", referenceType: "PRODUCT_EDIT", referenceId: id },
          }) : null;
          await tx.auditLog.create({
            data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "STOCK_ADJUSTED", entityType: "Stock", entityId: current.id, before: { quantity: previous.toString(), minimum: current.minimum.toString(), version: current.version }, after: { quantity: next.toString(), minimum: nextMinimum.toString(), version: current.version + 1, movementId: movement?.id ?? null } },
          });
          stockChanged = true;
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: before.price.equals(product.price) ? "PRODUCT_UPDATED" : "PRODUCT_PRICE_CHANGED",
          entityType: "Product",
          entityId: id,
          before: { name: before.name, price: before.price.toString(), version: before.version },
          after: { name: product.name, price: product.price.toString(), version: product.version },
        },
      });
      return { product, stockChanged, warehouseId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    publishEvent("products.changed", { productId: id });
    if (result.stockChanged) publishEvent("stock.changed", { productId: id, warehouseId: result.warehouseId });
    return Response.json({ product: result.product });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return Response.json({ error: "Producto inexistente" }, { status: 404 });
    if (error instanceof Error && error.message === "PRODUCT_CONFLICT") return Response.json({ error: "El producto cambió en otra terminal. Recargá antes de guardar." }, { status: 409 });
    if (error instanceof Error && error.message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a abrir la ficha." }, { status: 409 });
    if (error instanceof Error && error.message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No está configurado el lugar principal de stock" }, { status: 400 });
    if (error instanceof Error && error.message === "KITCHEN_STATION_NOT_FOUND") return Response.json({ error: "La estación de comanda no es válida" }, { status: 400 });
    const message = error instanceof Error && error.message.includes("Unique constraint") ? "Ya existe un producto con ese SKU o código de barras" : "No se pudo guardar el producto";
    return Response.json({ error: message }, { status: 409 });
  }
}
