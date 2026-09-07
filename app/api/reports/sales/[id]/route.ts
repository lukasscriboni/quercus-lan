import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(PERMISSIONS.REPORTS_VIEW);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const report = await db.salesReport.findFirst({
    where: { id, branch: { organizationId: auth.user.organizationId } },
    include: {
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
      cashShift: {
        select: {
          id: true,
          openingAmount: true,
          closingAmount: true,
          expectedAmount: true,
          difference: true,
          virtualClosingAmount: true,
          virtualExpectedAmount: true,
          virtualDifference: true,
          totalDifference: true,
          cashRegister: { select: { id: true, name: true } },
          openedBy: { select: { displayName: true } },
          closedBy: { select: { displayName: true } },
        },
      },
    },
  });
  if (!report) return Response.json({ error: "El reporte no existe" }, { status: 404 });
  return Response.json({
    report: {
      id: report.id,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      cashTotal: report.cashTotal.toString(),
      virtualTotal: report.virtualTotal.toString(),
      grandTotal: report.grandTotal.toString(),
      expectedCash: report.expectedCash?.toString() ?? null,
      declaredCash: report.declaredCash?.toString() ?? null,
      declaredVirtual: report.declaredVirtual?.toString() ?? null,
      cashDifference: report.cashDifference?.toString() ?? null,
      virtualDifference: report.virtualDifference?.toString() ?? null,
      totalDifference: report.totalDifference?.toString() ?? null,
      saleCount: report.saleCount,
      sales: report.sales,
      createdAt: report.createdAt,
      branch: report.branch,
      createdBy: report.createdBy,
      shift: {
        id: report.cashShift.id,
        register: report.cashShift.cashRegister,
        openingAmount: report.cashShift.openingAmount.toString(),
        closingAmount: report.cashShift.closingAmount?.toString() ?? null,
        expectedAmount: report.cashShift.expectedAmount?.toString() ?? null,
        difference: report.cashShift.difference?.toString() ?? null,
        virtualClosingAmount: report.cashShift.virtualClosingAmount?.toString() ?? null,
        virtualExpectedAmount: report.cashShift.virtualExpectedAmount?.toString() ?? null,
        virtualDifference: report.cashShift.virtualDifference?.toString() ?? null,
        totalDifference: report.cashShift.totalDifference?.toString() ?? null,
        openedBy: report.cashShift.openedBy,
        closedBy: report.cashShift.closedBy,
      },
    },
  });
}
