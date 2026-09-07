import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, createSession } from "@/lib/auth";

const schema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ingresá usuario y contraseña" }, { status: 400 });
  const user = await authenticate(parsed.data.username, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
