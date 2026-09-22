import { KitchenStationType, KitchenTicketStatus, OrderStatus } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_KITCHEN_TICKET_STATUSES } from "@/lib/kitchen";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.KITCHEN_VIEW);
  if ("error" in auth) return auth.error;
  const requestedType = new URL(request.url).searchParams.get("stationType");
  const stationType = requestedType === KitchenStationType.KITCHEN || requestedType === KitchenStationType.BAR ? requestedType : null;
  const recentSince = new Date(Date.now() - 60 * 60 * 1000);
  const [stations, tickets] = await Promise.all([
    db.kitchenStation.findMany({
      where: { branch: { organizationId: auth.user.organizationId }, isActive: true, ...(stationType ? { type: stationType } : {}) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    db.kitchenTicket.findMany({
      where: {
        kitchenStation: { branch: { organizationId: auth.user.organizationId }, ...(stationType ? { type: stationType } : {}) },
        OR: [
          { status: { in: [...ACTIVE_KITCHEN_TICKET_STATUSES] } },
          { status: KitchenTicketStatus.DELIVERED, deliveredAt: { gte: recentSince } },
        ],
        order: { status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED] } },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 250,
      include: {
        kitchenStation: { select: { id: true, name: true, type: true } },
        order: {
          select: {
            id: true,
            number: true,
            type: true,
            notes: true,
            openedAt: true,
            diningTable: { select: { name: true, sector: { select: { name: true } } } },
            openedBy: { select: { displayName: true } },
          },
        },
        items: {
          include: {
            orderItem: { select: { id: true, nameSnapshot: true, notes: true, status: true } },
          },
        },
      },
    }),
  ]);

  return Response.json({
    stations,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      number: ticket.number,
      status: ticket.status,
      version: ticket.version,
      createdAt: ticket.createdAt,
      startedAt: ticket.startedAt,
      readyAt: ticket.readyAt,
      deliveredAt: ticket.deliveredAt,
      station: ticket.kitchenStation,
      order: ticket.order,
      items: ticket.items.map((item) => ({
        id: item.id,
        orderItemId: item.orderItem.id,
        name: item.orderItem.nameSnapshot,
        quantity: item.quantity.toString(),
        notes: item.orderItem.notes,
        status: item.orderItem.status,
      })),
    })),
  });
}
