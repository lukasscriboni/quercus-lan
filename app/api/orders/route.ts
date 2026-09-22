import { OrderType, TableStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { ACTIVE_ORDER_STATUSES, orderDetailsInclude, serializable, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  diningTableId: z.string().min(1),
  tableVersion: z.coerce.number().int().positive(),
  guestCount: z.coerce.number().int().min(1).max(50).default(1),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "No se pudieron validar los datos de la mesa" }, { status: 400 });
  try {
    const order = await serializable(async (tx) => {
      const table = await tx.diningTable.findFirst({
        where: { id: parsed.data.diningTableId, sector: { branch: { organizationId: auth.user.organizationId } } },
        include: { sector: { include: { branch: true } } },
      });
      if (!table) throw new Error("TABLE_NOT_FOUND");
      const active = await tx.order.findFirst({
        where: { diningTableId: table.id, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { id: true },
      });
      if (active) throw new Error(`ALREADY_OPEN:${active.id}`);
      if (table.status !== TableStatus.AVAILABLE && table.status !== TableStatus.RESERVED) throw new Error("TABLE_UNAVAILABLE");

      const changed = await tx.diningTable.updateMany({
        where: { id: table.id, version: parsed.data.tableVersion, status: { in: [TableStatus.AVAILABLE, TableStatus.RESERVED] } },
        data: { status: TableStatus.OCCUPIED, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("TABLE_CHANGED");

      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${table.sector.branchId})) IS NULL AS locked`;
      const latest = await tx.order.aggregate({ where: { branchId: table.sector.branchId }, _max: { number: true } });
      const created = await tx.order.create({
        data: {
          branchId: table.sector.branchId,
          diningTableId: table.id,
          openedById: auth.user.id,
          number: (latest._max.number ?? 0) + 1,
          type: OrderType.TABLE,
          guestCount: parsed.data.guestCount,
          notes: parsed.data.notes || null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "ORDER_OPENED",
          entityType: "Order",
          entityId: created.id,
          after: { number: created.number, tableId: table.id, tableName: table.name, guestCount: created.guestCount },
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderDetailsInclude });
    });
    publishEvent("orders.changed", { orderId: order.id, tableId: order.diningTableId ?? undefined });
    publishEvent("floor.changed", { tableId: order.diningTableId ?? undefined });
    return Response.json({ order: serializeOrder(order) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TABLE_NOT_FOUND") return Response.json({ error: "Mesa inexistente" }, { status: 404 });
    if (message.startsWith("ALREADY_OPEN:")) return Response.json({ error: "La mesa ya tiene una cuenta abierta", orderId: message.split(":")[1] }, { status: 409 });
    if (message === "TABLE_UNAVAILABLE") return Response.json({ error: "La mesa no está disponible para abrir una cuenta" }, { status: 409 });
    if (message === "TABLE_CHANGED") return Response.json({ error: "La mesa cambió en otra terminal. Recargá el salón." }, { status: 409 });
    return Response.json({ error: "No se pudo abrir la cuenta. Volvé a intentarlo." }, { status: 409 });
  }
}
