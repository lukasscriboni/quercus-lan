import { CashMovementType, CashShiftStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { serializable } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  cashShiftId: z.string().min(1),
  shiftVersion: z.coerce.number().int().positive(),
  type: z.enum([CashMovementType.INCOME, CashMovementType.EXPENSE, CashMovementType.WITHDRAWAL]),
  amount: z.coerce.number().positive().max(100_000_000),
  reason: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.CASH_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Completá el tipo, monto y motivo del movimiento" }, { status: 400 });

  try {
    const movement = await serializable(async (tx) => {
      const shift = await tx.cashShift.findFirst({
        where: { id: parsed.data.cashShiftId, cashRegister: { branch: { organizationId: auth.user.organizationId } } },
      });
      if (!shift) throw new Error("NOT_FOUND");
      if (shift.status !== CashShiftStatus.OPEN) throw new Error("SHIFT_CLOSED");
      const changed = await tx.cashShift.updateMany({
        where: { id: shift.id, version: parsed.data.shiftVersion, status: CashShiftStatus.OPEN },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");

      const amount = new Prisma.Decimal(parsed.data.amount).toDecimalPlaces(2);
      const created = await tx.cashMovement.create({
        data: {
          cashShiftId: shift.id,
          userId: auth.user.id,
          type: parsed.data.type,
          amount,
          reason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "CASH_MOVEMENT_CREATED",
          entityType: "CashMovement",
          entityId: created.id,
          after: { shiftId: shift.id, type: created.type, amount: amount.toString(), reason: created.reason },
        },
      });
      return created;
    });
    publishEvent("cash.changed", { shiftId: movement.cashShiftId });
    return Response.json({ movement: { ...movement, amount: movement.amount.toString() } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "El turno de caja no existe" }, { status: 404 });
    if (message === "SHIFT_CLOSED") return Response.json({ error: "El turno de caja ya está cerrado" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La caja cambió en otra terminal. Se actualizarán los datos." }, { status: 409 });
    return Response.json({ error: "No se pudo registrar el movimiento" }, { status: 409 });
  }
}
