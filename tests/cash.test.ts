import { CashMovementType, PaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isCashMethod, reconcileCashShift, summarizeCashShift } from "../lib/cash";

describe("resumen de caja", () => {
  it("calcula el efectivo esperado sin sumar ventas electrónicas", () => {
    const summary = summarizeCashShift(
      10_000,
      [
        { type: CashMovementType.INCOME, amount: 2_000 },
        { type: CashMovementType.EXPENSE, amount: 750 },
        { type: CashMovementType.WITHDRAWAL, amount: 1_000 },
      ],
      [
        { amount: 5_000, status: PaymentStatus.COMPLETED, paymentMethod: { name: "Efectivo" } },
        { amount: 8_000, status: PaymentStatus.COMPLETED, paymentMethod: { name: "Débito" } },
      ],
    );

    expect(summary.salesTotal.toString()).toBe("13000");
    expect(summary.cashSales.toString()).toBe("5000");
    expect(summary.virtualSales.toString()).toBe("8000");
    expect(summary.expectedCash.toString()).toBe("15250");
  });

  it("ignora pagos anulados", () => {
    const summary = summarizeCashShift(1_000, [], [
      { amount: 500, status: PaymentStatus.VOIDED, paymentMethod: { name: "Efectivo" } },
    ]);
    expect(summary.salesTotal.toString()).toBe("0");
    expect(summary.expectedCash.toString()).toBe("1000");
  });

  it("reconoce efectivo sin depender de mayúsculas o espacios", () => {
    expect(isCashMethod(" EFECTIVO ")).toBe(true);
    expect(isCashMethod("Transferencia")).toBe(false);
  });

  it("combina el faltante o excedente declarado de efectivo y dinero virtual", () => {
    const reconciliation = reconcileCashShift(10_000, 8_000, 9_500, 8_200);
    expect(reconciliation.cashDifference.toString()).toBe("-500");
    expect(reconciliation.virtualDifference.toString()).toBe("200");
    expect(reconciliation.totalDifference.toString()).toBe("-300");
  });
});
