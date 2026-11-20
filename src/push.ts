// A push to the person running the bridge, through ntfy (BRIDGE_NTFY_URL, a topic whose name is the secret): when a handover fails,
// when it is given up, and when files were left in noticebox. Its text names the form, the step and the quote's number, never a person
// or a field. Without a topic nothing is sent (logged once); a failed push is logged and never in the handover's way.
import type { Runtime } from "./runtime.ts";

const told = new WeakSet<object>();

export async function push(rt: Runtime, p: { title: string; message: string; click?: string; priority?: 1 | 2 | 3 | 4 | 5 }): Promise<void> {
  const url = rt.config.ntfyUrl;
  if (!url) {
    if (!told.has(rt.store)) {
      told.add(rt.store);
      rt.log.info("push: no BRIDGE_NTFY_URL, so failures are in the log only");
    }
    return;
  }
  const headers: Record<string, string> = { Title: p.title, Priority: String(p.priority ?? 4) };
  if (p.click) headers.Click = p.click;
  try {
    const r = await rt.fetch(url, { method: "POST", headers, body: p.message, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) rt.log.warn({ status: r.status }, "push: ntfy refused");
  } catch (e) {
    rt.log.warn({ error: e instanceof Error ? e.name : "error" }, "push: ntfy unreachable");
  }
}
