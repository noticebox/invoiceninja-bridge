// The process: reads the settings and the mappings (a bad one stops the start, naming it), opens bridge.sqlite, checks the mappings
// against noticebox's forms (logged only: noticebox may be down at that moment), serves handle() on PORT and retries failed handovers
// every minute. node:http
// requests become Web Requests for handle() and its Responses go back as they are. SIGTERM (docker stop) closes the server and the
// database before the process ends.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { checkMappings, loadMappings } from "./mapping.ts";
import { startRetries } from "./retry.ts";
import { openRuntime } from "./runtime.ts";
import { handle } from "./server.ts";

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream<Uint8Array>);
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, { method: req.method, headers, body, duplex: "half" } as RequestInit);
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
}

const config = loadConfig(process.env);
const mappings = loadMappings(config.mappingsPath);
const rt = openRuntime(config);
log.info({ forms: mappings.map((m) => m.form) }, "mappings read");
void checkMappings(rt, mappings).then((problems) => {
  for (const p of problems) log.warn(p);
});
const server = createServer((req, res) => {
  handle(rt, toRequest(req))
    .then((r) => send(res, r))
    .catch((e: unknown) => {
      log.error({ error: e instanceof Error ? e.message : String(e) }, "request failed");
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});
const stopRetries = startRetries(rt, mappings);
server.listen(config.port, () => log.info({ port: config.port }, "invoiceninja-bridge started"));

process.on("SIGTERM", () => {
  stopRetries();
  server.close(() => {
    rt.store.close();
    process.exit(0);
  });
});
