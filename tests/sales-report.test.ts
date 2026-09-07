import { describe, expect, it } from "vitest";
import { buildSalesReport, classifyPaymentMethod } from "../lib/sales-report";

describe("sales reports", () => {
  it("clasifica efectivo separado de medios virtuales", () => {
    expect(classifyPaymentMethod("Efectivo")).toBe("CASH");
    expect(classifyPaymentMethod("Cobro en efectivo")).toBe("CASH");
    for (const method of ["Crédito", "Débito", "Transferencia", "Mercado Pago", "QR"]) {
      expect(classifyPaymentMethod(method)).toBe("VIRTUAL");
    }
  });

  it("genera el detalle y los totales del reporte", () => {
    const report = buildSalesReport([
      { id: "p1", amount: "1200", createdAt: new Date("2026-09-01T12:00:00Z"), paymentMethod: { name: "Efectivo" }, order: { number: 10, type: "DINE_IN", diningTable: { name: "Mesa 4" } } },
      { id: "p2", amount: "800", createdAt: new Date("2026-09-01T13:00:00Z"), paymentMethod: { name: "Transferencia" }, order: { number: 11, type: "COUNTER", diningTable: null } },
    ]);
    expect(report.cashTotal.toString()).toBe("1200");
    expect(report.virtualTotal.toString()).toBe("800");
    expect(report.grandTotal.toString()).toBe("2000");
    expect(report.saleCount).toBe(2);
    expect(report.sales[1]).toMatchObject({ source: "Venta directa", category: "VIRTUAL" });
  });
});
