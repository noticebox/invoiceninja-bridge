// POST /hooks/noticebox/<secret>: noticebox's webhook. Its posts are unsigned, so the secret in the path is what lets one in; a wrong
// one is answered like a path that doesn't exist, and compared in constant time over the digests (no length leaks either). The body
// carries ids and states only (noticebox's V1). The handover is recorded, the answer goes out (noticebox gives up after 5 s), and the
// handover runs after it; a failure in it is kept and retried by the bridge itself, since noticebox doesn't post again.
import { createHash, timingSafeEqual } from "node:crypto";
import { accept, run } from "./handover.ts";
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
  let taken;
  try {
    taken = accept(rt, mappings, body);
  } catch (e) {
    // Not recorded (the database refused): noticebox's operator should see a failed post, so this one is not 200.
    rt.log.error({ error: e instanceof Error ? e.name : "error" }, "hook: the handover could not be recorded");
    return Response.json({ error: "not recorded" }, { status: 500 });
  }
  // The answer goes out now (noticebox waits 5 s); the handover runs after it. A crash in it leaves the row pending, which the retries
  // pick up (retry.ts).
  if (taken.taken === "handover")
    void run(rt, mappings, taken.id).catch((e: unknown) => rt.log.error({ error: e instanceof Error ? e.name : "error" }, "hook: the handover threw"));
  return Response.json({ taken: taken.taken });
}
