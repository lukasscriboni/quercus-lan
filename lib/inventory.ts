import { Prisma, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";

export async function adjustStock(input: {
  organizationId: string;
  productId: string;
  warehouseId: string;
  userId: string;
  auditUserId?: string;
  quantity: number;
  type: StockMovementType;
  reason: string;
  referenceType?: string;
  referenceId?: string;
}) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: input.productId, organizationId: input.organizationId } });
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, branch: { organizationId: input.organizationId } },
    });
    if (!product || !warehouse) throw new Error("Producto o depósito inexistente");
    const current = await tx.stock.upsert({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
      create: { productId: input.productId, warehouseId: input.warehouseId, quantity: 0, minimum: 0 },
      update: {},
    });
    const previous = new Prisma.Decimal(current.quantity);
    const next = previous.add(input.quantity);
    if (next.isNegative()) throw new Error("El movimiento dejaría el stock en negativo");
    const changed = await tx.stock.updateMany({
      where: { id: current.id, version: current.version },
      data: { quantity: next, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("CONFLICT: el stock cambió en otra terminal; reintentá");
    const movement = await tx.stockMovement.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        userId: input.userId,
        type: input.type,
        quantity: input.quantity,
        previousQty: previous,
        newQty: next,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.auditUserId ?? input.userId,
        action: "STOCK_ADJUSTED",
        entityType: "Stock",
        entityId: current.id,
        before: { quantity: previous.toString(), version: current.version },
        after: { quantity: next.toString(), version: current.version + 1, movementId: movement.id, responsibleUserId: input.userId },
      },
    });
    return movement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
