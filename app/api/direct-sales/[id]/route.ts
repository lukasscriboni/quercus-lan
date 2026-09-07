import { OrderItemStatus, OrderStatus, OrderType } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { serializable } from "@/lib/order-service";
import { applyOrderStockDelta } from "@/lib/order-stock";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  if (!Number.isInteger(version) || version < 1) return Response.json({ error: "La versión de la venta no es válida" }, { status: 400 });

  try {
    const result = await serializable(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, type: OrderType.COUNTER, branch: { organizationId: auth.user.organizationId } },
        include: { items: { where: { status: { not: OrderItemStatus.CANCELLED } } } },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.IN_PROGRESS) throw new Error("NOT_EDITABLE");
      if (order.version !== version) throw new Error("CONFLICT");

      let stockChanged = false;
      for (const item of order.items) {
        stockChanged = (await applyOrderStockDelta(tx, {
          branchId: order.branchId,
          orderId: order.id,
          orderNumber: order.number,
          orderItemId: item.id,
          productId: item.productId,
          quantityDelta: item.quantity.negated(),
          userId: auth.user.id,
        })) || stockChanged;
      }
      const changed = await tx.order.updateMany({
        where: { id: order.id, version, status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] } },
        data: { status: OrderStatus.CANCELLED, closedAt: new Date(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { status: OrderItemStatus.CANCELLED } });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "DIRECT_SALE_CANCELLED",
          entityType: "Order",
          entityId: order.id,
          before: { number: order.number, status: order.status, total: order.total.toString(), version: order.version },
          after: { status: OrderStatus.CANCELLED },
        },
      });
      return { orderId: order.id, stockChanged };
    });
    publishEvent("orders.changed", { orderId: result.orderId });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: result.orderId });
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "La venta directa no existe" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La venta ya fue cobrada o cerrada" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La venta cambió en otra terminal. Volvé a cargarla." }, { status: 409 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo cancelar la venta directa" }, { status: 409 });
  }
}
