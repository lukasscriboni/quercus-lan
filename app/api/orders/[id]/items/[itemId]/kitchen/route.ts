import { KitchenStationType, OrderItemStatus, OrderStatus, OrderType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { sendOrderItemToKitchen } from "@/lib/kitchen";
import { enqueueKitchenTicketPrint } from "@/lib/kitchen-print-queue";
import { orderDetailsInclude, serializable, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  version: z.coerce.number().int().positive(),
  destination: z.enum([KitchenStationType.KITCHEN, KitchenStationType.BAR]).default(KitchenStationType.KITCHEN),
});

export async function POST(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "La consumición cambió. Volvé a intentar." }, { status: 400 });
  const { id, itemId } = await context.params;

  try {
    const result = await serializable(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId: id, order: { type: { in: [OrderType.TABLE, OrderType.COUNTER] }, branch: { organizationId: auth.user.organizationId } } },
        include: { order: true },
      });
      if (!item) throw new Error("NOT_FOUND");
      if (![OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED].some((status) => status === item.order.status)) throw new Error("NOT_EDITABLE");
      if (item.status !== OrderItemStatus.PENDING) throw new Error("ALREADY_SENT");

      const station = await tx.kitchenStation.findFirst({
        where: { branchId: item.order.branchId, type: parsed.data.destination, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (!station) throw new Error("STATION_NOT_CONFIGURED");

      const changed = await tx.orderItem.updateMany({
        where: { id: item.id, version: parsed.data.version, status: OrderItemStatus.PENDING },
        data: { kitchenStationId: station.id, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");

      const ticketId = await sendOrderItemToKitchen(tx, {
        orderId: item.orderId,
        orderNumber: item.order.number,
        orderItemId: item.id,
        kitchenStationId: station.id,
        quantity: item.quantity,
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "ORDER_ITEM_SENT_TO_PREPARATION",
          entityType: "OrderItem",
          entityId: item.id,
          metadata: { orderId: item.orderId, orderNumber: item.order.number, ticketId, quantity: item.quantity.toString(), destination: parsed.data.destination, stationId: station.id },
        },
      });
      const updated = await tx.order.findUniqueOrThrow({ where: { id: item.orderId }, include: orderDetailsInclude });
      return { order: updated, ticketId };
    });

    publishEvent("orders.changed", { orderId: id, tableId: result.order.diningTableId ?? undefined });
    publishEvent("kitchen.changed", { orderId: id, ticketId: result.ticketId ?? undefined });
    if (result.ticketId) void enqueueKitchenTicketPrint(result.ticketId, [itemId]).catch(() => undefined);
    return Response.json({ order: serializeOrder(result.order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Consumición inexistente" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La venta ya está cerrada" }, { status: 409 });
    if (message === "ALREADY_SENT") return Response.json({ error: "La consumición ya fue enviada" }, { status: 409 });
    if (message === "STATION_NOT_CONFIGURED") return Response.json({ error: `No hay una estación de ${parsed.data.destination === KitchenStationType.BAR ? "Barra" : "Cocina"} activa` }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La consumición cambió en otra terminal" }, { status: 409 });
    return Response.json({ error: "No se pudo enviar la consumición" }, { status: 409 });
  }
}
