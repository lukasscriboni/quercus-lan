import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { IMPORT_FIELDS, prepareRows, type ColumnMapping } from "@/lib/csv-import";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.string().or(z.number()).or(z.null()))).max(5000),
  mapping: z.record(z.string(), z.enum(IMPORT_FIELDS)),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_IMPORT);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "La estructura del CSV no es válida o supera 5.000 filas" }, { status: 400 });
  const rows = parsed.data.rows as unknown as Record<string, string>[];
  const result = prepareRows(rows, parsed.data.mapping as ColumnMapping);
  const normalizedSkus = result.prepared.flatMap((row) => row.sku ? [normalizeText(row.sku)] : []);
  const barcodes = result.prepared.flatMap((row) => row.barcode ? [row.barcode] : []);
  const normalizedNames = result.prepared.map((row) => row.normalizedName);
  const clauses = [
    normalizedSkus.length ? { normalizedSku: { in: normalizedSkus } } : null,
    barcodes.length ? { barcode: { in: barcodes } } : null,
    normalizedNames.length ? { normalizedName: { in: normalizedNames } } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>;
  const existing = clauses.length ? await db.product.findMany({
    where: { organizationId: auth.user.organizationId, OR: clauses },
    select: { id: true, normalizedSku: true, barcode: true, normalizedName: true },
  }) : [];
  const skuSet = new Set(existing.flatMap((item) => item.normalizedSku ? [item.normalizedSku] : []));
  const barcodeSet = new Set(existing.flatMap((item) => item.barcode ? [item.barcode] : []));
  const nameSet = new Set(existing.map((item) => item.normalizedName));
  const existingCount = result.prepared.filter((row) =>
    (row.sku && skuSet.has(normalizeText(row.sku))) || (row.barcode && barcodeSet.has(row.barcode)) || nameSet.has(row.normalizedName),
  ).length;
  return Response.json({
    totalRows: rows.length,
    newRows: result.prepared.length - existingCount,
    existingRows: existingCount,
    errorRows: result.errors.length,
    errors: result.errors.slice(0, 100),
    validRows: result.prepared.length,
  });
}
