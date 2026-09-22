import { OrderItemStatus, OrderStatus, OrderType, Prisma, TableStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES, getTableReleaseBlocker, orderDetailsInclude, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_VIEW);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const order = await db.order.findFirst({
    where: { id, branch: { organizationId: auth.user.organizationId } },
    include: orderDetailsInclude,
  });
  return order ? Response.json({ order: serializeOrder(order) }) : Response.json({ error: "Cuenta inexistente" }, { status: 404 });
}

const schema = z.object({
  version: z.coerce.number().int().positive(),
  guestCount: z.coerce.number().int().min(1).max(50).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.enum([OrderStatus.IN_PROGRESS, OrderStatus.BILL_REQUESTED]).optional(),
}).refine((data) => Object.keys(data).some((key) => key !== "version"));

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Datos de la cuenta inválidos" }, { status: 400 });
  const { id } = await context.params;
  try {
    const order = await db.$transaction(async (tx) => {
      const before = await tx.order.findFirst({ where: { id, branch: { organizationId: auth.user.organizationId } } });
      if (!before) throw new Error("NOT_FOUND");
      if (!ACTIVE_ORDER_STATUSES.some((status) => status === before.status)) throw new Error("CLOSED");
      if (parsed.data.status === OrderStatus.BILL_REQUESTED) {
        const pendingKitchenItems = await tx.orderItem.count({
          where: { orderId: id, status: OrderItemStatus.PENDING, kitchenStationId: { not: null } },
        });
        if (pendingKitchenItems > 0) throw new Error("KITCHEN_PENDING");
      }
      const changed = await tx.order.updateMany({
        where: { id, version: parsed.data.version },
        data: {
          guestCount: parsed.data.guestCount,
          notes: parsed.data.notes,
          status: parsed.data.status,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      if (before.diningTableId && parsed.data.status) {
        await tx.diningTable.update({
          where: { id: before.diningTableId },
          data: { status: parsed.data.status === OrderStatus.BILL_REQUESTED ? TableStatus.BILL_REQUESTED : TableStatus.OCCUPIED, version: { increment: 1 } },
        });
      }
      const updated = await tx.order.findUniqueOrThrow({ where: { id }, include: orderDetailsInclude });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: before.status === updated.status ? "ORDER_UPDATED" : "ORDER_STATUS_CHANGED",
          entityType: "Order",
          entityId: id,
          before: { guestCount: before.guestCount, status: before.status, version: before.version },
          after: { guestCount: updated.guestCount, status: updated.status, version: updated.version },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("orders.changed", { orderId: id, tableId: order.diningTableId ?? undefined });
    publishEvent("floor.changed", { tableId: order.diningTableId ?? undefined });
    return Response.json({ order: serializeOrder(order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Cuenta inexistente" }, { status: 404 });
    if (message === "CLOSED") return Response.json({ error: "La cuenta ya está cerrada" }, { status: 409 });
    if (message === "KITCHEN_PENDING") return Response.json({ error: "Primero enviá las consumiciones pendientes a Cocina" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La cuenta cambió en otra terminal. Se actualizaron los datos." }, { status: 409 });
    return Response.json({ error: "No se pudo actualizar la cuenta" }, { status: 409 });
  }
}

const cancelSchema = z.object({ version: z.coerce.number().int().positive() });

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = cancelSchema.safeParse({ version: new URL(request.url).searchParams.get("version") });
  if (!parsed.success) return Response.json({ error: "La versión de la cuenta no es válida" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.order.findFirst({
        where: { id, type: OrderType.TABLE, branch: { organizationId: auth.user.organizationId } },
        include: {
          diningTable: { select: { id: true, name: true, status: true, version: true } },
          items: { where: { status: { not: OrderItemStatus.CANCELLED } }, select: { id: true } },
          payments: { select: { id: true } },
        },
      });
      if (!before || !before.diningTable) throw new Error("NOT_FOUND");
      const blocker = getTableReleaseBlocker(before.status, before.items.length, before.payments.length);
      if (blocker) throw new Error(blocker);
      if (![TableStatus.OCCUPIED, TableStatus.BILL_REQUESTED].some((status) => status === before.diningTable?.status)) throw new Error("TABLE_STATE");

      const anotherActiveOrder = await tx.order.findFirst({
        where: { diningTableId: before.diningTable.id, id: { not: before.id }, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { id: true },
      });
      if (anotherActiveOrder) throw new Error("TABLE_HAS_ANOTHER_ORDER");

      const changedOrder = await tx.order.updateMany({
        where: { id: before.id, version: parsed.data.version, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        data: { status: OrderStatus.CANCELLED, closedAt: new Date(), version: { increment: 1 } },
      });
      if (changedOrder.count !== 1) throw new Error("CONFLICT");

      const changedTable = await tx.diningTable.updateMany({
        where: {
          id: before.diningTable.id,
          version: before.diningTable.version,
          status: { in: [TableStatus.OCCUPIED, TableStatus.BILL_REQUESTED] },
        },
        data: { status: TableStatus.AVAILABLE, version: { increment: 1 } },
      });
      if (changedTable.count !== 1) throw new Error("CONFLICT");

      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "TABLE_ORDER_CANCELLED",
          entityType: "Order",
          entityId: before.id,
          before: { number: before.number, status: before.status, tableId: before.diningTable.id, tableName: before.diningTable.name, version: before.version },
          after: { status: OrderStatus.CANCELLED, tableStatus: TableStatus.AVAILABLE, reason: "OPENED_BY_MISTAKE" },
        },
      });

      return { orderId: before.id, tableId: before.diningTable.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    publishEvent("orders.changed", result);
    publishEvent("floor.changed", { tableId: result.tableId });
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "La cuenta de mesa no existe" }, { status: 404 });
    if (message === "CLOSED") return Response.json({ error: "La cuenta ya está cerrada" }, { status: 409 });
    if (message === "NOT_EMPTY") return Response.json({ error: "La mesa tiene consumiciones. Quitalas o completá el cobro antes de liberarla." }, { status: 409 });
    if (message === "HAS_PAYMENT") return Response.json({ error: "La cuenta tiene pagos registrados y no puede cancelarse como apertura accidental." }, { status: 409 });
    if (message === "TABLE_STATE") return Response.json({ error: "El estado de la mesa cambió en otra terminal. Volvé a cargar el salón." }, { status: 409 });
    if (message === "TABLE_HAS_ANOTHER_ORDER") return Response.json({ error: "La mesa tiene otra cuenta activa y no puede liberarse." }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La cuenta cambió en otra terminal. Volvé a cargarla." }, { status: 409 });
    return Response.json({ error: "No se pudo liberar la mesa" }, { status: 409 });
  }
}
