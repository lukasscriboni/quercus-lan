import { OrderItemStatus, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { classifyPaymentMethod } from "@/lib/sales-report";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.REPORTS_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = schema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) return Response.json({ error: "Seleccioná un rango de fechas válido" }, { status: 400 });
  const from = new Date(`${parsed.data.from}T00:00:00.000-03:00`);
  const to = new Date(`${parsed.data.to}T23:59:59.999-03:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return Response.json({ error: "La fecha desde debe ser anterior o igual a la fecha hasta" }, { status: 400 });
  }

  const [reports, payments] = await Promise.all([db.salesReport.findMany({
    where: { branch: { organizationId: auth.user.organizationId }, periodEnd: { gte: from, lte: to } },
    orderBy: { periodEnd: "desc" },
    take: 1000,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      cashTotal: true,
      virtualTotal: true,
      grandTotal: true,
      expectedCash: true,
      declaredCash: true,
      declaredVirtual: true,
      cashDifference: true,
      virtualDifference: true,
      totalDifference: true,
      saleCount: true,
      createdAt: true,
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
      cashShift: { select: { id: true, cashRegister: { select: { id: true, name: true } } } },
    },
  }), db.payment.findMany({
    where: { status: PaymentStatus.COMPLETED, createdAt: { gte: from, lte: to }, order: { branch: { organizationId: auth.user.organizationId } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      amount: true,
      createdAt: true,
      paymentMethod: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          number: true,
          type: true,
          subtotal: true,
          discount: true,
          total: true,
          diningTable: { select: { name: true } },
          openedBy: { select: { displayName: true } },
          items: {
            where: { status: { not: OrderItemStatus.CANCELLED } },
            orderBy: { createdAt: "asc" },
            select: { id: true, productId: true, nameSnapshot: true, quantity: true, unitPrice: true, total: true },
          },
        },
      },
    },
  })]);
  const totals = reports.reduce((summary, report) => ({
    cash: summary.cash.add(report.cashTotal),
    virtual: summary.virtual.add(report.virtualTotal),
    grand: summary.grand.add(report.grandTotal),
    sales: summary.sales + report.saleCount,
  }), { cash: new Prisma.Decimal(0), virtual: new Prisma.Decimal(0), grand: new Prisma.Decimal(0), sales: 0 });
  const rangeDays = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const registryTotal = payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
  const registryUnits = payments.reduce((sum, payment) => payment.order.items.reduce((itemSum, item) => itemSum.add(item.quantity), sum), new Prisma.Decimal(0));
  const weekFactor = new Prisma.Decimal(7).div(rangeDays);
  const yearFactor = new Prisma.Decimal(365).div(rangeDays);
  const productSummary = new Map<string, { productId: string; name: string; units: Prisma.Decimal; amount: Prisma.Decimal; saleIds: Set<string> }>();
  for (const payment of payments) {
    for (const item of payment.order.items) {
      const current = productSummary.get(item.productId) ?? { productId: item.productId, name: item.nameSnapshot, units: new Prisma.Decimal(0), amount: new Prisma.Decimal(0), saleIds: new Set<string>() };
      current.units = current.units.add(item.quantity);
      current.amount = current.amount.add(item.total);
      current.saleIds.add(payment.id);
      productSummary.set(item.productId, current);
    }
  }

  return Response.json({
    from: parsed.data.from,
    to: parsed.data.to,
    totals: { cash: totals.cash.toString(), virtual: totals.virtual.toString(), grand: totals.grand.toString(), sales: totals.sales },
    registry: {
      totals: {
        amount: registryTotal.toDecimalPlaces(2).toString(),
        sales: payments.length,
        units: registryUnits.toDecimalPlaces(3).toString(),
        weeklySalesAverage: new Prisma.Decimal(payments.length).mul(weekFactor).toDecimalPlaces(2).toString(),
        annualSalesAverage: new Prisma.Decimal(payments.length).mul(yearFactor).toDecimalPlaces(2).toString(),
        weeklyAmountAverage: registryTotal.mul(weekFactor).toDecimalPlaces(2).toString(),
        annualAmountAverage: registryTotal.mul(yearFactor).toDecimalPlaces(2).toString(),
      },
      paymentMethods: Array.from(new Map(payments.map((payment) => [payment.paymentMethod.id, payment.paymentMethod])).values()),
      products: Array.from(productSummary.values()).map((product) => ({
        productId: product.productId,
        name: product.name,
        units: product.units.toDecimalPlaces(3).toString(),
        amount: product.amount.toDecimalPlaces(2).toString(),
        sales: product.saleIds.size,
        weeklyUnitsAverage: product.units.mul(weekFactor).toDecimalPlaces(2).toString(),
        annualUnitsAverage: product.units.mul(yearFactor).toDecimalPlaces(2).toString(),
      })).sort((first, second) => Number(second.units) - Number(first.units)),
      sales: payments.map((payment) => ({
        paymentId: payment.id,
        orderId: payment.order.id,
        orderNumber: payment.order.number,
        source: payment.order.diningTable?.name ?? (payment.order.type === "COUNTER" ? "Venta directa" : "Pedido sin mesa"),
        openedBy: payment.order.openedBy.displayName,
        paymentMethodId: payment.paymentMethod.id,
        paymentMethod: payment.paymentMethod.name,
        category: classifyPaymentMethod(payment.paymentMethod.name),
        amount: payment.amount.toString(),
        subtotal: payment.order.subtotal.toString(),
        discount: payment.order.discount.toString(),
        total: payment.order.total.toString(),
        paidAt: payment.createdAt,
        items: payment.order.items.map((item) => ({ id: item.id, productId: item.productId, name: item.nameSnapshot, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString(), total: item.total.toString() })),
      })),
    },
    reports: reports.map((report) => ({
      id: report.id,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      cashTotal: report.cashTotal.toString(),
      virtualTotal: report.virtualTotal.toString(),
      grandTotal: report.grandTotal.toString(),
      expectedCash: report.expectedCash?.toString() ?? null,
      declaredCash: report.declaredCash?.toString() ?? null,
      declaredVirtual: report.declaredVirtual?.toString() ?? null,
      cashDifference: report.cashDifference?.toString() ?? null,
      virtualDifference: report.virtualDifference?.toString() ?? null,
      totalDifference: report.totalDifference?.toString() ?? null,
      saleCount: report.saleCount,
      createdAt: report.createdAt,
      branch: report.branch,
      createdBy: report.createdBy,
      shift: { id: report.cashShift.id, register: report.cashShift.cashRegister },
    })),
  });
}
