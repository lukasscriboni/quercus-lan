import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSION_CATALOG, PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.USERS_MANAGE);
  if ("error" in auth) return auth.error;

  const supportedKeys = PERMISSION_CATALOG.map((permission) => permission.key);
  const [roles, users] = await Promise.all([db.role.findMany({
    where: { organizationId: auth.user.organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: {
        where: { permission: { key: { in: supportedKeys } } },
        select: { permission: { select: { key: true } } },
      },
      _count: { select: { users: true } },
    },
  }), db.user.findMany({
    where: { organizationId: auth.user.organizationId },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, username: true, isActive: true, createdAt: true, lastLoginAt: true, role: { select: { id: true, name: true } } },
  })]);

  return Response.json({
    currentRole: auth.user.role,
    permissions: PERMISSION_CATALOG,
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissionKeys: role.permissions.map((item) => item.permission.key),
    })),
    users,
  });
}
