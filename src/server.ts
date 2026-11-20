// The HTTP side: GET /health and, from the hook on, POST /hooks/noticebox/<secret>. It takes a Web Request and answers a Web Response;
// main.ts adapts node:http to it, so tests call handle() directly.
import type { Runtime } from "./runtime.ts";

export async function handle(rt: Runtime, req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "GET" && pathname === "/health") {
    return rt.store.answers() ? Response.json({ status: "ok" }) : Response.json({ status: "unavailable" }, { status: 503 });
  }
  return new Response(null, { status: 404 });
}
