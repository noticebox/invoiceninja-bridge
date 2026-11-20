import { Writable } from "node:stream";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { handle } from "./server.ts";
import { decided, FORM_NAME, ORDER_FORM, ORDER_MAPPING, orderRequest } from "./testing/orders.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";
import { fakeServices } from "./testing/services.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

const SECRET = "s".repeat(32);
const MAPPINGS = [ORDER_MAPPING];

function setup() {
  const rt = testRuntime();
  opened.push(rt);
  const lines: string[] = [];
  rt.log = pino({ level: "debug" }, new Writable({ write: (chunk, _e, done) => (lines.push(String(chunk)), done()) }));
  const svc = fakeServices(rt, { forms: { [FORM_NAME]: ORDER_FORM }, submissions: [orderRequest()] });
  return { rt, svc, lines };
}

const post = (secret: string, body: string) =>
  new Request(`http://bridge/hooks/noticebox/${secret}`, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("the noticebox hook", () => {
  it("answers 404 to a wrong secret and runs nothing", async () => {
    const { rt, svc } = setup();
    for (const secret of ["wrong", "s".repeat(31), "s".repeat(33), "", "%E0%A4%A"])
      expect((await handle(rt, MAPPINGS, post(secret, JSON.stringify(decided("s1"))))).status).toBe(404);
    expect(svc.calls).toEqual([]);
  });

  it("answers 200 to a handover decision once the handover ran", async () => {
    const { rt, svc } = setup();
    const r = await handle(rt, MAPPINGS, post(SECRET, JSON.stringify(decided("s1"))));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ taken: "handover" });
    expect(svc.quotes.size).toBe(1);
  });

  it("answers 200 ignored to an arrival", async () => {
    const { rt, svc } = setup();
    const r = await handle(rt, MAPPINGS, post(SECRET, JSON.stringify({ ...decided("s1"), event: "received" })));
    expect(await r.json()).toEqual({ taken: "ignored" });
    expect(svc.calls).toEqual([]);
  });

  it("answers 400 to a body that isn't JSON or is too large", async () => {
    const { rt } = setup();
    expect((await handle(rt, MAPPINGS, post(SECRET, "{nope"))).status).toBe(400);
    expect((await handle(rt, MAPPINGS, post(SECRET, JSON.stringify({ pad: "x".repeat(17_000) })))).status).toBe(400);
  });

  it("still answers 200 when Invoice Ninja is down, and keeps the failure", async () => {
    const { rt, svc } = setup();
    svc.failWhen((c) => (c.url.startsWith("https://invoices.test") ? new Response(null, { status: 503 }) : undefined));
    expect((await handle(rt, MAPPINGS, post(SECRET, JSON.stringify(decided("s1"))))).status).toBe(200);
    expect(rt.store.handover("s1")!.state).toBe("failed");
  });

  it("never writes the secret to the log", async () => {
    const { rt, lines } = setup();
    await handle(rt, MAPPINGS, post(SECRET, JSON.stringify(decided("s1"))));
    await handle(rt, MAPPINGS, post("wrong", "{}"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("")).not.toContain(SECRET);
  });
});
