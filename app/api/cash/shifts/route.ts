import { CashMovementType, CashShiftStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { serializable } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const schema = z.object({
  cashRegisterId: z.string().min(1),
  openingAmount: z.coerce.number().min(0).max(100_000_000),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.CASH_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Indicá una caja y un monto inicial válidos" }, { status: 400 });

  try {
    const shift = await serializable(async (tx) => {
      const register = await tx.cashRegister.findFirst({
        where: { id: parsed.data.cashRegisterId, isActive: true, branch: { organizationId: auth.user.organizationId } },
        include: { branch: true },
      });
      if (!register) throw new Error("REGISTER_NOT_FOUND");
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${register.branchId})) IS NULL AS locked`;
      const current = await tx.cashShift.findFirst({
        where: { cashRegister: { branchId: register.branchId }, status: CashShiftStatus.OPEN },
        select: { id: true },
      });
      if (current) throw new Error("SHIFT_ALREADY_OPEN");

      const openingAmount = new Prisma.Decimal(parsed.data.openingAmount).toDecimalPlaces(2);
      const created = await tx.cashShift.create({
        data: { cashRegisterId: register.id, openedById: auth.user.id, openingAmount },
      });
      await tx.cashMovement.create({
        data: {
          cashShiftId: created.id,
          userId: auth.user.id,
          type: CashMovementType.OPENING,
          amount: openingAmount,
          reason: "Apertura de caja",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "CASH_SHIFT_OPENED",
          entityType: "CashShift",
          entityId: created.id,
          after: { cashRegisterId: register.id, registerName: register.name, openingAmount: openingAmount.toString() },
        },
      });
      return created;
    });
    publishEvent("cash.changed", { shiftId: shift.id });
    return Response.json({ shift: { ...shift, openingAmount: shift.openingAmount.toString() } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REGISTER_NOT_FOUND") return Response.json({ error: "La caja seleccionada no existe o está inactiva" }, { status: 404 });
    if (message === "SHIFT_ALREADY_OPEN") return Response.json({ error: "La sucursal ya tiene un turno de caja abierto" }, { status: 409 });
    return Response.json({ error: "No se pudo abrir el turno de caja" }, { status: 409 });
  }
}
