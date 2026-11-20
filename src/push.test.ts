import { describe, expect, it } from "vitest";
import { push } from "./push.ts";
import { fakeFetch } from "./testing/fetch.ts";
import { testRuntime } from "./testing/runtime.ts";

describe("push", () => {
  it("posts title, priority and click to the topic", async () => {
    const rt = testRuntime({ BRIDGE_NTFY_URL: "https://ntfy.test/topic" });
    const f = fakeFetch(() => new Response("ok"));
    rt.fetch = f.fetch;
    await push(rt, { title: "Handover failed: orders", message: "quote: invoiceninja answered 500", click: "https://inbox.test/x" });
    expect(f.calls).toEqual([
      {
        url: "https://ntfy.test/topic",
        method: "POST",
        headers: { title: "Handover failed: orders", priority: "4", click: "https://inbox.test/x" },
        body: "quote: invoiceninja answered 500",
      },
    ]);
    rt.store.close();
  });

  it("does nothing without BRIDGE_NTFY_URL", async () => {
    const rt = testRuntime();
    const f = fakeFetch(() => new Response("ok"));
    rt.fetch = f.fetch;
    await push(rt, { title: "x", message: "y" });
    expect(f.calls).toEqual([]);
    rt.store.close();
  });

  it("swallows a failed push", async () => {
    const rt = testRuntime({ BRIDGE_NTFY_URL: "https://ntfy.test/topic" });
    rt.fetch = fakeFetch(() => new Response("no", { status: 500 })).fetch;
    await expect(push(rt, { title: "x", message: "y" })).resolves.toBeUndefined();
    rt.fetch = fakeFetch(() => Promise.reject(new Error("down"))).fetch;
    await expect(push(rt, { title: "x", message: "y" })).resolves.toBeUndefined();
    rt.store.close();
  });
});
