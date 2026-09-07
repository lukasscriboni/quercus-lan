import { StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { adjustStock } from "@/lib/inventory";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "WASTE"]),
  quantity: z.coerce.number().finite().refine((value) => value !== 0, "La cantidad no puede ser cero"),
  reason: z.string().trim().min(3).max(300),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revisá cantidad y motivo", details: parsed.error.flatten() }, { status: 400 });
  const { productId, warehouseId, type, reason } = parsed.data;
  const quantity = type === "EXIT" || type === "WASTE" ? -Math.abs(parsed.data.quantity) : type === "ENTRY" ? Math.abs(parsed.data.quantity) : parsed.data.quantity;
  try {
    const movement = await adjustStock({
      organizationId: auth.user.organizationId,
      productId,
      warehouseId,
      userId: auth.user.id,
      quantity,
      type: StockMovementType[type],
      reason,
    });
    publishEvent("stock.changed", { productId, warehouseId });
    return Response.json({ movement });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^CONFLICT:\s*/, "") : "No se pudo ajustar el stock";
    const status = error instanceof Error && error.message.startsWith("CONFLICT:") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
