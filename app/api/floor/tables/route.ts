import { TableStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeFloorRect } from "@/lib/floor";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  sectorId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  capacity: z.coerce.number().int().min(1).max(30).default(4),
  status: z.nativeEnum(TableStatus).default(TableStatus.AVAILABLE),
  x: z.coerce.number().finite().default(40),
  y: z.coerce.number().finite().default(40),
  width: z.coerce.number().finite().default(120),
  height: z.coerce.number().finite().default(90),
  rotation: z.coerce.number().finite().default(0),
  shape: z.enum(["ROUND", "SQUARE", "RECTANGLE"]).default("ROUND"),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revisá los datos de la mesa" }, { status: 400 });
  const sector = await db.sector.findFirst({
    where: { id: parsed.data.sectorId, branch: { organizationId: auth.user.organizationId } },
  });
  if (!sector) return Response.json({ error: "Sector inexistente" }, { status: 404 });
  const duplicate = await db.diningTable.findFirst({
    where: { sectorId: sector.id, name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (duplicate) return Response.json({ error: "Ya existe una mesa con ese nombre en el sector" }, { status: 409 });
  const rect = normalizeFloorRect(parsed.data, { minWidth: 70, minHeight: 60 });
  const table = await db.$transaction(async (tx) => {
    const created = await tx.diningTable.create({
      data: {
        sectorId: sector.id,
        name: parsed.data.name,
        capacity: parsed.data.capacity,
        status: parsed.data.status,
        shape: parsed.data.shape,
        ...rect,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "DINING_TABLE_CREATED",
        entityType: "DiningTable",
        entityId: created.id,
        after: { name: created.name, sectorId: created.sectorId, capacity: created.capacity },
      },
    });
    return created;
  });
  publishEvent("floor.changed", { sectorId: sector.id, tableId: table.id });
  return Response.json({ table }, { status: 201 });
}
