// A handover from start to end against noticebox, Invoice Ninja and ntfy in memory (testing/services.ts), with 3dbruckner.de's order
// form and mapping as the fixture.
import { Writable } from "node:stream";
import pino from "pino";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { receive, run } from "./handover.ts";
import { MAX_BYTES } from "./files.ts";
import { decided, FORM_NAME, ORDER_FORM, ORDER_MAPPING, orderRequest } from "./testing/orders.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";
import { fakeServices, type FakeClient, type FakeSubmission } from "./testing/services.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

const T0 = Date.parse("2026-11-20T10:00:00.000Z");

function setup(o: { submissions?: FakeSubmission[]; clients?: FakeClient[] } = {}) {
  const rt = testRuntime({ BRIDGE_NTFY_URL: "https://ntfy.test/topic" });
  opened.push(rt);
  let now = T0;
  rt.clock = () => new Date(now);
  const lines: string[] = [];
  rt.log = pino({ level: "debug" }, new Writable({ write: (chunk, _e, done) => (lines.push(String(chunk)), done()) }));
  const svc = fakeServices(rt, { forms: { [FORM_NAME]: ORDER_FORM }, submissions: o.submissions ?? [orderRequest()], clients: o.clients });
  return { rt, svc, lines, at: (minutes: number) => void (now = T0 + minutes * 60_000) };
}

const MAPPINGS = [ORDER_MAPPING];

