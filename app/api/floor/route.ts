import { OrderStatus, ReservationStatus } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const activeOrderStatuses = [
  OrderStatus.OPEN,
  OrderStatus.IN_PROGRESS,
  OrderStatus.READY,
  OrderStatus.BILL_REQUESTED,
];

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.FLOOR_VIEW);
  if ("error" in auth) return auth.error;

  const branch = await db.branch.findFirst({
    where: { organizationId: auth.user.organizationId },
    orderBy: { createdAt: "asc" },
    include: {
      sectors: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          tables: {
            orderBy: { name: "asc" },
            include: {
              orders: {
                where: { status: { in: activeOrderStatuses } },
                orderBy: { openedAt: "desc" },
                take: 1,
                select: { id: true, number: true, status: true, guestCount: true, total: true, openedAt: true },
              },
              reservations: {
                where: {
                  status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
                  reservedFor: { gte: new Date() },
                },
                orderBy: { reservedFor: "asc" },
                take: 1,
                select: { id: true, partySize: true, reservedFor: true, status: true },
              },
            },
          },
          elements: { orderBy: [{ type: "asc" }, { id: "asc" }] },
        },
      },
    },
  });

  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });

  return Response.json({
    branch: { id: branch.id, name: branch.name },
    sectors: branch.sectors.map((sector) => ({
      id: sector.id,
      name: sector.name,
      sortOrder: sector.sortOrder,
      tables: sector.tables.map((table) => ({
        id: table.id,
        sectorId: table.sectorId,
        name: table.name,
        capacity: table.capacity,
        status: table.status,
        x: Number(table.x),
        y: Number(table.y),
        width: Number(table.width),
        height: Number(table.height),
        rotation: Number(table.rotation),
        shape: table.shape,
        version: table.version,
        activeOrder: table.orders[0]
          ? { ...table.orders[0], total: Number(table.orders[0].total) }
          : null,
        nextReservation: table.reservations[0] ?? null,
      })),
      elements: sector.elements.map((element) => ({
        id: element.id,
        sectorId: element.sectorId,
        type: element.type,
        label: element.label,
        x: Number(element.x),
        y: Number(element.y),
        width: Number(element.width),
        height: Number(element.height),
        rotation: Number(element.rotation),
        style: element.style,
        version: element.version,
      })),
    })),
  });
}
