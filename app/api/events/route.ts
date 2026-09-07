import { requireApiUser } from "@/lib/auth";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const encoder = new TextEncoder();
  let stop = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`));
      stop = subscribe((event) => {
        controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(event)}\n\n`));
      });
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)), 15_000);
      request.signal.addEventListener("abort", () => {
        stop();
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      stop();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