describe("a handover", () => {
  it("makes an accepted submission a client, a draft quote and its documents", async () => {
    const { rt, svc } = setup();
    expect(await receive(rt, MAPPINGS, decided("s1"))).toEqual({ taken: "handover" });
    expect(svc.clients).toEqual([
      {
        id: "c1",
        name: "Anna Beispiel Muster",
        address1: "Hauptstr. 5",
        postal_code: "12345",
        city: "Berlin",
        country_id: "276",
        contacts: [{ first_name: "Anna", last_name: "Beispiel Muster", email: "anna@example.org", send_email: true }],
      },
    ]);
    const [quote] = [...svc.quotes.values()];
    expect(quote).toMatchObject({ client_id: "c1", custom: { custom_value1: "https://makerworld.com/models/1" }, line_items: [] });
    expect(quote!.private_notes).toBe(
      [
        "Request from noticebox: https://inbox.test/forms/3dbruckner-order/submissions/s1",
        "",
        "Ausgangslage: vorhanden",
        "Dateien: 2 attached",
        "Mehrfarbig: nein",
        "Material: PETG",
        "",
        "Beschreibung:",
        "Bitte in Rot.",
        "Zwei Stück.",
      ].join("\n"),
    );
    expect(svc.documents.map((d) => [d.name, d.type, d.isPublic])).toEqual([
      ["teil.stl.zip", "application/zip", "0"],
      ["foto.jpg", "image/jpeg", "0"],
    ]);
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", client_id: "c1", quote_id: quote!.id, quote_number: "Q-1", files_left: 0, error: null });
    expect(svc.pushes).toEqual([]);
    expect(svc.calls.every((c) => c.method === "GET" || !c.url.startsWith("https://inbox.test"))).toBe(true);
  });

  it("keeps a returning customer's client, email in another case, and notes the address given", async () => {
    const { rt, svc } = setup({ clients: [{ id: "c7", name: "Anna", contacts: [{ email: "Anna@Example.org" }] }] });
    await receive(rt, MAPPINGS, decided("s1"));
    expect(svc.clients).toHaveLength(1);
    const [quote] = [...svc.quotes.values()];
    expect(quote!.client_id).toBe("c7");
    expect(quote!.private_notes).toContain("Address given: Hauptstr. 5, 12345 Berlin, Deutschland");
  });

  it("makes one quote for the same decision twice, each file once", async () => {
    const { rt, svc } = setup();
    await receive(rt, MAPPINGS, decided("s1"));
    expect(await receive(rt, MAPPINGS, decided("s1"))).toEqual({ taken: "handover" });
    expect([svc.clients.length, svc.quotes.size, svc.documents.length]).toEqual([1, 1, 2]);
  });

  it("attaches only the rest when a failed upload is tried again", async () => {
    const { rt, svc, at } = setup();
    svc.failWhen((c) =>
      c.url.endsWith("/upload") &&
      (c.body as FormData).get("documents[]") instanceof File &&
      ((c.body as FormData).get("documents[]") as File).name === "foto.jpg"
        ? new Response(null, { status: 500 })
        : undefined,
    );
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "failed", error: "files: invoiceninja answered 500", attempts: 1 });
    expect(svc.pushes).toEqual([
      {
        title: `Handover failed: ${FORM_NAME}`,
        message: "files: invoiceninja answered 500. It is tried again by itself.",
        click: "https://inbox.test/forms/3dbruckner-order/submissions/s1",
      },
    ]);
    svc.failWhen(() => undefined);
    at(2);
    await run(rt, MAPPINGS, "s1");
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", attempts: 2, error: null });
    expect(svc.documents.map((d) => d.name)).toEqual(["teil.stl.zip", "foto.jpg"]);
    expect([svc.clients.length, svc.quotes.size, svc.pushes.length]).toEqual([1, 1, 1]);
  });

  it("leaves a file too large in noticebox, names it in the notes and pushes once", async () => {
    const big = crypto.getRandomValues(new Uint8Array(65536));
    const huge = new Uint8Array(MAX_BYTES + 1);
    for (let i = 0; i < huge.length; i += big.length) huge.set(big.subarray(0, Math.min(big.length, huge.length - i)), i);
    const req = orderRequest();
    req.files.push({ id: "f3", field: "dateien", name: "riesig.3mf", type: "model/3mf", bytes: huge });
    const { rt, svc } = setup({ submissions: [req] });
    await receive(rt, MAPPINGS, decided("s1"));
    expect(svc.documents.map((d) => d.name)).toEqual(["teil.stl.zip", "foto.jpg"]);
    const [quote] = [...svc.quotes.values()];
    expect(quote!.private_notes).toContain("Dateien: 2 attached");
    expect(quote!.private_notes).toContain("Not attached (too large or refused), in noticebox until it deletes them: riesig.3mf");
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", files_left: 1 });
    expect(svc.pushes).toEqual([
      {
        title: `Handed over with files left: ${FORM_NAME}`,
        message: "Quote Q-1: 1 file was too large or refused and stays in noticebox until it deletes it.",
        click: "https://inbox.test/forms/3dbruckner-order/submissions/s1",
      },
    ]);
  }, 20_000);

  it("leaves a file Invoice Ninja refuses, and goes on with the rest", async () => {
    const { rt, svc } = setup();
    svc.failWhen((c) =>
      c.url.endsWith("/upload") && ((c.body as FormData).get("documents[]") as File).name === "teil.stl.zip" ? new Response(null, { status: 422 }) : undefined,
    );
    await receive(rt, MAPPINGS, decided("s1"));
    expect(svc.documents.map((d) => d.name)).toEqual(["foto.jpg"]);
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", files_left: 1 });
  });

  it("ignores other decisions, forms without a mapping, arrivals and bodies it can't read", async () => {
    const { rt, svc } = setup();
    for (const body of [
      decided("s1", "answered"),
      decided("s1", "new", FORM_NAME, "angenommen"),
      decided("s1", "angenommen", "contact"),
      { ...decided("s1"), event: "received" },
      { event: "decided" },
      null,
      "x",
    ])
      expect(await receive(rt, MAPPINGS, body)).toEqual({ taken: "ignored" });
    expect(svc.calls).toEqual([]);
    expect(rt.store.handover("s1")).toBeUndefined();
  });

  it("still makes a quote of a sparse submission", async () => {
    const sparse = orderRequest({ fields: { name: "Anna", email: "anna@example.org" }, files: [] });
    const { rt, svc } = setup({ submissions: [sparse] });
    await receive(rt, MAPPINGS, decided("s1"));
    expect(svc.clients[0]).toEqual({
      id: "c1",
      name: "Anna",
      address1: "",
      postal_code: "",
      city: "",
      country_id: "276",
      contacts: [{ first_name: "Anna", last_name: "", email: "anna@example.org", send_email: true }],
    });
    const [quote] = [...svc.quotes.values()];
    expect(quote!.custom).toEqual({});
    expect(quote!.private_notes).toBe("Request from noticebox: https://inbox.test/forms/3dbruckner-order/submissions/s1");
    expect(rt.store.handover("s1")!.state).toBe("done");
  });

  it("fails naming the field when the mapping no longer fits the form", async () => {
    const { rt, svc } = setup();
    const fields = Object.fromEntries(Object.entries(ORDER_FORM.fields).filter(([name]) => name !== "city"));
    svc.forms.set(FORM_NAME, { ...ORDER_FORM, fields });
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "failed", error: "read: the mapping names city (client.city), which the form no longer has" });
    expect(svc.quotes.size).toBe(0);
  });

  it("fails saying so when the submission is gone from noticebox", async () => {
    const { rt } = setup({ submissions: [] });
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "failed", error: "read: the submission is gone from noticebox" });
  });

  it("stores and logs nothing personal", async () => {
    const { rt, svc, lines } = setup();
    svc.failWhen((c) => (c.url.endsWith("/quotes") ? new Response("anna@example.org", { status: 500 }) : undefined));
    await receive(rt, MAPPINGS, decided("s1"));
    const row = JSON.stringify(rt.store.handover("s1"));
    const log = lines.join("");
    expect(log.length).toBeGreaterThan(0);
    for (const secret of ["anna@example.org", "Anna", "Hauptstr", "Berlin", "teil.stl", "foto.jpg", "nbx_test", "in_test", "s".repeat(32)]) {
      expect(row, secret).not.toContain(secret);
      expect(log, secret).not.toContain(secret);
    }
  });
});

