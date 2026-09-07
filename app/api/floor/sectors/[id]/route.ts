import { OrderStatus, Prisma, ReservationStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
}).refine((data) => data.name !== undefined || data.sortOrder !== undefined);

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Datos del sector inválidos" }, { status: 400 });
  const { id } = await context.params;
  const before = await db.sector.findFirst({
    where: { id, branch: { organizationId: auth.user.organizationId } },
  });
  if (!before) return Response.json({ error: "Sector inexistente" }, { status: 404 });
  if (parsed.data.name) {
    const duplicate = await db.sector.findFirst({
      where: {
        branchId: before.branchId,
        id: { not: id },
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
    });
    if (duplicate) return Response.json({ error: "Ya existe un sector con ese nombre" }, { status: 409 });
  }

  const sector = await db.$transaction(async (tx) => {
    const updated = await tx.sector.update({ where: { id }, data: parsed.data });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "FLOOR_SECTOR_UPDATED",
        entityType: "Sector",
        entityId: id,
        before: { name: before.name, sortOrder: before.sortOrder },
        after: { name: updated.name, sortOrder: updated.sortOrder },
      },
    });
    return updated;
  });
  publishEvent("floor.changed", { sectorId: id });
  return Response.json({ sector });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  try {
    const result = await db.$transaction(async (tx) => {
      const sector = await tx.sector.findFirst({
        where: { id, branch: { organizationId: auth.user.organizationId } },
        include: {
          tables: {
            select: {
              id: true,
              orders: {
                where: { status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED] } },
                select: { id: true },
                take: 1,
              },
              reservations: {
                where: {
                  status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
                  reservedFor: { gte: new Date() },
                },
                select: { id: true },
                take: 1,
              },
            },
          },
          _count: { select: { elements: true } },
        },
      });
      if (!sector) throw new Error("NOT_FOUND");
      const blockedTables = sector.tables.filter((table) => table.orders.length || table.reservations.length).length;
      if (blockedTables) throw new Error(`BLOCKED:${blockedTables}`);

      await tx.sector.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "FLOOR_SECTOR_DELETED",
          entityType: "Sector",
          entityId: id,
          before: { name: sector.name, tables: sector.tables.length, elements: sector._count.elements },
        },
      });
      return { tables: sector.tables.length, elements: sector._count.elements };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("floor.changed", { sectorId: id });
    return Response.json({ ok: true, deletedTables: result.tables, deletedElements: result.elements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Sector inexistente" }, { status: 404 });
    if (message.startsWith("BLOCKED:")) {
      const count = Number(message.split(":")[1]);
      return Response.json({ error: `No se puede eliminar: ${count} ${count === 1 ? "mesa tiene" : "mesas tienen"} pedidos o reservas activas.` }, { status: 409 });
    }
    return Response.json({ error: "No se pudo eliminar el sector. Volvé a intentarlo." }, { status: 409 });
  }
}
