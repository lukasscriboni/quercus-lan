import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalize";
import { PERMISSIONS } from "@/lib/permissions";
import { publishEvent } from "@/lib/realtime";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().transform((value) => value || null);

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  taxId: optionalText(30),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z.union([z.string().trim().email().max(160), z.literal("")]).optional().transform((value) => value || null),
});

export async function GET() {
  const auth = await requireApiUser(PERMISSIONS.PRODUCTS_VIEW);
  if ("error" in auth) return auth.error;
  const suppliers = await db.supplier.findMany({
    where: { organizationId: auth.user.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ suppliers });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(PERMISSIONS.STOCK_ADJUST);
  if ("error" in auth) return auth.error;

  const parsed = supplierSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Revisá los datos del proveedor. Solo el nombre es obligatorio." }, { status: 400 });
  }

  const data = parsed.data;
  const normalizedName = normalizeText(data.name);
  const existing = await db.supplier.findUnique({
    where: {
      organizationId_normalizedName: {
        organizationId: auth.user.organizationId,
        normalizedName,
      },
    },
    select: { id: true },
  });
  if (existing) return Response.json({ error: "Ya existe un proveedor con ese nombre." }, { status: 409 });

  try {
    const supplier = await db.supplier.create({
      data: {
        organizationId: auth.user.organizationId,
        name: data.name,
        normalizedName,
        taxId: data.taxId,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
      },
      select: { id: true, name: true, taxId: true, contactName: true, phone: true, email: true },
    });

    publishEvent("suppliers.changed", { supplierId: supplier.id });
    return Response.json({ supplier }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "Ya existe un proveedor con ese nombre." }, { status: 409 });
    }
    throw error;
  }
}
