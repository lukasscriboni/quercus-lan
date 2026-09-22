import type { Prisma } from "@prisma/client";
import { normalizeText } from "./normalize";

export type SearchableProduct = {
  name: string;
  barcode?: string | null;
};
export type ProductSearchMode = "name" | "barcode" | "all";

export function productSearchTokens(query: unknown) {
  const tokens = normalizeText(query).split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set(tokens)].slice(0, 12);
}

export function productSearchFilters(query: unknown, mode: ProductSearchMode = "all"): Prisma.ProductWhereInput[] {
  if (mode === "barcode") {
    const barcode = String(query ?? "").trim();
    return barcode ? [{ barcode: { equals: barcode, mode: "insensitive" } }] : [];
  }
  return productSearchTokens(query).map((token) => ({
    ...(mode === "name" ? { normalizedName: { contains: token } } : { OR: [{ normalizedName: { contains: token } }, { barcode: { contains: token, mode: "insensitive" } }] }),
  }));
}

export function matchesProductSearch(product: SearchableProduct, query: unknown, mode: ProductSearchMode = "all") {
  if (mode === "barcode") {
    const barcode = String(query ?? "").trim().toLocaleLowerCase();
    return barcode.length === 0 || String(product.barcode ?? "").trim().toLocaleLowerCase() === barcode;
  }
  const tokens = productSearchTokens(query);
  if (tokens.length === 0) return true;
  const fields = (mode === "name" ? [product.name] : [product.name, product.barcode]).map(normalizeText);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}
