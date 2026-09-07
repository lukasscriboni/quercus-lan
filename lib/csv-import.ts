import Papa from "papaparse";
import { cleanText, normalizeText, parseArgentineNumber, parseBoolean } from "./normalize";

export const IMPORT_FIELDS = [
  "ignore",
  "sku",
  "barcode",
  "name",
  "category",
  "price",
  "cost",
  "stock",
  "minimum",
  "unit",
  "brand",
  "supplier",
  "taxRate",
  "isActive",
  "stockMode",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Record<string, ImportField>;

export const FIELD_LABELS: Record<ImportField, string> = {
  ignore: "Ignorar",
  sku: "SKU / código",
  barcode: "Código de barras",
  name: "Nombre / descripción",
  category: "Categoría / rubro",
  price: "Precio",
  cost: "Costo",
  stock: "Stock inicial",
  minimum: "Stock mínimo",
  unit: "Unidad",
  brand: "Marca",
  supplier: "Proveedor",
  taxRate: "IVA",
  isActive: "Activo",
  stockMode: "Modo de stock",
};

const ALIASES: Record<Exclude<ImportField, "ignore">, string[]> = {
  sku: ["sku", "codigo", "cod", "codigo articulo", "id articulo", "articulo"],
  barcode: ["barcode", "ean", "codigo de barras", "cod barras", "gtin"],
  name: ["nombre", "descripcion", "detalle", "producto", "articulo descripcion"],
  category: ["categoria", "rubro", "familia", "grupo", "departamento"],
  price: ["precio", "precio venta", "venta", "pvp", "importe"],
  cost: ["costo", "coste", "precio costo", "costo unitario"],
  stock: ["stock", "existencia", "cantidad", "saldo", "stock actual"],
  minimum: ["stock minimo", "minimo", "punto reposicion", "reposicion"],
  unit: ["unidad", "u m", "unidad medida", "medida"],
  brand: ["marca", "brand", "fabricante"],
  supplier: ["proveedor", "supplier", "distribuidor"],
  taxRate: ["iva", "alicuota", "impuesto", "tasa iva"],
  isActive: ["activo", "habilitado", "estado"],
  stockMode: ["modo stock", "control stock", "stock mode"],
};

export type PreparedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  sku?: string;
  barcode?: string;
  name: string;
  normalizedName: string;
  category?: string;
  price: number;
  cost: number;
  stock?: number;
  minimum: number;
  unit: "UNIT" | "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER";
  brand?: string;
  supplier?: string;
  taxRate: number;
  isActive: boolean;
  stockMode: "NONE" | "DIRECT" | "RECIPE";
};

export type RowError = { rowNumber: number; message: string; rawData?: Record<string, string> };

function countDelimiter(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

export function detectDelimiter(text: string): "," | ";" {
  const samples = text.split(/\r?\n/).filter(Boolean).slice(0, 8);
  const comma = samples.reduce((sum, line) => sum + countDelimiter(line, ","), 0);
  const semicolon = samples.reduce((sum, line) => sum + countDelimiter(line, ";"), 0);
  return semicolon > comma ? ";" : ",";
}

export function decodeCsv(bytes: Uint8Array) {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const source = hasBom ? bytes.slice(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(source), encoding: hasBom ? "UTF-8 con BOM" : "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(source), encoding: "Windows-1252" };
  }
}

export function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  const columns = (result.meta.fields ?? []).filter(Boolean);
  return {
    delimiter,
    columns,
    rows: result.data,
    parserErrors: result.errors.map((error) => ({ rowNumber: (error.row ?? 0) + 2, message: error.message })),
  };
}

export function suggestMapping(columns: string[]): ColumnMapping {
  const used = new Set<ImportField>();
  return Object.fromEntries(columns.map((column) => {
    const normalized = normalizeText(column).replace(/[_-]+/g, " ");
    const suggestion = (Object.entries(ALIASES) as [Exclude<ImportField, "ignore">, string[]][])
      .find(([field, aliases]) => !used.has(field) && aliases.some((alias) => normalized === alias || normalized.includes(alias)))?.[0] ?? "ignore";
    if (suggestion !== "ignore") used.add(suggestion);
    return [column, suggestion];
  }));
}

