import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_WRITE);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  const result = await db.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id, organizationId: auth.user.organizationId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return null;

    await tx.category.delete({ where: { id: category.id } });
    await tx.auditLog.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "CATEGORY_DELETED",
        entityType: "Category",
        entityId: category.id,
        before: { name: category.name, productCount: category._count.products },
      },
    });
    return { id: category.id, name: category.name, productCount: category._count.products };
  });

  if (!result) return Response.json({ error: "La categoría no existe" }, { status: 404 });
  publishEvent("categories.changed", { categoryId: result.id, deleted: true });
  return Response.json({ category: result });
}
