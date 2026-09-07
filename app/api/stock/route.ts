import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { productSearchFilters } from "@/lib/product-search";

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const warehouseId = url.searchParams.get("warehouseId") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 40)));
  const searchFilters = productSearchFilters(q);
  const where = {
    organizationId: auth.user.organizationId,
    isActive: true,
    stockMode: { not: "NONE" as const },
    ...(searchFilters.length ? { AND: searchFilters } : {}),
  };
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, sku: true, unit: true, stockMode: true,
        stocks: {
          where: warehouseId ? { warehouseId } : undefined,
          select: { id: true, warehouseId: true, quantity: true, minimum: true, version: true, warehouse: { select: { name: true } } },
        },
      },
    }),
    db.product.count({ where }),
  ]);
  return Response.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}
