import { OrderStatus, OrderType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES, orderDetailsInclude, serializable, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const createSchema = z.object({
  notes: z.string().trim().max(120).nullable().optional(),
});

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_VIEW);
  if ("error" in auth) return auth.error;
  const branch = await db.branch.findFirst({
    where: { organizationId: auth.user.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });
  const orders = await db.order.findMany({
    where: { branchId: branch.id, type: OrderType.COUNTER, currentAccountId: null, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    orderBy: { openedAt: "desc" },
    include: orderDetailsInclude,
  });
  return Response.json({ branch, orders: orders.map(serializeOrder) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "La referencia de la venta no es válida" }, { status: 400 });

  try {
    const order = await serializable(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { organizationId: auth.user.organizationId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!branch) throw new Error("BRANCH_NOT_FOUND");
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${branch.id})) IS NULL AS locked`;
      const latest = await tx.order.aggregate({ where: { branchId: branch.id }, _max: { number: true } });
      const created = await tx.order.create({
        data: {
          branchId: branch.id,
          openedById: auth.user.id,
          number: (latest._max.number ?? 0) + 1,
          type: OrderType.COUNTER,
          status: OrderStatus.OPEN,
          guestCount: 1,
          notes: parsed.data.notes || null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "DIRECT_SALE_OPENED",
          entityType: "Order",
          entityId: created.id,
          after: { number: created.number, notes: created.notes, status: created.status },
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderDetailsInclude });
    });
    publishEvent("orders.changed", { orderId: order.id });
    return Response.json({ order: serializeOrder(order) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BRANCH_NOT_FOUND") return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });
    return Response.json({ error: "No se pudo abrir la venta directa" }, { status: 409 });
  }
}
