import { requireApiUser } from "@/lib/auth";
import { decodeCsv, parseCsv, suggestMapping } from "@/lib/csv-import";
import { PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_IMPORT);
  if ("error" in auth) return auth.error;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Seleccioná un archivo CSV" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "El CSV supera el límite de 10 MB" }, { status: 413 });
  const decoded = decodeCsv(new Uint8Array(await file.arrayBuffer()));
  const parsed = parseCsv(decoded.text);
  if (parsed.columns.length === 0) return Response.json({ error: "No se detectaron encabezados en el CSV" }, { status: 422 });
  return Response.json({
    fileName: file.name,
    encoding: decoded.encoding,
    delimiter: parsed.delimiter,
    columns: parsed.columns,
    mapping: suggestMapping(parsed.columns),
    totalRows: parsed.rows.length,
    preview: parsed.rows.slice(0, 20),
    rows: parsed.rows,
    parserErrors: parsed.parserErrors.slice(0, 100),
  });
}