describe("review fixes", () => {
  it("leaves a file Invoice Ninja's size limit refuses (413) and goes on", async () => {
    const { rt, svc } = setup();
    svc.failWhen((c) =>
      c.url.endsWith("/upload") && ((c.body as FormData).get("documents[]") as File).name === "teil.stl.zip" ? new Response(null, { status: 413 }) : undefined,
    );
    await receive(rt, MAPPINGS, decided("s1"));
    expect(svc.documents.map((d) => d.name)).toEqual(["foto.jpg"]);
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", files_left: 1 });
  });

  it("leaves a file that is gone from noticebox instead of retrying it for a day", async () => {
    const req = orderRequest();
    const { rt, svc } = setup({ submissions: [req] });
    svc.failWhen((c) => (c.url.endsWith("/files/f1") ? new Response(null, { status: 404 }) : undefined));
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", files_left: 1 });
  });

  it("makes no second quote when the first one's answer was lost", async () => {
    const { rt, svc, at } = setup();
    svc.loseAnswerWhen((c) => c.method === "POST" && c.url.endsWith("/api/v1/quotes"));
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")).toMatchObject({ state: "failed", error: "quote: invoiceninja timed out" });
    svc.loseAnswerWhen(() => false);
    at(1);
    await run(rt, MAPPINGS, "s1");
    expect(svc.quotes.size).toBe(1);
    expect(rt.store.handover("s1")).toMatchObject({ state: "done", quote_number: "Q-1" });
    expect(svc.documents).toHaveLength(2);
  });

  it("attaches no file twice when an upload's answer was lost", async () => {
    const { rt, svc, at } = setup();
    svc.loseAnswerWhen((c) => c.url.endsWith("/upload") && ((c.body as FormData).get("documents[]") as File).name === "foto.jpg");
    await receive(rt, MAPPINGS, decided("s1"));
    expect(rt.store.handover("s1")!.state).toBe("failed");
    svc.loseAnswerWhen(() => false);
    at(1);
    await run(rt, MAPPINGS, "s1");
    expect(svc.documents.map((d) => d.name)).toEqual(["teil.stl.zip", "foto.jpg"]);
    expect(rt.store.handover("s1")!.state).toBe("done");
  });

  it("keeps the address given for a returning customer when the quote is made on a retry", async () => {
    const { rt, svc, at } = setup({ clients: [{ id: "c7", name: "Anna", contacts: [{ email: "anna@example.org" }] }] });
    svc.failWhen((c) => (c.method === "POST" && c.url.endsWith("/api/v1/quotes") ? new Response(null, { status: 500 }) : undefined));
    await receive(rt, MAPPINGS, decided("s1"));
    svc.failWhen(() => undefined);
    at(1);
    await run(rt, MAPPINGS, "s1");
    expect([...svc.quotes.values()][0]!.private_notes).toContain("Address given: Hauptstr. 5, 12345 Berlin, Deutschland");
  });

  it("hands nothing over when the submission isn't in the mapped state in noticebox", async () => {
    const { rt, svc } = setup({ submissions: [orderRequest({ state: "new" })] });
    await receive(rt, MAPPINGS, decided("s1"));
    expect([svc.clients.length, svc.quotes.size]).toEqual([0, 0]);
    expect(rt.store.handover("s1")).toMatchObject({ state: "given_up", error: 'read: the submission is in "new" in noticebox, not "angenommen"' });
    expect(svc.pushes.map((p) => p.title)).toEqual([`Handover given up: ${FORM_NAME}`]);
  });
});

describe("the zipped model", () => {
  it("holds the file as it came", async () => {
    const { rt, svc } = setup();
    let zipped: Uint8Array | undefined;
    const original = rt.fetch;
    rt.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const file = init?.body instanceof FormData ? (init.body.get("documents[]") as File | null) : null;
      if (file?.name === "teil.stl.zip") zipped = new Uint8Array(await file.arrayBuffer());
      return original(url, init);
    }) as typeof fetch;
    await receive(rt, MAPPINGS, decided("s1"));
    expect(new TextDecoder().decode(unzipSync(zipped!)["teil.stl"])).toBe("solid teil\nendsolid teil\n");
    expect(svc.documents).toHaveLength(2);
  });
});
