import { drainKitchenPrintQueue } from "@/lib/kitchen-print-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.QUERCUS_PRINT_TOKEN;
  if (!expected || request.headers.get("x-quercus-print-token") !== expected) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  return Response.json({ jobs: drainKitchenPrintQueue() }, { headers: { "Cache-Control": "no-store" } });
}
