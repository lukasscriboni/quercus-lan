import { KitchenTicketStatus, OrderItemStatus, OrderStatus, Prisma } from "@prisma/client";

export const ACTIVE_KITCHEN_TICKET_STATUSES = [
  KitchenTicketStatus.NEW,
  KitchenTicketStatus.PREPARING,
  KitchenTicketStatus.READY,
] as const;

const NEXT_TICKET_STATUS: Partial<Record<KitchenTicketStatus, KitchenTicketStatus>> = {
  [KitchenTicketStatus.NEW]: KitchenTicketStatus.DELIVERED,
  [KitchenTicketStatus.PREPARING]: KitchenTicketStatus.DELIVERED,
  [KitchenTicketStatus.READY]: KitchenTicketStatus.DELIVERED,
};

export function nextKitchenTicketStatus(status: KitchenTicketStatus) {
  return NEXT_TICKET_STATUS[status] ?? null;
}

export function itemStatusForTicket(status: KitchenTicketStatus) {
  if (status === KitchenTicketStatus.NEW) return OrderItemStatus.SENT;
  if (status === KitchenTicketStatus.PREPARING) return OrderItemStatus.PREPARING;
  if (status === KitchenTicketStatus.READY) return OrderItemStatus.READY;
  if (status === KitchenTicketStatus.DELIVERED) return OrderItemStatus.DELIVERED;
  return OrderItemStatus.CANCELLED;
}

export async function sendOrderItemToKitchen(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    orderNumber: number;
    orderItemId: string;
    kitchenStationId: string | null;
    quantity: Prisma.Decimal;
  },
) {
  if (!input.kitchenStationId) {
    await tx.orderItem.update({ where: { id: input.orderItemId }, data: { status: OrderItemStatus.DELIVERED } });
    return null;
  }

  let ticket = await tx.kitchenTicket.findFirst({
    where: {
      orderId: input.orderId,
      kitchenStationId: input.kitchenStationId,
      status: KitchenTicketStatus.NEW,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!ticket) {
    ticket = await tx.kitchenTicket.create({
      data: {
        orderId: input.orderId,
        kitchenStationId: input.kitchenStationId,
        number: input.orderNumber,
      },
    });
  }
  await tx.kitchenTicketItem.create({
    data: {
      kitchenTicketId: ticket.id,
      orderItemId: input.orderItemId,
      quantity: input.quantity,
    },
  });
  await tx.orderItem.update({ where: { id: input.orderItemId }, data: { status: OrderItemStatus.SENT } });
  return ticket.id;
}

export async function syncPendingKitchenQuantity(
  tx: Prisma.TransactionClient,
  orderItemId: string,
  quantity: Prisma.Decimal,
) {
  const ticketItems = await tx.kitchenTicketItem.findMany({
    where: { orderItemId },
    include: { kitchenTicket: { select: { id: true, status: true } } },
  });
  if (ticketItems.some((row) => row.kitchenTicket.status !== KitchenTicketStatus.NEW)) {
    throw new Error("KITCHEN_LOCKED");
  }
  if (ticketItems.length) {
    await tx.kitchenTicketItem.updateMany({ where: { orderItemId }, data: { quantity } });
  }
}

export async function removePendingKitchenItem(tx: Prisma.TransactionClient, orderItemId: string) {
  const ticketItems = await tx.kitchenTicketItem.findMany({
    where: { orderItemId },
    include: { kitchenTicket: { select: { id: true, status: true } } },
  });
  if (ticketItems.some((row) => row.kitchenTicket.status !== KitchenTicketStatus.NEW)) {
    throw new Error("KITCHEN_LOCKED");
  }
  const ticketIds = [...new Set(ticketItems.map((row) => row.kitchenTicket.id))];
  await tx.kitchenTicketItem.deleteMany({ where: { orderItemId } });
  for (const ticketId of ticketIds) {
    const remaining = await tx.kitchenTicketItem.count({ where: { kitchenTicketId: ticketId } });
    if (remaining === 0) await tx.kitchenTicket.delete({ where: { id: ticketId } });
  }
}

export async function refreshOrderKitchenStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order || order.status === OrderStatus.PAID || order.status === OrderStatus.CANCELLED || order.status === OrderStatus.BILL_REQUESTED) return;
  const items = await tx.orderItem.findMany({
    where: { orderId, status: { not: OrderItemStatus.CANCELLED } },
    select: { status: true },
  });
  const allReady = items.length > 0 && items.every((item) => item.status === OrderItemStatus.READY || item.status === OrderItemStatus.DELIVERED);
  const nextStatus = allReady ? OrderStatus.READY : OrderStatus.IN_PROGRESS;
  if (order.status !== nextStatus) {
    await tx.order.update({ where: { id: orderId }, data: { status: nextStatus, version: { increment: 1 } } });
  }
}
