import { OrderStatus, OrderType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { sendOrderItemToKitchen } from "@/lib/kitchen";
import { enqueueKitchenTicketPrint } from "@/lib/kitchen-print-queue";
import { ACTIVE_ORDER_STATUSES, lineTotal, orderDetailsInclude, recalculateOrder, serializable, serializeOrder } from "@/lib/order-service";
import { applyOrderStockDelta } from "@/lib/order-stock";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive().max(100).default(1) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Producto o cantidad inválidos" }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await serializable(async (tx) => {
      const account = await tx.currentAccount.findFirst({ where: { id, isActive: true, branch: { organizationId: auth.user.organizationId } } });
      if (!account) throw new Error("ACCOUNT_NOT_FOUND");
      const product = await tx.product.findFirst({ where: { id: parsed.data.productId, organizationId: auth.user.organizationId, isActive: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${account.id})) IS NULL AS locked`;
      let order = await tx.order.findFirst({ where: { currentAccountId: account.id, status: { in: [...ACTIVE_ORDER_STATUSES] } }, orderBy: { openedAt: "desc" } });
      if (!order) {
        await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${account.branchId})) IS NULL AS locked`;
        const latest = await tx.order.aggregate({ where: { branchId: account.branchId }, _max: { number: true } });
        order = await tx.order.create({
          data: { branchId: account.branchId, currentAccountId: account.id, openedById: auth.user.id, number: (latest._max.number ?? 0) + 1, type: OrderType.COUNTER, status: OrderStatus.OPEN, guestCount: 1, notes: `Cuenta corriente · ${account.name}` },
        });
      }
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const existing = await tx.orderItem.findFirst({ where: { orderId: order.id, productId: product.id, status: "PENDING" } });
      let itemId: string;
      let kitchenTicketId: string | null = null;
      if (existing) {
        const nextQuantity = existing.quantity.add(quantity);
        await tx.orderItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity, total: lineTotal(existing.unitPrice, nextQuantity), version: { increment: 1 } } });
        itemId = existing.id;
      } else {
        const item = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, kitchenStationId: product.kitchenStationId, nameSnapshot: product.name, quantity, unitPrice: product.price, costSnapshot: product.cost, total: lineTotal(product.price, quantity) } });
        itemId = item.id;
        if (product.kitchenStationId) kitchenTicketId = await sendOrderItemToKitchen(tx, { orderId: order.id, orderNumber: order.number, orderItemId: item.id, kitchenStationId: product.kitchenStationId, quantity });
      }
      const stockChanged = await applyOrderStockDelta(tx, { branchId: account.branchId, orderId: order.id, orderNumber: order.number, orderItemId: itemId, productId: product.id, quantityDelta: quantity, userId: auth.user.id });
      const updated = await recalculateOrder(tx, order.id, true);
      await tx.auditLog.create({ data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "CURRENT_ACCOUNT_ITEM_ADDED", entityType: "CurrentAccount", entityId: account.id, metadata: { orderId: order.id, productId: product.id, quantity: quantity.toString(), stockUpdated: stockChanged } } });
      return { order: updated, stockChanged, kitchenTicketId, itemId };
    });
    publishEvent("current-accounts.changed", { accountId: id, orderId: result.order.id });
    publishEvent("orders.changed", { orderId: result.order.id });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: result.order.id });
    if (result.kitchenTicketId) {
      publishEvent("kitchen.changed", { ticketId: result.kitchenTicketId, orderId: result.order.id });
      void enqueueKitchenTicketPrint(result.kitchenTicketId, [result.itemId]).catch(() => undefined);
    }
    return Response.json({ order: serializeOrder(result.order) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ACCOUNT_NOT_FOUND") return Response.json({ error: "La cuenta corriente no existe" }, { status: 404 });
    if (message === "PRODUCT_NOT_FOUND") return Response.json({ error: "El producto no existe o está inactivo" }, { status: 404 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo cargar el consumo en la cuenta" }, { status: 409 });
  }
}
