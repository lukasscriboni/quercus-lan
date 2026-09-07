import { describe, expect, it } from "vitest";
import { decodeCsv, parseCsv, prepareRows, suggestMapping } from "../lib/csv-import";
import { normalizeText, parseArgentineNumber } from "../lib/normalize";

describe("normalización numérica argentina", () => {
  it.each([
    ["1500", 1500],
    ["1500,50", 1500.5],
    ["1.500,50", 1500.5],
    ["$ 1.500,50", 1500.5],
    ["ARS 12.345,67", 12345.67],
    ["1,234.56", 1234.56],
    ["(1.500,50)", -1500.5],
  ])("convierte %s", (value, expected) => expect(parseArgentineNumber(value)).toBe(expected));

  it("rechaza importes inválidos", () => {
    expect(parseArgentineNumber("sin precio")).toBeNull();
    expect(parseArgentineNumber("")).toBeNull();
  });
});

describe("lector CSV", () => {
  it("detecta punto y coma y coma decimal", () => {
    const parsed = parseCsv("Código;Descripción;Precio\nA1;Lager;1.500,50");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].Precio).toBe("1.500,50");
  });

  it("detecta coma y respeta campos entre comillas", () => {
    const parsed = parseCsv('SKU,Nombre,Precio\nA1,"Tónica, lata","1500,50"');
    expect(parsed.delimiter).toBe(",");
    expect(parsed.rows[0].Nombre).toBe("Tónica, lata");
  });

  it("omite filas vacías", () => {
    expect(parseCsv("SKU;Nombre\nA1;Agua\n\n  \n").rows).toHaveLength(1);
  });

  it("elimina BOM UTF-8 y lo informa", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Código;Nombre\n1;Café")]);
    const decoded = decodeCsv(bytes);
    expect(decoded.encoding).toBe("UTF-8 con BOM");
    expect(parseCsv(decoded.text).columns[0]).toBe("Código");
  });
});

describe("preparación de artículos", () => {
  const mapping = { Código: "sku", Descripción: "name", Rubro: "category", Precio: "price", Stock: "stock" } as const;

  it("propone un mapeo editable", () => {
    expect(suggestMapping(Object.keys(mapping))).toEqual(mapping);
  });

  it("acepta categorías repetidas normalizadas", () => {
    const result = prepareRows([
      { Código: "A1", Descripción: "Lager", Rubro: "Cervezas", Precio: "1500", Stock: "5" },
      { Código: "A2", Descripción: "IPA", Rubro: " CERVEZAS ", Precio: "1700", Stock: "4" },
    ], mapping);
    expect(result.errors).toHaveLength(0);
    expect(normalizeText(result.prepared[0].category)).toBe(normalizeText(result.prepared[1].category));
  });

  it("marca SKU repetido", () => {
    const result = prepareRows([
      { Código: "A1", Descripción: "Lager", Rubro: "Cervezas", Precio: "1500", Stock: "5" },
      { Código: "a1", Descripción: "IPA", Rubro: "Cervezas", Precio: "1700", Stock: "4" },
    ], mapping);
    expect(result.errors[0].message).toContain("SKU duplicado");
  });

  it("marca producto sin nombre", () => {
    const result = prepareRows([{ Código: "A1", Descripción: "", Rubro: "", Precio: "1500", Stock: "5" }], mapping);
    expect(result.errors[0].message).toBe("Producto sin nombre");
  });

  it("marca precio inválido", () => {
    const result = prepareRows([{ Código: "A1", Descripción: "Lager", Rubro: "", Precio: "x", Stock: "5" }], mapping);
    expect(result.errors[0].message).toBe("Precio inválido");
  });

  it("marca stock negativo", () => {
    const result = prepareRows([{ Código: "A1", Descripción: "Lager", Rubro: "", Precio: "1500", Stock: "-2" }], mapping);
    expect(result.errors[0].message).toContain("Stock negativo");
  });

  it("acepta campos opcionales ausentes", () => {
    const result = prepareRows([{ Nombre: "Agua" }], { Nombre: "name" });
    expect(result.errors).toHaveLength(0);
    expect(result.prepared[0]).toMatchObject({ name: "Agua", price: 0, cost: 0, unit: "UNIT", stockMode: "NONE" });
  });
});
