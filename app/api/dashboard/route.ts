import { OrderStatus } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.DASHBOARD_VIEW);
  if ("error" in auth) return auth.error;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [orders, tablesOccupied, products, stockRows] = await Promise.all([
    db.order.aggregate({
      where: { branch: { organizationId: auth.user.organizationId }, status: OrderStatus.PAID, closedAt: { gte: today } },
      _sum: { total: true }, _count: true, _avg: { total: true },
    }),
    db.diningTable.count({ where: { sector: { branch: { organizationId: auth.user.organizationId } }, status: "OCCUPIED" } }),
    db.product.count({ where: { organizationId: auth.user.organizationId, isActive: true } }),
    db.stock.findMany({
      where: { product: { organizationId: auth.user.organizationId, isActive: true, stockMode: { not: "NONE" } } },
      select: { quantity: true, minimum: true },
    }),
  ]);
  return Response.json({
    salesToday: orders._sum.total?.toString() ?? "0",
    ordersToday: orders._count,
    averageTicket: orders._avg.total?.toString() ?? "0",
    tablesOccupied,
    activeProducts: products,
    criticalStock: stockRows.filter((row) => row.quantity.lte(row.minimum)).length,
  });
}
