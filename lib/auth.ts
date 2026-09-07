import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";

const SESSION_COOKIE = "quercus_session";

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function authenticate(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { username: normalized, isActive: true },
  });
  if (!user || !(await compare(password, user.passwordHash))) return null;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const hours = Number(process.env.SESSION_HOURS ?? 12);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await db.session.create({ data: { userId, tokenHash: tokenHash(rawToken), expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_HTTPS === "true",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await db.session.delete({ where: { id: session.id } });
    return null;
  }
  return {
    id: session.user.id,
    organizationId: session.user.organizationId,
    username: session.user.username,
    displayName: session.user.displayName,
    role: session.user.role.name,
    permissions: session.user.role.permissions.map((item) => item.permission.key),
  };
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function can(user: CurrentUser, permission: PermissionKey) {
  return user.permissions.includes(permission);
}

export async function requireApiUser(permission?: PermissionKey) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "No autenticado" }, { status: 401 }) } as const;
  if (permission && !can(user, permission)) {
    return { error: Response.json({ error: "Sin permiso para esta operación" }, { status: 403 }) } as const;
  }
  return { user } as const;
}
