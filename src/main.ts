// The process: reads the settings and the mappings (a bad one stops the start, naming it), opens bridge.sqlite, checks the mappings
// against noticebox's forms (logged only: noticebox may be down at that moment), serves on PORT (http.ts) and retries failed or
// cut-off handovers every minute. SIGTERM (docker stop) stops taking requests and closes the database; a handover cut off by it stays
// pending and is picked up after the next start (retry.ts).
import { loadConfig } from "./config.ts";
import { whenIdle } from "./handover.ts";
import { startServer } from "./http.ts";
import { log } from "./log.ts";
import { checkMappings, loadMappings } from "./mapping.ts";
import { startRetries } from "./retry.ts";
import { openRuntime } from "./runtime.ts";

const config = loadConfig(process.env);
const mappings = loadMappings(config.mappingsPath);
const rt = openRuntime(config);
log.info({ forms: mappings.map((m) => m.form) }, "mappings read");
void checkMappings(rt, mappings).then((problems) => {
  for (const p of problems) log.warn(p);
});

process.on("uncaughtException", (e) => log.error({ error: e.name }, "uncaught exception"));
process.on("unhandledRejection", (e) => log.error({ error: e instanceof Error ? e.name : "error" }, "unhandled rejection"));

const stopRetries = startRetries(rt, mappings);
const server = startServer(rt, mappings, config.port);
server.on("listening", () => log.info({ port: config.port }, "invoiceninja-bridge started"));

process.on("SIGTERM", () => {
  stopRetries();
  server.close();
  // A few seconds for what runs to finish (Docker kills after 10); what doesn't is picked up after the next start.
  void Promise.race([whenIdle(rt), new Promise((r) => setTimeout(r, 8_000))]).then(() => {
    rt.store.close();
    process.exit(0);
  });
});
