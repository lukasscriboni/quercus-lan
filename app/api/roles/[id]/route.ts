import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const bodySchema = z.object({
  permissionKeys: z.array(z.enum(PERMISSIONS)).max(Object.keys(PERMISSIONS).length),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.USERS_MANAGE);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "La selección de funciones no es válida" }, { status: 400 });

  const { id } = await context.params;
  const permissionKeys = [...new Set(parsed.data.permissionKeys)];
  const role = await db.role.findFirst({
    where: { id, organizationId: auth.user.organizationId },
    select: {
      id: true,
      name: true,
      permissions: { select: { permission: { select: { key: true } } } },
      users: { where: { id: auth.user.id }, select: { id: true } },
    },
  });
  if (!role) return Response.json({ error: "El rol no existe" }, { status: 404 });

  const protectsAdministration = role.name === "ADMIN" || role.users.length > 0;
  if (protectsAdministration && !permissionKeys.includes(PERMISSIONS.USERS_MANAGE)) {
    return Response.json({ error: "Este rol debe conservar la administración de roles para evitar perder el acceso" }, { status: 400 });
  }

  const permissionRows = await db.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });
  if (permissionRows.length !== permissionKeys.length) {
    return Response.json({ error: "Uno de los permisos seleccionados no está disponible" }, { status: 409 });
  }

  const beforeKeys = role.permissions.map((item) => item.permission.key).sort();
  const afterKeys = permissionRows.map((permission) => permission.key).sort();
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionRows.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "ROLE_PERMISSIONS_UPDATED",
        entityType: "Role",
        entityId: role.id,
        before: { permissions: beforeKeys },
        after: { permissions: afterKeys },
        metadata: { roleName: role.name },
      },
    });
  });

  publishEvent("roles.changed", { roleId: role.id });
  return Response.json({ role: { id: role.id, permissionKeys: afterKeys }, appliesToCurrentUser: role.users.length > 0 });
}
