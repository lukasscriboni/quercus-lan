import { describe, expect, it } from "vitest";
import { isValidProductPrice } from "../lib/pricing-rules";
import { roundDownToPriceStep, roundToNearestPriceStep } from "../lib/pricing";

describe("precios de productos", () => {
  it("acepta solo múltiplos enteros de 100", () => {
    expect(isValidProductPrice(0)).toBe(true);
    expect(isValidProductPrice(3900)).toBe(true);
    expect(isValidProductPrice(3950)).toBe(false);
    expect(isValidProductPrice(100.5)).toBe(false);
    expect(isValidProductPrice(-100)).toBe(false);
  });

  it("redondea importes hacia abajo al centenar", () => {
    expect(roundDownToPriceStep("1080").toString()).toBe("1000");
    expect(roundDownToPriceStep("99.99").toString()).toBe("0");
  });

  it("redondea precios existentes al múltiplo más cercano", () => {
    expect(roundToNearestPriceStep("1049.99").toString()).toBe("1000");
    expect(roundToNearestPriceStep("1050").toString()).toBe("1100");
  });
});
