import {
  CashMovementType,
  CashShiftStatus,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { calculateDiscount } from "@/lib/discount";
import { lineTotal, serializable } from "@/lib/order-service";
import { applyOrderStockDelta } from "@/lib/order-stock";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  cashShiftId: z.string().min(1),
  shiftVersion: z.coerce.number().int().positive(),
  paymentMethodId: z.string().min(1),
  discountType: z.enum(["NONE", "PERCENT", "FIXED"]).default("NONE"),
  discountValue: z.coerce.number().min(0).max(100_000_000).default(0),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100),
  })).min(1).max(100),
  reference: z.string().trim().max(120).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.CASH_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Agregá productos y seleccioná un medio de pago" }, { status: 400 });

  const requested = new Map<string, Prisma.Decimal>();
  for (const item of parsed.data.items) {
    const quantity = (requested.get(item.productId) ?? new Prisma.Decimal(0)).add(item.quantity);
    if (quantity.gt(100)) return Response.json({ error: "La cantidad máxima por producto es 100" }, { status: 400 });
    requested.set(item.productId, quantity);
  }

  try {
    const result = await serializable(async (tx) => {
      const shift = await tx.cashShift.findFirst({
        where: {
          id: parsed.data.cashShiftId,
          status: CashShiftStatus.OPEN,
          cashRegister: { branch: { organizationId: auth.user.organizationId } },
        },
        include: { cashRegister: { select: { branchId: true } } },
      });
      if (!shift) throw new Error("SHIFT_NOT_OPEN");
      const method = await tx.paymentMethod.findFirst({ where: { id: parsed.data.paymentMethodId, isActive: true } });
      if (!method) throw new Error("PAYMENT_METHOD_NOT_FOUND");

      const products = await tx.product.findMany({
        where: { id: { in: Array.from(requested.keys()) }, organizationId: auth.user.organizationId, isActive: true },
        select: { id: true, name: true, price: true, cost: true, kitchenStationId: true },
      });
      if (products.length !== requested.size) throw new Error("PRODUCT_NOT_FOUND");

      const lines = products.map((product) => {
        const quantity = requested.get(product.id) ?? new Prisma.Decimal(0);
        return { product, quantity, total: lineTotal(product.price, quantity) };
      });
      const total = lines.reduce<Prisma.Decimal>((sum, line) => sum.add(line.total), new Prisma.Decimal(0)).toDecimalPlaces(2);
      if (total.lte(0)) throw new Error("TOTAL_ZERO");
      const discountResult = calculateDiscount(total, parsed.data.discountType, parsed.data.discountValue);

      const shiftChanged = await tx.cashShift.updateMany({
        where: { id: shift.id, version: parsed.data.shiftVersion, status: CashShiftStatus.OPEN },
        data: { version: { increment: 1 } },
      });
      if (shiftChanged.count !== 1) throw new Error("SHIFT_CONFLICT");

      const branchId = shift.cashRegister.branchId;
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${branchId})) IS NULL AS locked`;
      const latest = await tx.order.aggregate({ where: { branchId }, _max: { number: true } });
      const order = await tx.order.create({
        data: {
          branchId,
          openedById: auth.user.id,
          number: (latest._max.number ?? 0) + 1,
          type: OrderType.COUNTER,
          status: OrderStatus.PAID,
          guestCount: 1,
          subtotal: total,
          discount: discountResult.discount,
          total: discountResult.total,
          closedAt: new Date(),
        },
      });

      let stockChanged = false;
      for (const line of lines) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: line.product.id,
            kitchenStationId: line.product.kitchenStationId,
            nameSnapshot: line.product.name,
            quantity: line.quantity,
            unitPrice: line.product.price,
            costSnapshot: line.product.cost,
            total: line.total,
            status: OrderItemStatus.DELIVERED,
          },
        });
        stockChanged = (await applyOrderStockDelta(tx, {
          branchId,
          orderId: order.id,
          orderNumber: order.number,
          orderItemId: orderItem.id,
          productId: line.product.id,
          quantityDelta: line.quantity,
          userId: auth.user.id,
        })) || stockChanged;
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          cashShiftId: shift.id,
          paymentMethodId: method.id,
          amount: discountResult.total,
          status: PaymentStatus.COMPLETED,
          reference: parsed.data.reference || null,
        },
      });
      await tx.cashMovement.create({
        data: {
          cashShiftId: shift.id,
          userId: auth.user.id,
          type: CashMovementType.SALE,
          amount: discountResult.total,
          reason: `Venta directa #${order.number} · ${method.name}`,
          referenceId: payment.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "DIRECT_SALE_COMPLETED",
          entityType: "Order",
          entityId: order.id,
          after: { number: order.number, subtotal: total.toString(), discount: discountResult.discount.toString(), total: discountResult.total.toString(), paymentMethod: method.name, itemCount: lines.length },
          metadata: { paymentId: payment.id, cashShiftId: shift.id },
        },
      });
      return { order, payment, methodName: method.name, stockChanged };
    });

    publishEvent("orders.changed", { orderId: result.order.id });
    publishEvent("cash.changed", { shiftId: result.payment.cashShiftId, orderId: result.order.id });
    if (result.stockChanged) publishEvent("stock.changed", { orderId: result.order.id });
    publishEvent("dashboard.changed", { orderId: result.order.id });
    return Response.json({
      sale: {
        id: result.order.id,
        number: result.order.number,
        total: result.order.total.toString(),
        paymentMethod: result.methodName,
        createdAt: result.payment.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SHIFT_NOT_OPEN") return Response.json({ error: "No hay un turno de caja abierto" }, { status: 409 });
    if (message === "SHIFT_CONFLICT") return Response.json({ error: "La caja cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    if (message === "PAYMENT_METHOD_NOT_FOUND") return Response.json({ error: "El medio de pago no está disponible" }, { status: 404 });
    if (message === "PRODUCT_NOT_FOUND") return Response.json({ error: "Uno de los productos no existe o está inactivo" }, { status: 404 });
    if (message === "TOTAL_ZERO") return Response.json({ error: "La venta debe tener un total mayor a cero" }, { status: 409 });
    if (message === "WAREHOUSE_NOT_FOUND") return Response.json({ error: "No hay una ubicación de stock configurada" }, { status: 409 });
    if (message === "STOCK_CONFLICT") return Response.json({ error: "El stock cambió en otra terminal. Volvé a intentar." }, { status: 409 });
    return Response.json({ error: "No se pudo completar la venta. No se registró ningún movimiento." }, { status: 409 });
  }
}
