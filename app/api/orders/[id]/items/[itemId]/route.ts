import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { lineTotal, recalculateOrder, serializable, serializeOrder } from "@/lib/order-service";
import { applyOrderStockDelta } from "@/lib/order-stock";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  version: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(100),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Cantidad inválida" }, { status: 400 });
  const { id, itemId } = await context.params;
  try {
    const result = await serializable(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: id, order: { branch: { organizationId: auth.user.organizationId } } }, include: { order: true } });
      if (!item) throw new Error("NOT_FOUND");
      if (item.order.status !== OrderStatus.OPEN && item.order.status !== OrderStatus.IN_PROGRESS) throw new Error("NOT_EDITABLE");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const changed = await tx.orderItem.updateMany({
        where: { id: itemId, version: parsed.data.version },
        data: { quantity, total: lineTotal(item.unitPrice, quantity, item.discount), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      const stockChanged = await applyOrderStockDelta(tx, {
        branchId: item.order.branchId,
        orderId: id,
        orderNumber: item.order.number,
        orderItemId: item.id,
        productId: item.productId,
        quantityDelta: quantity.sub(item.quantity),
        userId: auth.user.id,
      });
      const updated = await recalculateOrder(tx, id, true);
      await tx.auditLog.create({
        data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "ORDER_ITEM_QUANTITY_CHANGED", entityType: "OrderItem", entityId: itemId, before: { quantity: item.quantity.toString() }, after: { quantity: quantity.toString() }, metadata: { orderId: id } },
      });
      return { order: updated, stockChanged };
    });
    publishEvent("orders.changed", { orderId: id, tableId: result.order.diningTableId ?? undefined });
    publishEvent("floor.changed", { tableId: result.order.diningTableId ?? undefined });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: id });
    return Response.json({ order: serializeOrder(result.order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Consumición inexistente" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La cuenta ya fue solicitada" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La consumición cambió en otra terminal" }, { status: 409 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo cambiar la cantidad" }, { status: 409 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const { id, itemId } = await context.params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  try {
    const result = await serializable(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: id, order: { branch: { organizationId: auth.user.organizationId } } }, include: { order: true } });
      if (!item) throw new Error("NOT_FOUND");
      if (item.order.status !== OrderStatus.OPEN && item.order.status !== OrderStatus.IN_PROGRESS) throw new Error("NOT_EDITABLE");
      if (!Number.isInteger(version) || version !== item.version) throw new Error("CONFLICT");
      const stockChanged = await applyOrderStockDelta(tx, {
        branchId: item.order.branchId,
        orderId: id,
        orderNumber: item.order.number,
        orderItemId: item.id,
        productId: item.productId,
        quantityDelta: item.quantity.negated(),
        userId: auth.user.id,
      });
      await tx.orderItem.delete({ where: { id: itemId } });
      const updated = await recalculateOrder(tx, id);
      await tx.auditLog.create({
        data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "ORDER_ITEM_REMOVED", entityType: "OrderItem", entityId: itemId, before: { name: item.nameSnapshot, quantity: item.quantity.toString(), total: item.total.toString() }, metadata: { orderId: id } },
      });
      return { order: updated, stockChanged };
    });
    publishEvent("orders.changed", { orderId: id, tableId: result.order.diningTableId ?? undefined });
    publishEvent("floor.changed", { tableId: result.order.diningTableId ?? undefined });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: id });
    return Response.json({ order: serializeOrder(result.order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Consumición inexistente" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La cuenta ya fue solicitada" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La consumición cambió en otra terminal" }, { status: 409 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo quitar la consumición" }, { status: 409 });
  }
}
