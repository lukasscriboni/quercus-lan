import { FloorElementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeFloorRect } from "@/lib/floor";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const allowedTypes = [FloorElementType.WALL, FloorElementType.BAR, FloorElementType.TEXT, FloorElementType.DECORATION] as const;
const schema = z.object({
  sectorId: z.string().min(1),
  type: z.enum(allowedTypes),
  label: z.string().trim().max(120).nullable().optional(),
  x: z.coerce.number().finite().default(40),
  y: z.coerce.number().finite().default(40),
  width: z.coerce.number().finite().default(180),
  height: z.coerce.number().finite().default(60),
  rotation: z.coerce.number().finite().default(0),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revisá los datos del elemento" }, { status: 400 });
  const sector = await db.sector.findFirst({
    where: { id: parsed.data.sectorId, branch: { organizationId: auth.user.organizationId } },
  });
  if (!sector) return Response.json({ error: "Sector inexistente" }, { status: 404 });
  const rect = normalizeFloorRect(parsed.data, { minWidth: 30, minHeight: 20 });
  const element = await db.$transaction(async (tx) => {
    const created = await tx.floorElement.create({
      data: {
        sectorId: sector.id,
        type: parsed.data.type,
        label: parsed.data.label || null,
        ...rect,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "FLOOR_ELEMENT_CREATED",
        entityType: "FloorElement",
        entityId: created.id,
        after: { type: created.type, label: created.label, sectorId: created.sectorId },
      },
    });
    return created;
  });
  publishEvent("floor.changed", { sectorId: sector.id, elementId: element.id });
  return Response.json({ element }, { status: 201 });
}
