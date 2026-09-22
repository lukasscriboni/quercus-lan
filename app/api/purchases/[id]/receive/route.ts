import { Prisma, PurchaseOrderStatus, StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  items: z.array(z.object({ itemId: z.string().min(1), quantity: z.coerce.number().finite().positive().max(1_000_000) })).min(1),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Indicá las cantidades recibidas" }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, branch: { organizationId: auth.user.organizationId } },
        include: { supplier: true, items: { include: { product: true } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status === PurchaseOrderStatus.CANCELLED || order.status === PurchaseOrderStatus.RECEIVED) throw new Error("CLOSED");
      const warehouse = await tx.warehouse.findFirst({ where: { branchId: order.branchId, isActive: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
      if (!warehouse) throw new Error("NO_WAREHOUSE");
      const requested = new Map(parsed.data.items.map((item) => [item.itemId, new Prisma.Decimal(item.quantity)]));
      if ([...requested.keys()].some((itemId) => !order.items.some((item) => item.id === itemId))) throw new Error("INVALID_ITEM");
      for (const item of order.items) {
        const receiveQty = requested.get(item.id);
        if (!receiveQty) continue;
        const outstanding = new Prisma.Decimal(item.quantity).sub(item.receivedQty);
        if (receiveQty.greaterThan(outstanding)) throw new Error(`OVER:${item.product.name}`);
        const stock = await tx.stock.upsert({
          where: { productId_warehouseId: { productId: item.productId, warehouseId: warehouse.id } },
          create: { productId: item.productId, warehouseId: warehouse.id, quantity: 0, minimum: 0 },
          update: {},
        });
        const previous = new Prisma.Decimal(stock.quantity);
        const next = previous.add(receiveQty);
        const changed = await tx.stock.updateMany({ where: { id: stock.id, version: stock.version }, data: { quantity: next, version: { increment: 1 } } });
        if (changed.count !== 1) throw new Error("CONFLICT");
        await tx.stockMovement.create({ data: { productId: item.productId, warehouseId: warehouse.id, userId: auth.user.id, type: StockMovementType.PURCHASE, quantity: receiveQty, previousQty: previous, newQty: next, reason: `Recepción compra #${order.number} · ${order.supplier.name}`, referenceType: "PURCHASE_ORDER", referenceId: order.id } });
        await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: receiveQty } } });
        await tx.product.update({ where: { id: item.productId }, data: { cost: item.unitCost, supplierId: order.supplierId, version: { increment: 1 } } });
      }
      const refreshed = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      const complete = refreshed.items.every((item) => new Prisma.Decimal(item.receivedQty).greaterThanOrEqualTo(item.quantity));
      const status = complete ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status, receivedAt: complete ? new Date() : null, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "PURCHASE_ORDER_RECEIVED", entityType: "PurchaseOrder", entityId: order.id, after: { status, items: parsed.data.items } } });
      return { orderId: order.id, status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("purchases.changed", result);
    publishEvent("stock.changed", { purchaseOrderId: id });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "La compra no existe" }, { status: 404 });
    if (message === "CLOSED") return Response.json({ error: "La compra ya está cerrada" }, { status: 400 });
    if (message === "NO_WAREHOUSE") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 400 });
    if (message === "INVALID_ITEM") return Response.json({ error: "Uno de los artículos no pertenece a esta compra" }, { status: 400 });
    if (message.startsWith("OVER:")) return Response.json({ error: `La cantidad supera lo pendiente de ${message.slice(5)}` }, { status: 400 });
    return Response.json({ error: message === "CONFLICT" ? "El stock cambió en otra terminal. Volvé a intentar." : "No se pudo registrar la recepción" }, { status: message === "CONFLICT" ? 409 : 400 });
  }
}
