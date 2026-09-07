import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_VIEW);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return Response.json({ error: "Falta el producto" }, { status: 400 });
  const movements = await db.stockMovement.findMany({
    where: { productId, product: { organizationId: auth.user.organizationId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, type: true, quantity: true, previousQty: true, newQty: true, reason: true, referenceType: true, referenceId: true, createdAt: true,
      warehouse: { select: { name: true } },
      user: { select: { displayName: true } },
    },
  });
  return Response.json({ movements });
}
