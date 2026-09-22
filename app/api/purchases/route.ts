import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const createSchema = z.object({
  supplierId: z.string().min(1),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().finite().positive().max(1_000_000),
    unitCost: z.coerce.number().finite().min(0).max(100_000_000),
  })).min(1),
});

const statusSchema = z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]);

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status");
  const status = statusValue && statusValue !== "ALL" ? statusSchema.safeParse(statusValue) : null;
  const supplierId = url.searchParams.get("supplierId")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999`);

  const where: Prisma.PurchaseOrderWhereInput = {
    branch: { organizationId: auth.user.organizationId },
    ...(status?.success ? { status: status.data } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(from || to ? { createdAt } : {}),
    ...(q ? { OR: [
      { supplier: { name: { contains: q, mode: "insensitive" } } },
      ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
    ] } : {}),
  };
  const [orders, suppliers, products] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        createdBy: { select: { displayName: true } },
        items: { include: { product: { select: { id: true, name: true, barcode: true, unit: true } } }, orderBy: { product: { name: "asc" } } },
      },
    }),
    db.supplier.findMany({ where: { organizationId: auth.user.organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ where: { organizationId: auth.user.organizationId, isActive: true, stockMode: "DIRECT" }, orderBy: { name: "asc" }, select: { id: true, name: true, barcode: true, unit: true, cost: true, supplierId: true } }),
  ]);
  return Response.json({ orders, suppliers, products });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Agregá un proveedor y al menos un producto válido" }, { status: 400 });
  const consolidated = new Map<string, { quantity: number; unitCost: number }>();
  for (const item of parsed.data.items) {
    const current = consolidated.get(item.productId);
    consolidated.set(item.productId, current ? { quantity: current.quantity + item.quantity, unitCost: item.unitCost } : item);
  }
  const productIds = [...consolidated.keys()];
  const [branch, supplier, products] = await Promise.all([
    db.branch.findFirst({ where: { organizationId: auth.user.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    db.supplier.findFirst({ where: { id: parsed.data.supplierId, organizationId: auth.user.organizationId, isActive: true }, select: { id: true, name: true } }),
    db.product.findMany({ where: { id: { in: productIds }, organizationId: auth.user.organizationId, isActive: true, stockMode: "DIRECT" }, select: { id: true } }),
  ]);
  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 400 });
  if (!supplier) return Response.json({ error: "El proveedor no está disponible" }, { status: 400 });
  if (products.length !== productIds.length) return Response.json({ error: "Uno de los productos no admite control directo de stock" }, { status: 400 });
  const total = [...consolidated.values()].reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  try {
    const order = await db.$transaction(async (tx) => {
      const latest = await tx.purchaseOrder.findFirst({ where: { branchId: branch.id }, orderBy: { number: "desc" }, select: { number: true } });
      return tx.purchaseOrder.create({
        data: {
          branchId: branch.id,
          supplierId: supplier.id,
          createdById: auth.user.id,
          number: (latest?.number ?? 0) + 1,
          status: PurchaseOrderStatus.ORDERED,
          total,
          orderedAt: new Date(),
          items: { create: [...consolidated.entries()].map(([productId, item]) => ({ productId, quantity: item.quantity, unitCost: item.unitCost })) },
        },
        include: { supplier: true, items: { include: { product: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await db.auditLog.create({ data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "PURCHASE_ORDER_CREATED", entityType: "PurchaseOrder", entityId: order.id, after: { number: order.number, supplier: supplier.name, total, itemCount: order.items.length } } });
    publishEvent("purchases.changed", { purchaseOrderId: order.id });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message.includes("Unique constraint") ? "Otra terminal creó una compra al mismo tiempo. Volvé a intentar." : "No se pudo crear la orden de compra" }, { status: 409 });
  }
}