function unitValue(value: unknown): PreparedRow["unit"] {
  const normalized = normalizeText(value);
  if (["g", "gr", "gramo", "gramos", "gram"].includes(normalized)) return "GRAM";
  if (["kg", "kilo", "kilos", "kilogramo", "kilogram"].includes(normalized)) return "KILOGRAM";
  if (["ml", "mililitro", "mililitros"].includes(normalized)) return "MILLILITER";
  if (["l", "lt", "litro", "litros"].includes(normalized)) return "LITER";
  return "UNIT";
}

function stockModeValue(value: unknown, hasStock: boolean): PreparedRow["stockMode"] {
  const normalized = normalizeText(value);
  if (["receta", "recipe", "ingredientes"].includes(normalized)) return "RECIPE";
  if (["ninguno", "none", "no"].includes(normalized)) return "NONE";
  if (["directo", "direct", "si"].includes(normalized)) return "DIRECT";
  return hasStock ? "DIRECT" : "NONE";
}

function sourceFor(mapping: ColumnMapping, field: ImportField) {
  return Object.entries(mapping).find(([, target]) => target === field)?.[0];
}

export function prepareRows(rows: Record<string, string>[], mapping: ColumnMapping) {
  const prepared: PreparedRow[] = [];
  const errors: RowError[] = [];
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();
  const fields = Object.fromEntries(IMPORT_FIELDS.map((field) => [field, sourceFor(mapping, field)])) as Record<ImportField, string | undefined>;

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const name = cleanText(fields.name ? raw[fields.name] : undefined);
    if (!name) {
      errors.push({ rowNumber, message: "Producto sin nombre", rawData: raw });
      return;
    }
    const parseField = (field: "price" | "cost" | "stock" | "minimum" | "taxRate", fallback: number) => {
      const source = fields[field];
      const original = source ? raw[source] : undefined;
      if (original === undefined || String(original).trim() === "") return fallback;
      return parseArgentineNumber(original);
    };
    const price = parseField("price", 0);
    const cost = parseField("cost", 0);
    const stock = fields.stock ? parseField("stock", 0) : undefined;
    const minimum = parseField("minimum", 0);
    const taxRate = parseField("taxRate", 21);
    const invalid = [
      [price === null || price < 0, "Precio inválido"],
      [cost === null || cost < 0, "Costo inválido"],
      [stock === null || (stock !== undefined && stock < 0), "Stock negativo o inválido"],
      [minimum === null || minimum < 0, "Stock mínimo inválido"],
      [taxRate === null || taxRate < 0 || taxRate > 100, "IVA inválido"],
    ] as const;
    const issue = invalid.find(([condition]) => condition)?.[1];
    if (issue) {
      errors.push({ rowNumber, message: issue, rawData: raw });
      return;
    }

    const sku = cleanText(fields.sku ? raw[fields.sku] : undefined);
    const barcode = cleanText(fields.barcode ? raw[fields.barcode] : undefined);
    const normalizedSku = sku ? normalizeText(sku) : undefined;
    if (normalizedSku && seenSku.has(normalizedSku)) {
      errors.push({ rowNumber, message: `SKU duplicado; también aparece en la fila ${seenSku.get(normalizedSku)}`, rawData: raw });
      return;
    }
    if (barcode && seenBarcode.has(barcode)) {
      errors.push({ rowNumber, message: `Código de barras duplicado; también aparece en la fila ${seenBarcode.get(barcode)}`, rawData: raw });
      return;
    }
    if (normalizedSku) seenSku.set(normalizedSku, rowNumber);
    if (barcode) seenBarcode.set(barcode, rowNumber);

    prepared.push({
      rowNumber,
      raw,
      sku,
      barcode,
      name,
      normalizedName: normalizeText(name),
      category: cleanText(fields.category ? raw[fields.category] : undefined),
      price: price as number,
      cost: cost as number,
      stock: stock as number | undefined,
      minimum: minimum as number,
      unit: unitValue(fields.unit ? raw[fields.unit] : undefined),
      brand: cleanText(fields.brand ? raw[fields.brand] : undefined),
      supplier: cleanText(fields.supplier ? raw[fields.supplier] : undefined),
      taxRate: taxRate as number,
      isActive: parseBoolean(fields.isActive ? raw[fields.isActive] : undefined),
      stockMode: stockModeValue(fields.stockMode ? raw[fields.stockMode] : undefined, Boolean(fields.stock)),
    });
  });

  return { prepared, errors };
}
