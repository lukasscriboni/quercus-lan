import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return user ? Response.json({ user }) : Response.json({ error: "No autenticado" }, { status: 401 });
}
