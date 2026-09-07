import { CashShiftStatus, OrderItemStatus, OrderStatus, OrderType } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { summarizeCashShift } from "@/lib/cash";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const pendingStatuses = [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED];

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.CASH_VIEW);
  if ("error" in auth) return auth.error;

  const branch = await db.branch.findFirst({
    where: { organizationId: auth.user.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });

  const [registers, methods, openShift, pendingOrders] = await Promise.all([
    db.cashRegister.findMany({
      where: { branchId: branch.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.cashShift.findFirst({
      where: { status: CashShiftStatus.OPEN, cashRegister: { branchId: branch.id } },
      orderBy: { openedAt: "desc" },
      include: {
        cashRegister: { select: { id: true, name: true } },
        openedBy: { select: { id: true, displayName: true } },
        movements: { orderBy: { createdAt: "desc" }, include: { user: { select: { displayName: true } } } },
        payments: { where: { status: "COMPLETED" }, include: { paymentMethod: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      },
    }),
    db.order.findMany({
      where: { branchId: branch.id, type: OrderType.TABLE, status: { in: pendingStatuses } },
      orderBy: [{ status: "desc" }, { openedAt: "asc" }],
      select: {
        id: true,
        number: true,
        status: true,
        guestCount: true,
        subtotal: true,
        discount: true,
        total: true,
        version: true,
        openedAt: true,
        items: {
          where: { status: { not: OrderItemStatus.CANCELLED } },
          orderBy: { createdAt: "asc" },
          select: { id: true, nameSnapshot: true, quantity: true, total: true },
        },
        diningTable: { select: { id: true, name: true, sector: { select: { name: true } } } },
      },
    }),
  ]);

  const shift = openShift
    ? (() => {
        const summary = summarizeCashShift(openShift.openingAmount, openShift.movements, openShift.payments);
        const breakdown = new Map<string, { id: string; name: string; total: number; count: number }>();
        for (const payment of openShift.payments) {
          const current = breakdown.get(payment.paymentMethodId) ?? {
            id: payment.paymentMethod.id,
            name: payment.paymentMethod.name,
            total: 0,
            count: 0,
          };
          current.total += Number(payment.amount);
          current.count += 1;
          breakdown.set(payment.paymentMethodId, current);
        }
        return {
          id: openShift.id,
          cashRegisterId: openShift.cashRegisterId,
          registerName: openShift.cashRegister.name,
          status: openShift.status,
          openingAmount: openShift.openingAmount.toString(),
          openedAt: openShift.openedAt,
          version: openShift.version,
          openedBy: openShift.openedBy,
          salesTotal: summary.salesTotal.toString(),
          cashSales: summary.cashSales.toString(),
          virtualSales: summary.virtualSales.toString(),
          income: summary.income.toString(),
          expenses: summary.expenses.toString(),
          withdrawals: summary.withdrawals.toString(),
          expectedCash: summary.expectedCash.toString(),
          paymentBreakdown: Array.from(breakdown.values()),
          movements: openShift.movements.slice(0, 40).map((movement) => ({
            id: movement.id,
            type: movement.type,
            amount: movement.amount.toString(),
            reason: movement.reason,
            referenceId: movement.referenceId,
            createdAt: movement.createdAt,
            user: movement.user,
          })),
        };
      })()
    : null;

  return Response.json({
    branch,
    registers,
    paymentMethods: methods,
    openShift: shift,
    pendingOrders: pendingOrders.map((order) => ({
      ...order,
      subtotal: order.subtotal.toString(),
      discount: order.discount.toString(),
      total: order.total.toString(),
      items: order.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        quantity: Number(item.quantity),
        total: Number(item.total),
      })),
      table: order.diningTable
        ? { id: order.diningTable.id, name: order.diningTable.name, sectorName: order.diningTable.sector.name }
        : null,
      diningTable: undefined,
    })),
  });
}
