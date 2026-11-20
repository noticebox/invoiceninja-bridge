// What every part works with: the settings, the store (src/db, the only way to the database), the clock, fetch and the log. The
// process opens one in main.ts; a test opens its own (testing/runtime.ts) with a fake fetch and clock.
import type { Logger } from "pino";
import type { Config } from "./config.ts";
import { openStore, type Store } from "./db/store.ts";
import { log } from "./log.ts";

export type Runtime = { config: Config; store: Store; clock: () => Date; fetch: typeof fetch; log: Logger };

export function openRuntime(config: Config): Runtime {
  return { config, store: openStore(config.dataDir), clock: () => new Date(), fetch: globalThis.fetch, log };
}
