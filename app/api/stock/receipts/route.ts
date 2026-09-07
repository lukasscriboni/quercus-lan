import { StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { adjustStock } from "@/lib/inventory";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const receiptSchema = z.object({
  supplierId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().finite().positive().max(1_000_000),
  receivedByUserId: z.string().min(1),
});

async function defaultWarehouse(organizationId: string) {
  return db.warehouse.findFirst({
    where: { branch: { organizationId }, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
}

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const [warehouse, products, users, suppliers, categories] = await Promise.all([
    defaultWarehouse(auth.user.organizationId),
    db.product.findMany({
      where: { organizationId: auth.user.organizationId, isActive: true, stockMode: "DIRECT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true },
    }),
    db.user.findMany({
      where: { organizationId: auth.user.organizationId, isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, username: true, role: { select: { name: true } } },
    }),
    db.supplier.findMany({
      where: { organizationId: auth.user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.category.findMany({
      where: { organizationId: auth.user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return Response.json({ warehouseId: warehouse?.id ?? null, products, users, suppliers, categories, currentUserId: auth.user.id });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const parsed = receiptSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revisá el proveedor, producto, cantidad y responsable", details: parsed.error.flatten() }, { status: 400 });

  const [warehouse, product, responsible, supplier] = await Promise.all([
    defaultWarehouse(auth.user.organizationId),
    db.product.findFirst({ where: { id: parsed.data.productId, organizationId: auth.user.organizationId, isActive: true, stockMode: "DIRECT" }, select: { id: true } }),
    db.user.findFirst({ where: { id: parsed.data.receivedByUserId, organizationId: auth.user.organizationId, isActive: true }, select: { id: true, displayName: true } }),
    db.supplier.findFirst({ where: { id: parsed.data.supplierId, organizationId: auth.user.organizationId, isActive: true }, select: { id: true, name: true } }),
  ]);
  if (!warehouse) return Response.json({ error: "No está configurado el lugar principal de stock" }, { status: 400 });
  if (!product) return Response.json({ error: "El producto no admite ingreso directo de mercadería" }, { status: 400 });
  if (!responsible) return Response.json({ error: "El responsable seleccionado no está disponible" }, { status: 400 });
  if (!supplier) return Response.json({ error: "El proveedor seleccionado no está disponible" }, { status: 400 });

  try {
    const movement = await adjustStock({
      organizationId: auth.user.organizationId,
      productId: product.id,
      warehouseId: warehouse.id,
      userId: responsible.id,
      auditUserId: auth.user.id,
      quantity: parsed.data.quantity,
      type: StockMovementType.PURCHASE,
      reason: `Ingreso de mercadería · Proveedor: ${supplier.name}`,
      referenceType: "SUPPLIER",
      referenceId: supplier.id,
    });
    publishEvent("stock.changed", { productId: product.id, warehouseId: warehouse.id });
    return Response.json({ movement, supplier, responsible }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^CONFLICT:\s*/, "") : "No se pudo ingresar la mercadería";
    const status = error instanceof Error && error.message.startsWith("CONFLICT:") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
