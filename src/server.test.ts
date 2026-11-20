import { afterEach, describe, expect, it } from "vitest";
import { handle } from "./server.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

describe("the server", () => {
  it("health is 200 with the database, 503 without", async () => {
    const rt = testRuntime();
    const ok = await handle(rt, [], new Request("http://bridge/health"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: "ok" });
    rt.store.close();
    expect((await handle(rt, [], new Request("http://bridge/health"))).status).toBe(503);
  });

  it("anything else is 404", async () => {
    const rt = testRuntime();
    opened.push(rt);
    expect((await handle(rt, [], new Request("http://bridge/"))).status).toBe(404);
    expect((await handle(rt, [], new Request("http://bridge/health", { method: "POST" }))).status).toBe(404);
  });
});
