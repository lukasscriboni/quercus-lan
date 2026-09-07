import { OrderStatus, Prisma, ReservationStatus, TableStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeFloorRect } from "@/lib/floor";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(60).optional(),
  capacity: z.coerce.number().int().min(1).max(30).optional(),
  status: z.nativeEnum(TableStatus).optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  width: z.coerce.number().finite().optional(),
  height: z.coerce.number().finite().optional(),
  rotation: z.coerce.number().finite().optional(),
  shape: z.enum(["ROUND", "SQUARE", "RECTANGLE"]).optional(),
}).refine((data) => Object.keys(data).some((key) => key !== "version"));

function tableSnapshot(table: {
  name: string; capacity: number; status: TableStatus; x: Prisma.Decimal; y: Prisma.Decimal;
  width: Prisma.Decimal; height: Prisma.Decimal; rotation: Prisma.Decimal; shape: string; version: number;
}) {
  return {
    name: table.name,
    capacity: table.capacity,
    status: table.status,
    x: Number(table.x),
    y: Number(table.y),
    width: Number(table.width),
    height: Number(table.height),
    rotation: Number(table.rotation),
    shape: table.shape,
    version: table.version,
  };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Datos de la mesa inválidos" }, { status: 400 });
  const { id } = await context.params;
  const before = await db.diningTable.findFirst({
    where: { id, sector: { branch: { organizationId: auth.user.organizationId } } },
  });
  if (!before) return Response.json({ error: "Mesa inexistente" }, { status: 404 });
  if (parsed.data.name && parsed.data.name.toLocaleLowerCase() !== before.name.toLocaleLowerCase()) {
    const duplicate = await db.diningTable.findFirst({
      where: { sectorId: before.sectorId, id: { not: id }, name: { equals: parsed.data.name, mode: "insensitive" } },
    });
    if (duplicate) return Response.json({ error: "Ya existe una mesa con ese nombre en el sector" }, { status: 409 });
  }

  const requested = parsed.data;
  const rect = normalizeFloorRect({
    x: requested.x ?? Number(before.x),
    y: requested.y ?? Number(before.y),
    width: requested.width ?? Number(before.width),
    height: requested.height ?? Number(before.height),
    rotation: requested.rotation ?? Number(before.rotation),
  }, { minWidth: 70, minHeight: 60 });
  try {
    const table = await db.$transaction(async (tx) => {
      const changed = await tx.diningTable.updateMany({
        where: { id, version: requested.version },
        data: {
          name: requested.name,
          capacity: requested.capacity,
          status: requested.status,
          shape: requested.shape,
          ...rect,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      const updated = await tx.diningTable.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: before.status === updated.status ? "DINING_TABLE_UPDATED" : "DINING_TABLE_STATUS_CHANGED",
          entityType: "DiningTable",
          entityId: id,
          before: tableSnapshot(before),
          after: tableSnapshot(updated),
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("floor.changed", { sectorId: before.sectorId, tableId: id });
    return Response.json({ table: { ...tableSnapshot(table), id: table.id, sectorId: table.sectorId } });
  } catch (error) {
    const message = error instanceof Error && error.message === "CONFLICT"
      ? "La mesa cambió en otra terminal. Se recargó el plano para evitar sobrescribirla."
      : "No se pudo guardar la mesa";
    return Response.json({ error: message }, { status: 409 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  const table = await db.diningTable.findFirst({
    where: { id, sector: { branch: { organizationId: auth.user.organizationId } } },
    include: {
      orders: { where: { status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED] } }, take: 1 },
      reservations: { where: { status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] }, reservedFor: { gte: new Date() } }, take: 1 },
    },
  });
  if (!table) return Response.json({ error: "Mesa inexistente" }, { status: 404 });
  if (!Number.isInteger(version) || version !== table.version) {
    return Response.json({ error: "La mesa cambió en otra terminal. Recargá antes de eliminar." }, { status: 409 });
  }
  if (table.orders.length || table.reservations.length) {
    return Response.json({ error: "No se puede eliminar una mesa con pedidos o reservas activas" }, { status: 409 });
  }
  await db.$transaction(async (tx) => {
    await tx.diningTable.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "DINING_TABLE_DELETED",
        entityType: "DiningTable",
        entityId: id,
        before: tableSnapshot(table),
      },
    });
  });
  publishEvent("floor.changed", { sectorId: table.sectorId, tableId: id });
  return Response.json({ ok: true });
}
