import type { Prisma } from "@prisma/client";
import { normalizeText } from "./normalize";

export type SearchableProduct = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
};

export function productSearchTokens(query: unknown) {
  const tokens = normalizeText(query).split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set(tokens)].slice(0, 12);
}

export function productSearchFilters(query: unknown): Prisma.ProductWhereInput[] {
  return productSearchTokens(query).map((token) => ({
    OR: [
      { normalizedName: { contains: token } },
      { normalizedSku: { contains: token } },
      { barcode: { contains: token, mode: "insensitive" } },
    ],
  }));
}

export function matchesProductSearch(product: SearchableProduct, query: unknown) {
  const tokens = productSearchTokens(query);
  if (tokens.length === 0) return true;
  const fields = [product.name, product.sku, product.barcode].map(normalizeText);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}
