import { describe, expect, it } from "vitest";
import { calculateDiscount } from "../lib/discount";

describe("descuentos de venta", () => {
  it("calcula descuentos porcentuales", () => {
    const result = calculateDiscount(10_000, "PERCENT", 15);
    expect(result.discount.toString()).toBe("1500");
    expect(result.total.toString()).toBe("8500");
  });

  it("calcula descuentos por importe", () => {
    const result = calculateDiscount("5250.50", "FIXED", 250);
    expect(result.discount.toString()).toBe("250.5");
    expect(result.total.toString()).toBe("5000");
  });

  it("redondea hacia abajo el total con descuento", () => {
    const result = calculateDiscount(1200, "PERCENT", 10);
    expect(result.discount.toString()).toBe("200");
    expect(result.total.toString()).toBe("1000");
  });

  it("nunca deja el total negativo", () => {
    const result = calculateDiscount(1000, "FIXED", 5000);
    expect(result.discount.toString()).toBe("1000");
    expect(result.total.toString()).toBe("0");
  });
});
