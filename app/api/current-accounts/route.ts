import { CurrentAccountHolderType, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES, orderDetailsInclude, serializeOrder } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  holderType: z.nativeEnum(CurrentAccountHolderType),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_VIEW);
  if ("error" in auth) return auth.error;
  const accounts = await db.currentAccount.findMany({
    where: { branch: { organizationId: auth.user.organizationId }, isActive: true },
    orderBy: { name: "asc" },
    include: {
      orders: {
        where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
        orderBy: { openedAt: "desc" },
        take: 1,
        include: orderDetailsInclude,
      },
    },
  });
  return Response.json({
    accounts: accounts.map((account) => ({
      id: account.id,
      holderType: account.holderType,
      name: account.name,
      phone: account.phone,
      notes: account.notes,
      createdAt: account.createdAt,
      order: account.orders[0] ? serializeOrder(account.orders[0]) : null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.ORDERS_WRITE);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Completá el nombre y el tipo de cuenta" }, { status: 400 });
  const branch = await db.branch.findFirst({ where: { organizationId: auth.user.organizationId }, orderBy: { createdAt: "asc" } });
  if (!branch) return Response.json({ error: "No hay una sucursal configurada" }, { status: 404 });
  const duplicate = await db.currentAccount.findFirst({
    where: { branchId: branch.id, name: { equals: parsed.data.name, mode: "insensitive" }, isActive: true },
    select: { id: true },
  });
  if (duplicate) return Response.json({ error: "Ya existe una cuenta corriente con ese nombre" }, { status: 409 });
  const account = await db.currentAccount.create({
    data: { branchId: branch.id, holderType: parsed.data.holderType, name: parsed.data.name, phone: parsed.data.phone || null, notes: parsed.data.notes || null },
  });
  await db.auditLog.create({
    data: { organizationId: auth.user.organizationId, userId: auth.user.id, action: "CURRENT_ACCOUNT_CREATED", entityType: "CurrentAccount", entityId: account.id, after: { name: account.name, holderType: account.holderType } },
  });
  return Response.json({ account: { ...account, order: null } }, { status: 201 });
}
