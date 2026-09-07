import { OrderItemStatus, OrderStatus, Prisma } from "@prisma/client";
import { db } from "./db";

export const ACTIVE_ORDER_STATUSES = [
  OrderStatus.OPEN,
  OrderStatus.IN_PROGRESS,
  OrderStatus.READY,
  OrderStatus.BILL_REQUESTED,
] as const;

export const editableOrderStatuses = [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] as const;

export type TableReleaseBlocker = "CLOSED" | "NOT_EMPTY" | "HAS_PAYMENT" | null;

export function getTableReleaseBlocker(status: OrderStatus, activeItemCount: number, paymentCount: number): TableReleaseBlocker {
  if (!ACTIVE_ORDER_STATUSES.some((activeStatus) => activeStatus === status)) return "CLOSED";
  if (activeItemCount > 0) return "NOT_EMPTY";
  if (paymentCount > 0) return "HAS_PAYMENT";
  return null;
}

export const orderDetailsInclude = Prisma.validator<Prisma.OrderInclude>()({
  diningTable: { include: { sector: { select: { id: true, name: true } } } },
  openedBy: { select: { id: true, displayName: true } },
  items: {
    orderBy: { createdAt: "asc" },
    include: { product: { select: { id: true, categoryId: true } } },
  },
});

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderDetailsInclude }>;

export function lineTotal(unitPrice: Prisma.Decimal.Value, quantity: Prisma.Decimal.Value, discount: Prisma.Decimal.Value = 0) {
  const value = new Prisma.Decimal(unitPrice).mul(quantity).sub(discount);
  return value.isNegative() ? new Prisma.Decimal(0) : value.toDecimalPlaces(2);
}

export function serializeOrder(order: OrderWithDetails) {
  return {
    id: order.id,
    branchId: order.branchId,
    diningTableId: order.diningTableId,
    number: order.number,
    type: order.type,
    status: order.status,
    guestCount: order.guestCount,
    subtotal: order.subtotal.toString(),
    discount: order.discount.toString(),
    tax: order.tax.toString(),
    total: order.total.toString(),
    notes: order.notes,
    version: order.version,
    openedAt: order.openedAt,
    table: order.diningTable ? { id: order.diningTable.id, name: order.diningTable.name, sector: order.diningTable.sector } : null,
    openedBy: order.openedBy,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      categoryId: item.product.categoryId,
      name: item.nameSnapshot,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discount: item.discount.toString(),
      total: item.total.toString(),
      status: item.status,
      notes: item.notes,
      version: item.version,
      createdAt: item.createdAt,
    })),
  };
}

export async function recalculateOrder(tx: Prisma.TransactionClient, orderId: string, markInProgress = false) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const rows = await tx.orderItem.findMany({
    where: { orderId, status: { not: OrderItemStatus.CANCELLED } },
    select: { total: true },
  });
  const subtotal = rows.reduce((sum, row) => sum.add(row.total), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const totalValue = subtotal.sub(order.discount).add(order.tax);
  const total = totalValue.isNegative() ? new Prisma.Decimal(0) : totalValue.toDecimalPlaces(2);
  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotal,
      total,
      ...(markInProgress && order.status === OrderStatus.OPEN ? { status: OrderStatus.IN_PROGRESS } : {}),
      version: { increment: 1 },
    },
  });
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailsInclude });
}

export async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    } catch (error) {
      lastError = error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034"].includes(error.code) || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}
