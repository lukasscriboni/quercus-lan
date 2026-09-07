import { OrderItemStatus, PaymentStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { ReceiptView } from "@/components/cash/receipt-view";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes(PERMISSIONS.CASH_VIEW)) redirect("/");

  const { id } = await params;
  const query = await searchParams;
  const order = await db.order.findFirst({
    where: { id, branch: { organizationId: user.organizationId } },
    include: {
      branch: { select: { name: true, address: true } },
      diningTable: { select: { name: true, sector: { select: { name: true } } } },
      openedBy: { select: { displayName: true } },
      items: {
        where: { status: { not: OrderItemStatus.CANCELLED } },
        orderBy: { createdAt: "asc" },
        select: { id: true, nameSnapshot: true, quantity: true, unitPrice: true, total: true },
      },
      payments: {
        where: { status: PaymentStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { paymentMethod: { select: { name: true } } },
      },
    },
  });
  if (!order) notFound();

  const payment = order.payments[0] ?? null;
  return <ReceiptView autoPrint={query.print === "1"} receipt={{
    id: order.id,
    number: order.number,
    type: order.type,
    branchName: order.branch.name,
    branchAddress: order.branch.address,
    tableName: order.diningTable?.name ?? null,
    sectorName: order.diningTable?.sector.name ?? null,
    cashierName: order.openedBy.displayName,
    paidAt: (payment?.createdAt ?? order.closedAt ?? order.openedAt).toISOString(),
    paymentMethod: payment?.paymentMethod.name ?? "Sin especificar",
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    total: Number(order.total),
  }} />;
}
