import { OrderStatus, OrderType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ internalLabel: z.string().trim().max(80) });
const activeStatuses = [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "La anotación puede tener hasta 80 caracteres" }, { status: 400 });
  const { id } = await context.params;
  const changed = await db.order.updateMany({
    where: { id, type: OrderType.TABLE, status: { in: activeStatuses }, branch: { organizationId: auth.user.organizationId } },
    data: { internalLabel: parsed.data.internalLabel || null },
  });
  if (changed.count !== 1) return Response.json({ error: "La cuenta de esta mesa ya no está abierta" }, { status: 409 });
  return Response.json({ internalLabel: parsed.data.internalLabel || null });
}
