import { Prisma } from "@prisma/client";
import { normalizeText } from "./normalize";

export type PaymentCategory = "CASH" | "VIRTUAL";

export type SalesReportPayment = {
  id: string;
  amount: Prisma.Decimal | number | string;
  createdAt: Date;
  paymentMethod: { name: string };
  order: {
    number: number;
    type: string;
    diningTable: { name: string } | null;
  };
};

export type SalesReportEntry = {
  paymentId: string;
  orderNumber: number;
  source: string;
  paymentMethod: string;
  category: PaymentCategory;
  amount: string;
  paidAt: string;
};

export function classifyPaymentMethod(name: string): PaymentCategory {
  const normalized = normalizeText(name);
  return normalized.includes("efectivo") || normalized === "cash" ? "CASH" : "VIRTUAL";
}

export function buildSalesReport(payments: SalesReportPayment[]) {
  const sales: SalesReportEntry[] = payments
    .map((payment) => ({
      paymentId: payment.id,
      orderNumber: payment.order.number,
      source: payment.order.diningTable?.name ?? (payment.order.type === "COUNTER" ? "Venta directa" : "Pedido sin mesa"),
      paymentMethod: payment.paymentMethod.name,
      category: classifyPaymentMethod(payment.paymentMethod.name),
      amount: new Prisma.Decimal(payment.amount).toDecimalPlaces(2).toString(),
      paidAt: payment.createdAt.toISOString(),
    }))
    .sort((first, second) => first.paidAt.localeCompare(second.paidAt));
  const cashTotal = sales.reduce((total, sale) => sale.category === "CASH" ? total.add(sale.amount) : total, new Prisma.Decimal(0)).toDecimalPlaces(2);
  const virtualTotal = sales.reduce((total, sale) => sale.category === "VIRTUAL" ? total.add(sale.amount) : total, new Prisma.Decimal(0)).toDecimalPlaces(2);
  return { sales, cashTotal, virtualTotal, grandTotal: cashTotal.add(virtualTotal).toDecimalPlaces(2), saleCount: sales.length };
}
