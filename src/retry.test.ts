import { afterEach, describe, expect, it } from "vitest";
import { receive } from "./handover.ts";
import { retryDue } from "./retry.ts";
import { decided, FORM_NAME, ORDER_FORM, ORDER_MAPPING, orderRequest } from "./testing/orders.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";
import { fakeServices } from "./testing/services.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

const T0 = Date.parse("2026-11-20T10:00:00.000Z");
const MAPPINGS = [ORDER_MAPPING];

function setup() {
  const rt = testRuntime({ BRIDGE_NTFY_URL: "https://ntfy.test/topic" });
  opened.push(rt);
  let now = T0;
  rt.clock = () => new Date(now);
  const svc = fakeServices(rt, { forms: { [FORM_NAME]: ORDER_FORM }, submissions: [orderRequest()] });
  svc.failWhen((c) => (c.url.startsWith("https://invoices.test") ? new Response(null, { status: 503 }) : undefined));
  return { rt, svc, at: (minutes: number) => void (now = T0 + minutes * 60_000) };
}

describe("retries", () => {
  it("tries a failed handover again when it is due, not before", async () => {
    const { rt, svc, at } = setup();
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "failed", attempts: 1, next_try: "2026-11-20T10:01:00.000Z" });
    at(0.5);
    expect(await retryDue(rt, MAPPINGS)).toBe(0);
    svc.failWhen(() => undefined);
    at(1);
    expect(await retryDue(rt, MAPPINGS)).toBe(1);
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", attempts: 2 });
  });

  it("waits twice as long after each failure, at most 60 minutes", async () => {
    const { rt, at } = setup();
    await receive(rt, MAPPINGS, decided("s1"));
    const waits: number[] = [];
    let t = 0;
    for (let i = 0; i < 8; i++) {
      const next = Date.parse(rt.store.handover("s1")!.next_try!);
      waits.push((next - (T0 + t * 60_000)) / 60_000);
      t = (next - T0) / 60_000;
      at(t);
      await retryDue(rt, MAPPINGS);
    }
    expect(waits).toEqual([1, 2, 4, 8, 16, 32, 60, 60]);
  });

  it("pushes once when it first fails, not for the failures after", async () => {
    const { rt, svc, at } = setup();
    await receive(rt, MAPPINGS, decided("s1"));
    at(1);
    await retryDue(rt, MAPPINGS);
    at(3);
    await retryDue(rt, MAPPINGS);
    expect(svc.pushes.map((p) => p.title)).toEqual([`Handover failed: ${FORM_NAME}`]);
  });

  it("gives up after 24 hours, with one push", async () => {
    const { rt, svc, at } = setup();
    await receive(rt, MAPPINGS, decided("s1"));
    at(24 * 60 + 1);
    await retryDue(rt, MAPPINGS);
    expect(rt.store.handover("s1")).toMatchObject({ state: "given_up" });
    at(26 * 60);
    expect(await retryDue(rt, MAPPINGS)).toBe(0);
    expect(svc.pushes.map((p) => p.title)).toEqual([`Handover failed: ${FORM_NAME}`, `Handover given up: ${FORM_NAME}`]);
    expect(svc.pushes[1]!.message).toBe("client: invoiceninja answered 503. Tried for 24 hours; hand it over by hand from noticebox.");
  });
  it("picks up a handover left pending by a crash, once it has been still for 15 minutes", async () => {
    const { rt, svc, at } = setup();
    svc.failWhen(() => undefined);
    rt.store.insertHandover("s1", FORM_NAME, new Date(T0).toISOString());
    at(10);
    expect(await retryDue(rt, MAPPINGS)).toBe(0);
    at(16);
    expect(await retryDue(rt, MAPPINGS)).toBe(1);
    expect(rt.store.handover("s1")!.state).toBe("done");
  });
});
