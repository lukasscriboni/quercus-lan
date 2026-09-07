import { StockMovementType } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = schema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) return Response.json({ error: "Seleccioná un rango de fechas válido" }, { status: 400 });

  const from = new Date(`${parsed.data.from}T00:00:00.000-03:00`);
  const to = new Date(`${parsed.data.to}T23:59:59.999-03:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return Response.json({ error: "La fecha desde debe ser anterior o igual a la fecha hasta" }, { status: 400 });
  }

  const movements = await db.stockMovement.findMany({
    where: {
      type: StockMovementType.PURCHASE,
      createdAt: { gte: from, lte: to },
      product: { organizationId: auth.user.organizationId },
    },
    orderBy: { createdAt: "desc" },
    take: 501,
    select: {
      id: true,
      quantity: true,
      previousQty: true,
      newQty: true,
      reason: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
      product: { select: { id: true, name: true, sku: true, barcode: true, unit: true } },
      warehouse: { select: { id: true, name: true } },
      user: { select: { id: true, displayName: true, username: true } },
    },
  });
  const visibleMovements = movements.slice(0, 500);
  const supplierIds = Array.from(new Set(visibleMovements.flatMap((movement) =>
    movement.referenceType === "SUPPLIER" && movement.referenceId ? [movement.referenceId] : [],
  )));
  const suppliers = supplierIds.length ? await db.supplier.findMany({
    where: { id: { in: supplierIds }, organizationId: auth.user.organizationId },
    select: { id: true, name: true, taxId: true, contactName: true, phone: true, email: true },
  }) : [];
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  return Response.json({
    from: parsed.data.from,
    to: parsed.data.to,
    hasMore: movements.length > 500,
    receipts: visibleMovements.map((movement) => ({
      id: movement.id,
      quantity: movement.quantity.toString(),
      previousQty: movement.previousQty.toString(),
      newQty: movement.newQty.toString(),
      reason: movement.reason,
      createdAt: movement.createdAt,
      product: movement.product,
      warehouse: movement.warehouse,
      user: movement.user,
      supplier: movement.referenceId ? supplierMap.get(movement.referenceId) ?? null : null,
    })),
  });
}
