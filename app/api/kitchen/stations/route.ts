import { can, requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  if (!can(auth.user, PERMISSIONS.PRODUCTS_VIEW) && !can(auth.user, PERMISSIONS.KITCHEN_VIEW)) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  const stations = await db.kitchenStation.findMany({
    where: { branch: { organizationId: auth.user.organizationId }, isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });
  return Response.json({ stations });
}
