import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Ingresá un nombre para el sector" }, { status: 400 });

  const branch = await db.branch.findFirst({
    where: { organizationId: auth.user.organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });
  const duplicate = await db.sector.findFirst({
    where: { branchId: branch.id, name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (duplicate) return Response.json({ error: "Ya existe un sector con ese nombre" }, { status: 409 });

  const last = await db.sector.aggregate({ where: { branchId: branch.id }, _max: { sortOrder: true } });
  const sector = await db.$transaction(async (tx) => {
    const created = await tx.sector.create({
      data: { branchId: branch.id, name: parsed.data.name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "FLOOR_SECTOR_CREATED",
        entityType: "Sector",
        entityId: created.id,
        after: { name: created.name, sortOrder: created.sortOrder },
      },
    });
    return created;
  });
  publishEvent("floor.changed", { sectorId: sector.id });
  return Response.json({ sector }, { status: 201 });
}
