import { KitchenTicketStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { itemStatusForTicket, nextKitchenTicketStatus, refreshOrderKitchenStatus } from "@/lib/kitchen";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  version: z.coerce.number().int().positive(),
  status: z.literal("DELIVERED"),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.KITCHEN_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Cambio de estado inválido" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const ticket = await tx.kitchenTicket.findFirst({
        where: { id, kitchenStation: { branch: { organizationId: auth.user.organizationId } } },
        include: { items: { select: { orderItemId: true } } },
      });
      if (!ticket) throw new Error("NOT_FOUND");
      const requestedStatus = parsed.data.status as KitchenTicketStatus;
      if (nextKitchenTicketStatus(ticket.status) !== requestedStatus) throw new Error("INVALID_TRANSITION");
      const now = new Date();
      const changed = await tx.kitchenTicket.updateMany({
        where: { id, version: parsed.data.version, status: ticket.status },
        data: {
          status: requestedStatus,
          version: { increment: 1 },
          ...(requestedStatus === KitchenTicketStatus.DELIVERED ? { deliveredAt: now } : {}),
        },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      const itemIds = ticket.items.map((item) => item.orderItemId);
      if (itemIds.length) {
        await tx.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { status: itemStatusForTicket(requestedStatus) } });
      }
      await refreshOrderKitchenStatus(tx, ticket.orderId);
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "KITCHEN_TICKET_STATUS_CHANGED",
          entityType: "KitchenTicket",
          entityId: ticket.id,
          before: { status: ticket.status, version: ticket.version },
          after: { status: requestedStatus, version: ticket.version + 1 },
          metadata: { orderId: ticket.orderId, stationId: ticket.kitchenStationId },
        },
      });
      return { orderId: ticket.orderId, status: requestedStatus };
    });
    publishEvent("kitchen.changed", { ticketId: id, orderId: result.orderId, status: result.status });
    publishEvent("orders.changed", { orderId: result.orderId });
    publishEvent("floor.changed", { orderId: result.orderId });
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Comanda inexistente" }, { status: 404 });
    if (message === "INVALID_TRANSITION") return Response.json({ error: "La comanda ya cambió de estado" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "Otra terminal actualizó esta comanda" }, { status: 409 });
    return Response.json({ error: "No se pudo actualizar la comanda" }, { status: 409 });
  }
}
