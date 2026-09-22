import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { productSearchFilters } from "@/lib/product-search";

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const searchMode = url.searchParams.get("searchMode") === "barcode" ? "barcode" : "name";
  const categoryId = url.searchParams.get("categoryId")?.trim();
  const searchFilters = productSearchFilters(q, searchMode);
  const [categories, products] = await Promise.all([
    db.category.findMany({
      where: { organizationId: auth.user.organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: {
        organizationId: auth.user.organizationId,
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(searchFilters.length ? { AND: searchFilters } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      take: 80,
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        categoryId: true,
        category: { select: { name: true } },
        kitchenStation: { select: { name: true } },
      },
    }),
  ]);
  return Response.json({
    categories,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price.toString(),
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? "Sin categoría",
      kitchenStationName: product.kitchenStation?.name ?? null,
    })),
  });
}
