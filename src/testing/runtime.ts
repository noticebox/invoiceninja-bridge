// A runtime for a test: a fresh bridge.sqlite in a directory of its own under the test's DATA_DIR, a fetch that fails unless the test
// replaces it (no test reaches noticebox, Invoice Ninja or ntfy), the real clock until a test sets one, and a silent log.
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { loadConfig } from "../config.ts";
import { openRuntime, type Runtime } from "../runtime.ts";

export type TestRuntime = Runtime;

export const TEST_ENV = {
  BRIDGE_NOTICEBOX_URL: "https://inbox.test",
  BRIDGE_NOTICEBOX_TOKEN: "nbx_test",
  BRIDGE_HOOK_SECRET: "s".repeat(32),
  BRIDGE_INVOICENINJA_URL: "https://invoices.test",
  BRIDGE_INVOICENINJA_TOKEN: "in_test",
};

export function testRuntime(env: Record<string, string> = {}): TestRuntime {
  const dataDir = mkdtempSync(join(process.env.DATA_DIR!, "rt-"));
  const all: Record<string, string> = { ...TEST_ENV, DATA_DIR: dataDir, ...env };
  for (const [k, v] of Object.entries(all)) if (v === "") delete all[k];
  const rt = openRuntime(loadConfig(all));
  return {
    ...rt,
    log: pino({ level: "silent" }),
    fetch: (async (url: string | URL | Request) => {
      throw new Error(`a test reached the network: ${String(url)}`);
    }) as typeof fetch,
  };
}
