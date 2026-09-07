import { FloorElementType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeFloorRect } from "@/lib/floor";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const allowedTypes = [FloorElementType.WALL, FloorElementType.BAR, FloorElementType.TEXT, FloorElementType.DECORATION] as const;
const schema = z.object({
  version: z.coerce.number().int().positive(),
  type: z.enum(allowedTypes).optional(),
  label: z.string().trim().max(120).nullable().optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  width: z.coerce.number().finite().optional(),
  height: z.coerce.number().finite().optional(),
  rotation: z.coerce.number().finite().optional(),
}).refine((data) => Object.keys(data).some((key) => key !== "version"));

function elementSnapshot(element: {
  type: FloorElementType; label: string | null; x: Prisma.Decimal; y: Prisma.Decimal;
  width: Prisma.Decimal; height: Prisma.Decimal; rotation: Prisma.Decimal; version: number;
}) {
  return {
    type: element.type,
    label: element.label,
    x: Number(element.x),
    y: Number(element.y),
    width: Number(element.width),
    height: Number(element.height),
    rotation: Number(element.rotation),
    version: element.version,
  };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Datos del elemento inválidos" }, { status: 400 });
  const { id } = await context.params;
  const before = await db.floorElement.findFirst({
    where: { id, sector: { branch: { organizationId: auth.user.organizationId } } },
  });
  if (!before) return Response.json({ error: "Elemento inexistente" }, { status: 404 });
  const requested = parsed.data;
  const rect = normalizeFloorRect({
    x: requested.x ?? Number(before.x),
    y: requested.y ?? Number(before.y),
    width: requested.width ?? Number(before.width),
    height: requested.height ?? Number(before.height),
    rotation: requested.rotation ?? Number(before.rotation),
  }, { minWidth: 30, minHeight: 20 });
  try {
    const element = await db.$transaction(async (tx) => {
      const changed = await tx.floorElement.updateMany({
        where: { id, version: requested.version },
        data: {
          type: requested.type,
          label: requested.label,
          ...rect,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      const updated = await tx.floorElement.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "FLOOR_ELEMENT_UPDATED",
          entityType: "FloorElement",
          entityId: id,
          before: elementSnapshot(before),
          after: elementSnapshot(updated),
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    publishEvent("floor.changed", { sectorId: before.sectorId, elementId: id });
    return Response.json({ element: { ...elementSnapshot(element), id: element.id, sectorId: element.sectorId } });
  } catch (error) {
    const message = error instanceof Error && error.message === "CONFLICT"
      ? "El elemento cambió en otra terminal. Se recargó el plano."
      : "No se pudo guardar el elemento";
    return Response.json({ error: message }, { status: 409 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  const element = await db.floorElement.findFirst({
    where: { id, sector: { branch: { organizationId: auth.user.organizationId } } },
  });
  if (!element) return Response.json({ error: "Elemento inexistente" }, { status: 404 });
  if (!Number.isInteger(version) || version !== element.version) {
    return Response.json({ error: "El elemento cambió en otra terminal. Recargá antes de eliminar." }, { status: 409 });
  }
  await db.$transaction(async (tx) => {
    await tx.floorElement.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "FLOOR_ELEMENT_DELETED",
        entityType: "FloorElement",
        entityId: id,
        before: elementSnapshot(element),
      },
    });
  });
  publishEvent("floor.changed", { sectorId: element.sectorId, elementId: id });
  return Response.json({ ok: true });
}
