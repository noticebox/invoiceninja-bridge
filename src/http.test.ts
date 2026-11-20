import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "./http.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

/** A raw HTTP request, as a client that sends whatever it likes would; the status line of the answer. */
function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, "127.0.0.1", () => s.write(text));
    let got = "";
    s.on("data", (d) => (got += String(d)));
    s.on("end", () => resolve(got.split("\r\n")[0] ?? ""));
    s.on("error", reject);
  });
}

describe("the node:http side", () => {
  it("answers a request with a bad Host header or an absolute URL, and keeps serving", async () => {
    const rt = testRuntime();
    opened.push(rt);
    const server = startServer(rt, [], 0);
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    try {
      expect(await raw(port, "GET /health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n")).toMatch(/^HTTP\/1\.1 200/);
      expect(await raw(port, "GET http://x/health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")).toMatch(/^HTTP\/1\.1 200/);
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
