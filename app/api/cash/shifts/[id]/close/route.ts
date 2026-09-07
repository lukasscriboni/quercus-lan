import { CashMovementType, CashShiftStatus, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { reconcileCashShift, summarizeCashShift } from "@/lib/cash";
import { serializable } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";
import { buildSalesReport } from "@/lib/sales-report";

const schema = z.object({
  version: z.coerce.number().int().positive(),
  closingAmount: z.coerce.number().min(0).max(100_000_000),
  virtualClosingAmount: z.coerce.number().min(0).max(100_000_000),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.CASH_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Indicá el efectivo y el dinero virtual declarados al cierre" }, { status: 400 });
  const { id } = await context.params;

  try {
    const shift = await serializable(async (tx) => {
      const current = await tx.cashShift.findFirst({
        where: { id, cashRegister: { branch: { organizationId: auth.user.organizationId } } },
        include: {
          movements: true,
          payments: {
            where: { status: PaymentStatus.COMPLETED },
            include: {
              paymentMethod: { select: { name: true } },
              order: { select: { number: true, type: true, diningTable: { select: { name: true } } } },
            },
          },
          cashRegister: { select: { name: true, branchId: true } },
        },
      });
      if (!current) throw new Error("NOT_FOUND");
      if (current.status !== CashShiftStatus.OPEN) throw new Error("ALREADY_CLOSED");

      const summary = summarizeCashShift(current.openingAmount, current.movements, current.payments);
      const closingAmount = new Prisma.Decimal(parsed.data.closingAmount).toDecimalPlaces(2);
      const virtualClosingAmount = new Prisma.Decimal(parsed.data.virtualClosingAmount).toDecimalPlaces(2);
      const closedAt = new Date();
      const reportData = buildSalesReport(current.payments);
      const virtualExpectedAmount = reportData.virtualTotal;
      const { cashDifference, virtualDifference, totalDifference } = reconcileCashShift(summary.expectedCash, virtualExpectedAmount, closingAmount, virtualClosingAmount);
      const changed = await tx.cashShift.updateMany({
        where: { id, version: parsed.data.version, status: CashShiftStatus.OPEN },
        data: {
          status: CashShiftStatus.CLOSED,
          closedById: auth.user.id,
          closingAmount,
          expectedAmount: summary.expectedCash,
          difference: cashDifference,
          virtualClosingAmount,
          virtualExpectedAmount,
          virtualDifference,
          totalDifference,
          closedAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("CONFLICT");
      const report = await tx.salesReport.create({
        data: {
          branchId: current.cashRegister.branchId,
          cashShiftId: id,
          createdById: auth.user.id,
          periodStart: current.openedAt,
          periodEnd: closedAt,
          cashTotal: reportData.cashTotal,
          virtualTotal: reportData.virtualTotal,
          grandTotal: reportData.grandTotal,
          expectedCash: summary.expectedCash,
          declaredCash: closingAmount,
          declaredVirtual: virtualClosingAmount,
          cashDifference,
          virtualDifference,
          totalDifference,
          saleCount: reportData.saleCount,
          sales: reportData.sales as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.cashMovement.create({
        data: {
          cashShiftId: id,
          userId: auth.user.id,
          type: CashMovementType.CLOSING,
          amount: closingAmount,
          reason: "Cierre de caja",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: auth.user.organizationId,
          userId: auth.user.id,
          action: "CASH_SHIFT_CLOSED",
          entityType: "CashShift",
          entityId: id,
          before: { status: current.status, version: current.version },
          after: {
            status: CashShiftStatus.CLOSED,
            registerName: current.cashRegister.name,
            closingAmount: closingAmount.toString(),
            expectedAmount: summary.expectedCash.toString(),
            cashDifference: cashDifference.toString(),
            virtualDeclared: virtualClosingAmount.toString(),
            virtualExpected: virtualExpectedAmount.toString(),
            virtualDifference: virtualDifference.toString(),
            totalDifference: totalDifference.toString(),
            reportId: report.id,
            cashSales: reportData.cashTotal.toString(),
            virtualSales: reportData.virtualTotal.toString(),
            salesTotal: reportData.grandTotal.toString(),
            saleCount: reportData.saleCount,
          },
        },
      });
      return { id, closingAmount, expectedAmount: summary.expectedCash, cashDifference, virtualClosingAmount, virtualExpectedAmount, virtualDifference, totalDifference, reportId: report.id };
    });
    publishEvent("cash.changed", { shiftId: id });
    return Response.json({
      shift: {
        id: shift.id,
        closingAmount: shift.closingAmount.toString(),
        expectedAmount: shift.expectedAmount.toString(),
        cashDifference: shift.cashDifference.toString(),
        virtualClosingAmount: shift.virtualClosingAmount.toString(),
        virtualExpectedAmount: shift.virtualExpectedAmount.toString(),
        virtualDifference: shift.virtualDifference.toString(),
        totalDifference: shift.totalDifference.toString(),
        reportId: shift.reportId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return Response.json({ error: "El turno de caja no existe" }, { status: 404 });
    if (message === "ALREADY_CLOSED") return Response.json({ error: "El turno de caja ya fue cerrado" }, { status: 409 });
    if (message === "CONFLICT") return Response.json({ error: "La caja cambió en otra terminal. Revisá los importes antes de cerrar." }, { status: 409 });
    return Response.json({ error: "No se pudo cerrar la caja" }, { status: 409 });
  }
}
