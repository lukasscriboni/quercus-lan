import { hash } from "bcryptjs";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const createSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(6).max(200),
  roleId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.USERS_MANAGE);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Completá nombre, usuario, contraseña de al menos 6 caracteres y rol" }, { status: 400 });
  const username = parsed.data.username.toLowerCase();
  const [role, existing] = await Promise.all([
    db.role.findFirst({ where: { id: parsed.data.roleId, organizationId: auth.user.organizationId }, select: { id: true, name: true } }),
    db.user.findFirst({ where: { organizationId: auth.user.organizationId, username }, select: { id: true } }),
  ]);
  if (!role) return Response.json({ error: "El rol seleccionado no existe" }, { status: 404 });
  if (existing) return Response.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
  const user = await db.user.create({
    data: { organizationId: auth.user.organizationId, roleId: role.id, displayName: parsed.data.displayName, username, passwordHash: await hash(parsed.data.password, 12) },
    select: { id: true, displayName: true, username: true, isActive: true, createdAt: true },
  });
  await db.auditLog.create({ data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "USER_CREATED", entityType: "User", entityId: user.id, after: { displayName: user.displayName, username: user.username, roleId: role.id, roleName: role.name } } });
  publishEvent("roles.changed", { userId: user.id, roleId: role.id });
  return Response.json({ user: { ...user, lastLoginAt: null, role: { id: role.id, name: role.name } } }, { status: 201 });
}
