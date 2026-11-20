// Failed handovers are tried again by the bridge itself: every minute (and once at start), each one whose next try is due, one at a
// time (handover.ts says how long it waits and when it gives up), and every pending one a crash or restart cut off. A tick that finds
// the previous one still running does nothing.
import { run } from "./handover.ts";
import type { Mapping } from "./mapping.ts";
import type { Runtime } from "./runtime.ts";

export const TICK_MS = 60_000;
/** A pending handover nobody has written to for this long was cut off (a crash, a restart) and is run again. */
const STALE_MS = 15 * 60_000;

/** Runs every failed handover that is due; how many it ran. */
export async function retryDue(rt: Runtime, mappings: Mapping[]): Promise<number> {
  const now = rt.clock();
  const due = rt.store.dueHandovers(now.toISOString(), new Date(now.getTime() - STALE_MS).toISOString());
  for (const id of due) await run(rt, mappings, id);
  return due.length;
}

/** Starts the minute timer; returns its stop. */
export function startRetries(rt: Runtime, mappings: Mapping[]): () => void {
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    retryDue(rt, mappings)
      .catch((e: unknown) => rt.log.error({ error: e instanceof Error ? e.name : "error" }, "retry: tick failed"))
      .finally(() => (busy = false));
  };
  tick();
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
