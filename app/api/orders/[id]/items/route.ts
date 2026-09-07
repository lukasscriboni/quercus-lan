import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { lineTotal, recalculateOrder, serializable, serializeOrder } from "@/lib/order-service";
import { applyOrderStockDelta } from "@/lib/order-stock";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100).default(1),
  notes: z.string().trim().max(300).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Consumición inválida" }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await serializable(async (tx) => {
      const current = await tx.order.findFirst({ where: { id, branch: { organizationId: auth.user.organizationId } } });
      if (!current) throw new Error("NOT_FOUND");
      if (current.status !== OrderStatus.OPEN && current.status !== OrderStatus.IN_PROGRESS) throw new Error("NOT_EDITABLE");
      const product = await tx.product.findFirst({ where: { id: parsed.data.productId, organizationId: auth.user.organizationId, isActive: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const item = await tx.orderItem.create({
        data: {
          orderId: current.id,
          productId: product.id,
          kitchenStationId: product.kitchenStationId,
          nameSnapshot: product.name,
          quantity,
          unitPrice: product.price,
          costSnapshot: product.cost,
          total: lineTotal(product.price, quantity),
          notes: parsed.data.notes || null,
        },
      });
      const stockChanged = await applyOrderStockDelta(tx, {
        branchId: current.branchId,
        orderId: current.id,
        orderNumber: current.number,
        orderItemId: item.id,
        productId: product.id,
        quantityDelta: quantity,
        userId: auth.user.id,
      });
      const updated = await recalculateOrder(tx, current.id, true);
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "ORDER_ITEM_ADDED",
          entityType: "OrderItem",
          entityId: item.id,
          metadata: { orderId: current.id, productId: product.id, quantity: quantity.toString(), unitPrice: product.price.toString() },
        },
      });
      return { order: updated, stockChanged };
    });
    publishEvent("orders.changed", { orderId: id, tableId: result.order.diningTableId ?? undefined });
    publishEvent("floor.changed", { tableId: result.order.diningTableId ?? undefined });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: id });
    return Response.json({ order: serializeOrder(result.order) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "Cuenta inexistente" }, { status: 404 });
    if (message === "PRODUCT_NOT_FOUND") return Response.json({ error: "Producto inexistente o inactivo" }, { status: 404 });
    if (message === "NOT_EDITABLE") return Response.json({ error: "La cuenta ya fue solicitada y no admite nuevas consumiciones" }, { status: 409 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo agregar la consumición" }, { status: 409 });
  }
}
