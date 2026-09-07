import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.REPORTS_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = schema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) return Response.json({ error: "Seleccioná un rango de fechas válido" }, { status: 400 });
  const from = new Date(`${parsed.data.from}T00:00:00.000-03:00`);
  const to = new Date(`${parsed.data.to}T23:59:59.999-03:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return Response.json({ error: "La fecha desde debe ser anterior o igual a la fecha hasta" }, { status: 400 });
  }

  const reports = await db.salesReport.findMany({
    where: { branch: { organizationId: auth.user.organizationId }, periodEnd: { gte: from, lte: to } },
    orderBy: { periodEnd: "desc" },
    take: 1000,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      cashTotal: true,
      virtualTotal: true,
      grandTotal: true,
      expectedCash: true,
      declaredCash: true,
      declaredVirtual: true,
      cashDifference: true,
      virtualDifference: true,
      totalDifference: true,
      saleCount: true,
      createdAt: true,
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
      cashShift: { select: { id: true, cashRegister: { select: { id: true, name: true } } } },
    },
  });
  const totals = reports.reduce((summary, report) => ({
    cash: summary.cash.add(report.cashTotal),
    virtual: summary.virtual.add(report.virtualTotal),
    grand: summary.grand.add(report.grandTotal),
    sales: summary.sales + report.saleCount,
  }), { cash: new Prisma.Decimal(0), virtual: new Prisma.Decimal(0), grand: new Prisma.Decimal(0), sales: 0 });

  return Response.json({
    from: parsed.data.from,
    to: parsed.data.to,
    totals: { cash: totals.cash.toString(), virtual: totals.virtual.toString(), grand: totals.grand.toString(), sales: totals.sales },
    reports: reports.map((report) => ({
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
      createdAt: report.createdAt,
      branch: report.branch,
      createdBy: report.createdBy,
      shift: { id: report.cashShift.id, register: report.cashShift.cashRegister },
    })),
  });
}
