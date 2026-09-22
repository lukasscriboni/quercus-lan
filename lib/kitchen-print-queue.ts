import { db } from "@/lib/db";

export type KitchenPrintJob = {
  id: string;
  stationType: "KITCHEN" | "BAR";
  stationName: string;
  orderNumber: number;
  location: string;
  openedBy: string;
  createdAt: string;
  items: { name: string; quantity: string; notes: string | null }[];
};

const queueKey = Symbol.for("quercus.kitchenPrintQueue");
const globalQueue = globalThis as typeof globalThis & { [queueKey]?: KitchenPrintJob[] };

function queue() {
  globalQueue[queueKey] ??= [];
  return globalQueue[queueKey];
}

export async function enqueueKitchenTicketPrint(ticketId: string, orderItemIds?: string[]) {
  const ticket = await db.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: {
      kitchenStation: { select: { name: true, type: true } },
      order: {
        select: {
          number: true,
          type: true,
          openedAt: true,
          openedBy: { select: { displayName: true } },
          diningTable: { select: { name: true, sector: { select: { name: true } } } },
        },
      },
      items: {
        where: orderItemIds?.length ? { orderItemId: { in: orderItemIds } } : undefined,
        include: { orderItem: { select: { nameSnapshot: true, notes: true } } },
      },
    },
  });
  if (!ticket || ticket.items.length === 0 || (ticket.kitchenStation.type !== "KITCHEN" && ticket.kitchenStation.type !== "BAR")) return;
  const location = ticket.order.diningTable
    ? `${ticket.order.diningTable.sector.name} · ${ticket.order.diningTable.name}`
    : ticket.order.type === "COUNTER" ? `Venta directa #${ticket.order.number}` : `Pedido #${ticket.order.number}`;
  queue().push({
    id: `${ticket.id}:${Date.now()}`,
    stationType: ticket.kitchenStation.type,
    stationName: ticket.kitchenStation.name,
    orderNumber: ticket.order.number,
    location,
    openedBy: ticket.order.openedBy.displayName,
    createdAt: new Date().toISOString(),
    items: ticket.items.map((item) => ({ name: item.orderItem.nameSnapshot, quantity: item.quantity.toString(), notes: item.orderItem.notes })),
  });
}

export function drainKitchenPrintQueue() {
  return queue().splice(0);
}
