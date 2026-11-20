// The HTTP side: GET /health and POST /hooks/noticebox/<secret>, nothing else. It takes a Web Request and answers a Web Response;
// main.ts adapts node:http to it, so tests call handle() directly.
import { noticeboxHook } from "./hook.ts";
import type { Mapping } from "./mapping.ts";
import type { Runtime } from "./runtime.ts";

const HOOK = /^\/hooks\/noticebox\/([^/]*)$/;

export async function handle(rt: Runtime, mappings: Mapping[], req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "GET" && pathname === "/health") {
    return rt.store.answers() ? Response.json({ status: "ok" }) : Response.json({ status: "unavailable" }, { status: 503 });
  }
  const hook = pathname.match(HOOK);
  if (req.method === "POST" && hook) {
    let secret: string;
    try {
      secret = decodeURIComponent(hook[1]!);
    } catch {
      return new Response(null, { status: 404 });
    }
    return noticeboxHook(rt, mappings, req, secret);
  }
  return new Response(null, { status: 404 });
}
