import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";
import { productSearchFilters } from "@/lib/product-search";
import { publishEvent } from "@/lib/realtime";

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  barcode: z.string().trim().max(80).optional().or(z.literal("")),
  categoryId: z.string().trim().optional().or(z.literal("")),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(21),
  stockMode: z.enum(["NONE", "DIRECT", "RECIPE"]).default("NONE"),
  unit: z.enum(["UNIT", "GRAM", "KILOGRAM", "MILLILITER", "LITER"]).default("UNIT"),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 30)));
  const q = url.searchParams.get("q")?.trim();
  const categoryId = url.searchParams.get("categoryId")?.trim();
  const supplierId = url.searchParams.get("supplierId")?.trim();
  const parsedSort = z.enum(["name", "stock", "price", "sku"]).safeParse(url.searchParams.get("sortBy"));
  const parsedDirection = z.enum(["asc", "desc"]).safeParse(url.searchParams.get("sortDirection"));
  const sortBy = parsedSort.success ? parsedSort.data : "name";
  const sortDirection = parsedDirection.success ? parsedDirection.data : "asc";
  const combinedFilters: Prisma.ProductWhereInput[] = productSearchFilters(q);
  if (supplierId && supplierId !== "UNASSIGNED") {
    combinedFilters.push({ OR: [{ supplierId }, { stockMovements: { some: { referenceType: "SUPPLIER", referenceId: supplierId } } }] });
  }
  const where: Prisma.ProductWhereInput = {
    organizationId: auth.user.organizationId,
    isActive: true,
    ...(categoryId === "UNCATEGORIZED" ? { categoryId: null } : categoryId ? { categoryId } : {}),
    ...(supplierId === "UNASSIGNED"
      ? { supplierId: null, stockMovements: { none: { referenceType: "SUPPLIER" } } }
      : {}),
    ...(combinedFilters.length ? { AND: combinedFilters } : {}),
  };
  const include = { category: { select: { id: true, name: true } }, stocks: { select: { quantity: true, warehouseId: true } } } as const;

  if (sortBy === "stock") {
    const stockRows = await db.product.findMany({
      where,
      select: { id: true, name: true, stocks: { select: { quantity: true } } },
    });
    const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
    stockRows.sort((first, second) => {
      const firstStock = first.stocks.reduce((sum, row) => sum + Number(row.quantity), 0);
      const secondStock = second.stocks.reduce((sum, row) => sum + Number(row.quantity), 0);
      const difference = firstStock - secondStock;
      if (difference !== 0) return sortDirection === "asc" ? difference : -difference;
      return collator.compare(first.name, second.name);
    });
    const total = stockRows.length;
    const pageIds = stockRows.slice((page - 1) * pageSize, page * pageSize).map((product) => product.id);
    const pageProducts = pageIds.length ? await db.product.findMany({ where: { id: { in: pageIds } }, include }) : [];
    const productsById = new Map(pageProducts.map((product) => [product.id, product]));
    const products = pageIds.flatMap((id) => { const product = productsById.get(id); return product ? [product] : []; });
    return Response.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] = sortBy === "price"
    ? [{ price: sortDirection }, { normalizedName: "asc" }]
    : sortBy === "sku"
      ? [{ normalizedSku: { sort: sortDirection, nulls: "last" } }, { normalizedName: "asc" }]
      : [{ normalizedName: sortDirection }, { id: "asc" }];
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include,
    }),
    db.product.count({ where }),
  ]);
  return Response.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = productSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revisá los datos del producto", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  try {
    const product = await db.product.create({
      data: {
        organizationId: auth.user.organizationId,
        name: data.name,
        normalizedName: normalizeText(data.name),
        sku: data.sku || null,
        normalizedSku: data.sku ? normalizeText(data.sku) : null,
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        price: data.price,
        cost: data.cost,
        taxRate: data.taxRate,
        stockMode: data.stockMode,
        unit: data.unit,
        isActive: data.isActive,
      },
    });
    await db.auditLog.create({
      data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: product.id, after: { name: product.name, sku: product.sku } },
    });
    publishEvent("products.changed", { productId: product.id });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unique constraint") ? "Ya existe un producto con ese SKU o código de barras" : "No se pudo crear el producto";
    return Response.json({ error: message }, { status: 409 });
  }
}
