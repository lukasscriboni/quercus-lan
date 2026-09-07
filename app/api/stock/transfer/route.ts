import { randomUUID } from "node:crypto";
import { Prisma, StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  reason: z.string().trim().min(3).max(300),
}).refine((data) => data.fromWarehouseId !== data.toWarehouseId, { message: "Elegí otro depósito de destino" });

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Transferencia inválida" }, { status: 400 });
  const data = parsed.data;
  try {
    const referenceId = randomUUID();
    await db.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.count({ where: { id: { in: [data.fromWarehouseId, data.toWarehouseId] }, branch: { organizationId: auth.user.organizationId } } });
      if (warehouses !== 2) throw new Error("Depósito inválido");
      const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: auth.user.organizationId } });
      if (!product) throw new Error("Producto inválido");
      const source = await tx.stock.findUnique({ where: { productId_warehouseId: { productId: data.productId, warehouseId: data.fromWarehouseId } } });
      if (!source || source.quantity.lt(data.quantity)) throw new Error("Stock insuficiente en el depósito de origen");
      const target = await tx.stock.upsert({
        where: { productId_warehouseId: { productId: data.productId, warehouseId: data.toWarehouseId } },
        create: { productId: data.productId, warehouseId: data.toWarehouseId, quantity: 0, minimum: 0 },
        update: {},
      });
      const sourceNext = source.quantity.sub(data.quantity);
      const targetNext = target.quantity.add(data.quantity);
      const sourceChanged = await tx.stock.updateMany({ where: { id: source.id, version: source.version }, data: { quantity: sourceNext, version: { increment: 1 } } });
      const targetChanged = await tx.stock.updateMany({ where: { id: target.id, version: target.version }, data: { quantity: targetNext, version: { increment: 1 } } });
      if (sourceChanged.count !== 1 || targetChanged.count !== 1) throw new Error("El stock cambió en otra terminal; reintentá");
      await tx.stockMovement.createMany({ data: [
        { productId: data.productId, warehouseId: data.fromWarehouseId, userId: auth.user.id, type: StockMovementType.TRANSFER_OUT, quantity: -data.quantity, previousQty: source.quantity, newQty: sourceNext, reason: data.reason, referenceType: "TRANSFER", referenceId },
        { productId: data.productId, warehouseId: data.toWarehouseId, userId: auth.user.id, type: StockMovementType.TRANSFER_IN, quantity: data.quantity, previousQty: target.quantity, newQty: targetNext, reason: data.reason, referenceType: "TRANSFER", referenceId },
      ] });
      await tx.auditLog.create({ data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "STOCK_TRANSFERRED", entityType: "Product", entityId: data.productId, metadata: { ...data, referenceId } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("stock.changed", { productId: data.productId, fromWarehouseId: data.fromWarehouseId, toWarehouseId: data.toWarehouseId });
    return Response.json({ ok: true, referenceId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo transferir" }, { status: 409 });
  }
}
