import {
  CashMovementType,
  CashShiftStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  TableStatus,
} from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { calculateDiscount } from "@/lib/discount";
import { ACTIVE_ORDER_STATUSES, orderDetailsInclude, serializable, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { roundDownToPriceStep } from "@/lib/pricing";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  orderVersion: z.coerce.number().int().positive(),
  cashShiftId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  discountType: z.enum(["NONE", "PERCENT", "FIXED"]).default("NONE"),
  discountValue: z.coerce.number().min(0).max(100_000_000).default(0),
  reference: z.string().trim().max(120).nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.CASH_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Seleccioná un turno y un medio de pago válidos" }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await serializable(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, branch: { organizationId: auth.user.organizationId } },
        include: {
          items: { where: { status: { not: OrderItemStatus.CANCELLED } }, select: { id: true } },
          diningTable: { select: { id: true, name: true } },
        },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (!ACTIVE_ORDER_STATUSES.some((status) => status === order.status)) throw new Error("ORDER_CLOSED");
      if (order.items.length === 0 || order.total.lte(0)) throw new Error("EMPTY_ORDER");

      const [shift, method, previousPayment] = await Promise.all([
        tx.cashShift.findFirst({
          where: {
            id: parsed.data.cashShiftId,
            status: CashShiftStatus.OPEN,
            cashRegister: { branchId: order.branchId },
          },
        }),
        tx.paymentMethod.findFirst({ where: { id: parsed.data.paymentMethodId, isActive: true } }),
        tx.payment.findFirst({ where: { orderId: order.id, status: PaymentStatus.COMPLETED }, select: { id: true } }),
      ]);
      if (!shift) throw new Error("SHIFT_NOT_OPEN");
      if (!method) throw new Error("PAYMENT_METHOD_NOT_FOUND");
      if (previousPayment) throw new Error("ALREADY_PAID");

      const discountResult = calculateDiscount(order.subtotal, parsed.data.discountType, parsed.data.discountValue);
      const beforeTaxRounding = discountResult.total.add(order.tax).toDecimalPlaces(2);
      const finalTotal = parsed.data.discountType === "NONE" ? beforeTaxRounding : roundDownToPriceStep(beforeTaxRounding);
      const appliedDiscount = order.subtotal.add(order.tax).sub(finalTotal);

      const changed = await tx.order.updateMany({
        where: { id: order.id, version: parsed.data.orderVersion, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        data: { status: OrderStatus.PAID, discount: appliedDiscount, total: finalTotal, closedAt: new Date(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("ORDER_CONFLICT");
      const shiftChanged = await tx.cashShift.updateMany({
        where: { id: shift.id, version: shift.version, status: CashShiftStatus.OPEN },
        data: { version: { increment: 1 } },
      });
      if (shiftChanged.count !== 1) throw new Error("SHIFT_CONFLICT");

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          cashShiftId: shift.id,
          paymentMethodId: method.id,
          amount: finalTotal,
          status: PaymentStatus.COMPLETED,
          reference: parsed.data.reference || null,
        },
      });
      await tx.cashMovement.create({
        data: {
          cashShiftId: shift.id,
          userId: auth.user.id,
          type: CashMovementType.SALE,
          amount: finalTotal,
          reason: `Venta pedido #${order.number} · ${method.name}`,
          referenceId: payment.id,
        },
      });

      if (order.diningTableId) {
        await tx.diningTable.update({
          where: { id: order.diningTableId },
          data: { status: TableStatus.AVAILABLE, version: { increment: 1 } },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "ORDER_PAID",
          entityType: "Order",
          entityId: order.id,
          before: { status: order.status, version: order.version },
          after: { status: OrderStatus.PAID, subtotal: order.subtotal.toString(), discount: appliedDiscount.toString(), total: finalTotal.toString(), paymentMethod: method.name, cashShiftId: shift.id },
          metadata: { paymentId: payment.id, tableId: order.diningTableId, stockUpdatedWithOrderItems: true },
        },
      });

      const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailsInclude });
      return { order: updated, payment, methodName: method.name, tableId: order.diningTableId };
    });

    publishEvent("orders.changed", { orderId: result.order.id, tableId: result.tableId ?? undefined });
    publishEvent("floor.changed", { tableId: result.tableId ?? undefined });
    publishEvent("cash.changed", { shiftId: result.payment.cashShiftId, orderId: result.order.id });
    publishEvent("dashboard.changed", { orderId: result.order.id });
    return Response.json({
      order: serializeOrder(result.order),
      payment: {
        id: result.payment.id,
        amount: result.payment.amount.toString(),
        paymentMethod: result.methodName,
        createdAt: result.payment.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_NOT_FOUND") return Response.json({ error: "La cuenta no existe" }, { status: 404 });
    if (message === "ORDER_CLOSED" || message === "ALREADY_PAID") return Response.json({ error: "La cuenta ya fue cobrada o cerrada" }, { status: 409 });
    if (message === "EMPTY_ORDER") return Response.json({ error: "La cuenta no tiene consumiciones para cobrar" }, { status: 409 });
    if (message === "SHIFT_NOT_OPEN") return Response.json({ error: "No hay un turno abierto en esa caja" }, { status: 409 });
    if (message === "SHIFT_CONFLICT") return Response.json({ error: "La caja cambió en otra terminal. Volvé a intentar el cobro." }, { status: 409 });
    if (message === "PAYMENT_METHOD_NOT_FOUND") return Response.json({ error: "El medio de pago no está disponible" }, { status: 404 });
    if (message === "ORDER_CONFLICT") return Response.json({ error: "La cuenta cambió en otra terminal. Revisala antes de cobrar." }, { status: 409 });
    return Response.json({ error: "No se pudo completar el cobro. No se registró ningún movimiento." }, { status: 409 });
  }
}
