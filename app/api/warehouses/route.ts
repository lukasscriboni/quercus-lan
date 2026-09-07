import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.STOCK_VIEW);
  if ("error" in auth) return auth.error;
  const warehouses = await db.warehouse.findMany({
    where: { branch: { organizationId: auth.user.organizationId }, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true, branch: { select: { name: true } } },
  });
  return Response.json({ warehouses });
}
