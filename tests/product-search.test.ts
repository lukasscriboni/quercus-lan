import { describe, expect, it } from "vitest";
import { matchesProductSearch, productSearchTokens } from "../lib/product-search";

const product = { name: "Crafter lata", sku: "CR-LAT-473", barcode: "7791234567890" };

describe("búsqueda flexible de productos", () => {
  it("encuentra un producto usando palabras incompletas", () => {
    expect(matchesProductSearch(product, "craf lat")).toBe(true);
  });

  it("encuentra el producto aunque se invierta el orden", () => {
    expect(matchesProductSearch(product, "lat cra")).toBe(true);
  });

  it("ignora mayúsculas y acentos", () => {
    expect(matchesProductSearch({ name: "Café frío en lata" }, "FRI caf")).toBe(true);
  });

  it("busca por código de barras pero no por SKU", () => {
    expect(matchesProductSearch(product, "67890")).toBe(true);
    expect(matchesProductSearch(product, "CR-LAT-473")).toBe(false);
  });

  it("separa estrictamente el modo nombre del modo código de barras", () => {
    expect(matchesProductSearch(product, "crafter", "name")).toBe(true);
    expect(matchesProductSearch(product, "779123", "name")).toBe(false);
    expect(matchesProductSearch(product, "779123", "barcode")).toBe(false);
    expect(matchesProductSearch(product, "7791234567890", "barcode")).toBe(true);
    expect(matchesProductSearch(product, "crafter", "barcode")).toBe(false);
  });

  it("exige que todos los fragmentos escritos coincidan", () => {
    expect(matchesProductSearch(product, "craf botella")).toBe(false);
  });

  it("elimina fragmentos repetidos y limita búsquedas excesivas", () => {
    expect(productSearchTokens("CRA cra lat")).toEqual(["cra", "lat"]);
    expect(productSearchTokens("1 2 3 4 5 6 7 8 9 10 11 12 13")).toHaveLength(12);
  });
});
