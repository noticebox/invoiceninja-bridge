// POST /hooks/noticebox/<secret>: noticebox's webhook. Its posts are unsigned, so the secret in the path is what lets one in; a wrong
// one is answered like a path that doesn't exist, and compared in constant time over the digests (no length leaks either). The body
// carries ids and states only (noticebox's V1); the handover runs before the answer, and any failure in it is kept and answered 200,
// since noticebox doesn't post again: the retries are the bridge's own.
import { createHash, timingSafeEqual } from "node:crypto";
import { receive } from "./handover.ts";
import type { Mapping } from "./mapping.ts";
import type { Runtime } from "./runtime.ts";

const MAX_BODY = 16 * 1024;

const digest = (s: string) => createHash("sha256").update(s).digest();

export function secretMatches(rt: Runtime, given: string): boolean {
  return timingSafeEqual(digest(given), digest(rt.config.hookSecret));
}

export async function noticeboxHook(rt: Runtime, mappings: Mapping[], req: Request, secret: string): Promise<Response> {
  if (!secretMatches(rt, secret)) return new Response(null, { status: 404 });
  const text = await req.text();
  if (text.length > MAX_BODY) return Response.json({ error: "body too large" }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  try {
    return Response.json(await receive(rt, mappings, body));
  } catch (e) {
    rt.log.error({ error: e instanceof Error ? e.name : "error" }, "hook: the handover threw");
    return Response.json({ taken: "handover" });
  }
}
