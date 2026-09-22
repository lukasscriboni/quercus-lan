import { describe, expect, it } from "vitest";
import { itemQuantitiesByProduct, sumItemQuantities, summarizePendingKitchenItems } from "../lib/order-item-summary";

describe("resumen de consumiciones", () => {
  it("suma las unidades cargadas aunque estén en líneas distintas", () => {
    expect(sumItemQuantities([{ quantity: "2" }, { quantity: 1 }, { quantity: "0.5" }])).toBe(3.5);
  });

  it("cuenta para cocina todos los productos pendientes, aunque todavía no tengan estación", () => {
    expect(summarizePendingKitchenItems([
      { quantity: "2", kitchenStationId: "cocina", status: "PENDING" },
      { quantity: "1", kitchenStationId: "barra", status: "SENT" },
      { quantity: "3", kitchenStationId: null, status: "PENDING" },
      { quantity: "0.5", kitchenStationId: "cocina", status: "PENDING" },
    ])).toEqual({ lines: 3, quantity: 5.5 });
  });

  it("agrupa las unidades por producto para mostrarlas en la búsqueda", () => {
    expect(itemQuantitiesByProduct([
      { productId: "café", quantity: "1" },
      { productId: "agua", quantity: "2" },
      { productId: "café", quantity: "3" },
    ])).toEqual({ café: 4, agua: 2 });
  });
});
