import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_VIEW);
  if ("error" in auth) return auth.error;
  const categories = await db.category.findMany({
    where: { organizationId: auth.user.organizationId },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return Response.json({ categories });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Nombre de categoría inválido" }, { status: 400 });
  const category = await db.category.upsert({
    where: { organizationId_normalizedName: { organizationId: auth.user.organizationId, normalizedName: normalizeText(parsed.data.name) } },
    update: { name: parsed.data.name, isActive: true },
    create: { organizationId: auth.user.organizationId, name: parsed.data.name, normalizedName: normalizeText(parsed.data.name) },
  });
  publishEvent("categories.changed", { categoryId: category.id });
  return Response.json({ category }, { status: 201 });
}
