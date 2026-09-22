import { KitchenStationType, OrderItemStatus, OrderStatus, OrderType } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { orderDetailsInclude, serializable, serializeOrder } from "@/lib/order-service";
import { sumItemQuantities } from "@/lib/order-item-summary";
import { enqueueKitchenTicketPrint } from "@/lib/kitchen-print-queue";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  try {
    const result = await serializable(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, type: OrderType.TABLE, branch: { organizationId: auth.user.organizationId } },
        include: {
          items: {
            where: { status: OrderItemStatus.PENDING },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (![OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY].some((status) => status === order.status)) throw new Error("NOT_EDITABLE");
      if (order.items.length === 0) throw new Error("NOTHING_PENDING");

      const needsDefaultKitchen = order.items.some((item) => !item.kitchenStationId);
      const defaultKitchen = needsDefaultKitchen
        ? await tx.kitchenStation.findFirst({
            where: { branchId: order.branchId, type: KitchenStationType.KITCHEN, isActive: true },
            orderBy: { createdAt: "asc" },
          })
        : null;
      if (needsDefaultKitchen && !defaultKitchen) throw new Error("KITCHEN_NOT_CONFIGURED");

      const itemsByStation = new Map<string, typeof order.items>();
      for (const item of order.items) {
        const kitchenStationId = item.kitchenStationId ?? defaultKitchen?.id;
        if (!kitchenStationId) throw new Error("KITCHEN_NOT_CONFIGURED");
        const stationItems = itemsByStation.get(kitchenStationId) ?? [];
        stationItems.push(item);
        itemsByStation.set(kitchenStationId, stationItems);
      }

      const ticketIds: string[] = [];
      for (const [kitchenStationId, stationItems] of itemsByStation) {
        const changed = await tx.orderItem.updateMany({
          where: { id: { in: stationItems.map((item) => item.id) }, status: OrderItemStatus.PENDING },
          data: { status: OrderItemStatus.SENT, kitchenStationId },
        });
        if (changed.count !== stationItems.length) throw new Error("CONFLICT");
        const ticket = await tx.kitchenTicket.create({
          data: {
            orderId: order.id,
            kitchenStationId,
            number: order.number,
            items: {
              create: stationItems.map((item) => ({ orderItemId: item.id, quantity: item.quantity })),
            },
          },
        });
        ticketIds.push(ticket.id);
      }

      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "ORDER_SENT_TO_KITCHEN",
          entityType: "Order",
          entityId: order.id,
          metadata: {
            orderNumber: order.number,
            itemLines: order.items.length,
            quantity: sumItemQuantities(order.items),
            ticketIds,
          },
        },
      });

      const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailsInclude });
      return {
        order: updated,
        tableId: updated.diningTableId,
        sentQuantity: sumItemQuantities(order.items),
        ticketIds,
      };
    });

    publishEvent("orders.changed", { orderId: id, tableId: result.tableId ?? undefined });
    publishEvent("floor.changed", { tableId: result.tableId ?? undefined });
    publishEvent("kitchen.changed", { orderId: id, ticketIds: result.ticketIds });
    for (const ticketId of result.ticketIds) void enqueueKitchenTicketPrint(ticketId).catch(() => undefined);
    return Response.json({ order: serializeOrder(result.order), sentQuantity: result.sentQuantity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "La cuenta de mesa no existe" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La cuenta ya no admite nuevas comandas" }, { status: 409 });
    if (message === "NOTHING_PENDING") return Response.json({ error: "No hay consumiciones pendientes para enviar a Cocina" }, { status: 409 });
    if (message === "KITCHEN_NOT_CONFIGURED") return Response.json({ error: "No hay una estación de Cocina activa para recibir el pedido" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La cuenta cambió en otra terminal. Volvé a intentarlo." }, { status: 409 });
    return Response.json({ error: "No se pudo enviar el pedido a Cocina" }, { status: 409 });
  }
}
