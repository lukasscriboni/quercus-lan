import { CashMovementType, PaymentStatus, Prisma } from "@prisma/client";

type ShiftMovement = { type: CashMovementType; amount: Prisma.Decimal.Value };
type ShiftPayment = {
  amount: Prisma.Decimal.Value;
  status: PaymentStatus;
  paymentMethod: { name: string };
};

function sum(values: Prisma.Decimal.Value[]) {
  return values.reduce<Prisma.Decimal>((total, value) => total.add(value), new Prisma.Decimal(0));
}

export function isCashMethod(name: string) {
  return name.trim().toLocaleLowerCase("es-AR") === "efectivo";
}

export function summarizeCashShift(
  openingAmount: Prisma.Decimal.Value,
  movements: ShiftMovement[],
  payments: ShiftPayment[],
) {
  const completedPayments = payments.filter((payment) => payment.status === PaymentStatus.COMPLETED);
  const salesTotal = sum(completedPayments.map((payment) => payment.amount));
  const cashSales = sum(completedPayments.filter((payment) => isCashMethod(payment.paymentMethod.name)).map((payment) => payment.amount));
  const virtualSales = salesTotal.sub(cashSales).toDecimalPlaces(2);
  const income = sum(movements.filter((movement) => movement.type === CashMovementType.INCOME).map((movement) => movement.amount));
  const expenses = sum(movements.filter((movement) => movement.type === CashMovementType.EXPENSE).map((movement) => movement.amount));
  const withdrawals = sum(movements.filter((movement) => movement.type === CashMovementType.WITHDRAWAL).map((movement) => movement.amount));
  const refunds = sum(movements.filter((movement) => movement.type === CashMovementType.REFUND).map((movement) => movement.amount));
  const expectedCash = new Prisma.Decimal(openingAmount)
    .add(cashSales)
    .add(income)
    .sub(expenses)
    .sub(withdrawals)
    .sub(refunds)
    .toDecimalPlaces(2);

  return { salesTotal, cashSales, virtualSales, income, expenses, withdrawals, refunds, expectedCash };
}

export function reconcileCashShift(
  expectedCash: Prisma.Decimal.Value,
  expectedVirtual: Prisma.Decimal.Value,
  declaredCash: Prisma.Decimal.Value,
  declaredVirtual: Prisma.Decimal.Value,
) {
  const cashDifference = new Prisma.Decimal(declaredCash).sub(expectedCash).toDecimalPlaces(2);
  const virtualDifference = new Prisma.Decimal(declaredVirtual).sub(expectedVirtual).toDecimalPlaces(2);
  const totalDifference = cashDifference.add(virtualDifference).toDecimalPlaces(2);
  return { cashDifference, virtualDifference, totalDifference };
}
