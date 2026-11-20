// node:http in front of handle(): a request becomes a Web Request and handle()'s Response goes back as it is. The URL is built from the
// request's path alone, never from its Host header, so a client sending a broken Host or an absolute URL gets an answer and can't stop
// the server.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Mapping } from "./mapping.ts";
import type { Runtime } from "./runtime.ts";
import { handle } from "./server.ts";

function toRequest(req: IncomingMessage): Request {
  const { pathname, search } = new URL(req.url ?? "/", "http://bridge.invalid");
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k === "host") continue;
    try {
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    } catch {
      // A header value Headers can't hold is dropped; nothing the bridge reads depends on one.
    }
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream<Uint8Array>);
  return new Request(`http://bridge.invalid${pathname}${search}`, { method: req.method, headers, body, duplex: "half" } as RequestInit);
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
}

/** Starts serving handle() on `port` (0: any free one). */
export function startServer(rt: Runtime, mappings: Mapping[], port: number): Server {
  const server = createServer((req, res) => {
    let request: Request;
    try {
      request = toRequest(req);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    handle(rt, mappings, request)
      .then((r) => send(res, r))
      .catch((e: unknown) => {
        rt.log.error({ error: e instanceof Error ? e.name : "error" }, "request failed");
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
  server.listen(port);
  return server;
}
