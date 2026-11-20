// The two clients against a fake fetch: what they send (paths, headers, bodies) and how they read the answers, in the shapes noticebox
// 0.22 and Invoice Ninja 5.13 answer with (checked on running instances, 2026-11-20).
import { afterEach, describe, expect, it } from "vitest";
import { attachToQuote, countryId, createClient, createQuoteDraft, findClientByEmail, updateQuoteNotes } from "./invoiceninja.ts";
import { getFile, getForm, getSubmission } from "./noticebox.ts";
import { ServiceError } from "./serviceerror.ts";
import { fakeFetch } from "./testing/fetch.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

function rtWith(answer: Parameters<typeof fakeFetch>[0]) {
  const rt = testRuntime();
  opened.push(rt);
  const f = fakeFetch(answer);
  rt.fetch = f.fetch;
  return { rt, calls: f.calls };
}

const SUBMISSION = {
  id: "s1",
  form: "orders",
  kind: "message",
  state: "angenommen",
  url: "https://inbox.test/forms/orders/submissions/s1",
  fields: { name: "Anna Beispiel", email: "anna@example.org" },
  files: [{ id: "f1", field: "files", name: "part.stl", type: "model/stl", size: 3, picture: false, url: "x", api_url: "y" }],
};

describe("noticebox", () => {
  it("getSubmission sends the bearer token and reads the submission", async () => {
    const { rt, calls } = rtWith(() => Response.json(SUBMISSION));
    expect(await getSubmission(rt, "s1")).toEqual({
      id: "s1",
      form: "orders",
      state: "angenommen",
      url: SUBMISSION.url,
      fields: SUBMISSION.fields,
      files: [{ id: "f1", field: "files", name: "part.stl", type: "model/stl", size: 3 }],
    });
    expect(calls[0]).toMatchObject({ url: "https://inbox.test/api/v1/submissions/s1", method: "GET", headers: { authorization: "Bearer nbx_test" } });
  });

  it("getSubmission is null on 404", async () => {
    const { rt } = rtWith(() => new Response(null, { status: 404 }));
    expect(await getSubmission(rt, "gone")).toBeNull();
  });

  it("getForm reads the fields' labels in the form's order, and its states", async () => {
    const { rt, calls } = rtWith(() =>
      Response.json({
        name: "orders",
        form: {
          fields: { name: { type: "text", label: "Name" }, email: { type: "email" }, files: { type: "file", label: "Dateien" } },
          states: [{ name: "new" }, { name: "angenommen", closed: true }],
        },
      }),
    );
    expect(await getForm(rt, "orders")).toEqual({
      name: "orders",
      states: ["new", "angenommen"],
      fields: [
        { name: "name", type: "text", label: "Name" },
        { name: "email", type: "email", label: "email" },
        { name: "files", type: "file", label: "Dateien" },
      ],
    });
    expect(calls[0]!.url).toBe("https://inbox.test/api/v1/forms/orders");
  });

  it("getFile returns the bytes", async () => {
    const { rt, calls } = rtWith(() => new Response(new Uint8Array([1, 2, 3])));
    expect(await getFile(rt, "s1", "f1")).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0]!.url).toBe("https://inbox.test/api/v1/submissions/s1/files/f1");
  });
});

const IN_HEADERS = { "x-api-token": "in_test", "x-requested-with": "XMLHttpRequest" };

describe("Invoice Ninja", () => {
  it("findClientByEmail matches a contact's email ignoring case, among active clients", async () => {
    const { rt, calls } = rtWith(() =>
      Response.json({
        data: [
          { id: "c9", contacts: [{ email: "other@example.org" }] },
          { id: "c1", contacts: [{ email: "Anna@Example.org" }] },
        ],
      }),
    );
    expect(await findClientByEmail(rt, "anna@example.org")).toBe("c1");
    expect(calls[0]!.url).toBe("https://invoices.test/api/v1/clients?email=anna%40example.org&status=active");
    expect(calls[0]!.headers).toMatchObject(IN_HEADERS);
  });

  it("findClientByEmail ignores a client the filter returned for another address", async () => {
    const { rt } = rtWith(() => Response.json({ data: [{ id: "c9", contacts: [{ email: "other@example.org" }] }] }));
    expect(await findClientByEmail(rt, "anna@example.org")).toBeNull();
  });

  it("createClient sends the headers, the address and the contact", async () => {
    const { rt, calls } = rtWith(() => Response.json({ data: { id: "c2" } }));
    const id = await createClient(rt, {
      name: "Anna Beispiel",
      firstName: "Anna",
      lastName: "Beispiel",
      email: "anna@example.org",
      address1: "Hauptstr. 5",
      postalCode: "12345",
      city: "Berlin",
      countryId: "276",
    });
    expect(id).toBe("c2");
    expect(calls[0]).toMatchObject({
      url: "https://invoices.test/api/v1/clients",
      method: "POST",
      headers: { ...IN_HEADERS, "content-type": "application/json" },
    });
    expect(JSON.parse(calls[0]!.body as string)).toEqual({
      name: "Anna Beispiel",
      address1: "Hauptstr. 5",
      postal_code: "12345",
      city: "Berlin",
      country_id: "276",
      contacts: [{ first_name: "Anna", last_name: "Beispiel", email: "anna@example.org", send_email: true }],
    });
  });

  it("countryId maps an ISO code to Invoice Ninja's id, asking once", async () => {
    const { rt, calls } = rtWith(() =>
      Response.json({
        countries: [
          { id: "276", iso_3166_2: "DE" },
          { id: "40", iso_3166_2: "AT" },
        ],
      }),
    );
    expect(await countryId(rt, "DE")).toBe("276");
    expect(await countryId(rt, "at")).toBe("40");
    expect(await countryId(rt, "XX")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://invoices.test/api/v1/statics");
  });

  it("createQuoteDraft makes a draft and never sends it", async () => {
    const { rt, calls } = rtWith(() => Response.json({ data: { id: "q1", number: "3D-2026-0010" } }));
    expect(await createQuoteDraft(rt, { clientId: "c1", privateNotes: "notes", customValues: { custom_value1: "https://model" } })).toEqual({
      id: "q1",
      number: "3D-2026-0010",
    });
    expect(calls[0]!.url).toBe("https://invoices.test/api/v1/quotes");
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ client_id: "c1", private_notes: "notes", custom_value1: "https://model", line_items: [] });
  });

  it("updateQuoteNotes changes only the private notes", async () => {
    const { rt, calls } = rtWith(() => Response.json({ data: { id: "q1" } }));
    await updateQuoteNotes(rt, "q1", "more");
    expect(calls[0]).toMatchObject({ url: "https://invoices.test/api/v1/quotes/q1", method: "PUT" });
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ private_notes: "more" });
  });

  it("attachToQuote sends one private document", async () => {
    const { rt, calls } = rtWith(() => Response.json({ data: { id: "q1" } }));
    await attachToQuote(rt, "q1", { name: "part.stl.zip", type: "application/zip", bytes: new Uint8Array([1]) });
    const c = calls[0]!;
    expect(c).toMatchObject({ url: "https://invoices.test/api/v1/quotes/q1/upload", method: "POST", headers: IN_HEADERS });
    const form = c.body as FormData;
    expect(form.get("_method")).toBe("PUT");
    expect(form.get("is_public")).toBe("0");
    const file = form.get("documents[]") as File;
    expect([file.name, file.type, file.size]).toEqual(["part.stl.zip", "application/zip", 1]);
  });

  it("a 5xx or a timeout is a ServiceError naming the service and the status, never the body", async () => {
    const { rt } = rtWith(() => new Response("secret detail anna@example.org", { status: 502 }));
    const e = await createClient(rt, {
      name: "A",
      firstName: "A",
      lastName: "",
      email: "a@b.c",
      address1: "",
      postalCode: "",
      city: "",
      countryId: null,
    }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ServiceError);
    expect(e).toMatchObject({ service: "invoiceninja", status: 502 });
    expect((e as Error).message).toBe("invoiceninja answered 502");
    const down = rtWith(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
    expect(await getSubmission(down.rt, "s1").catch((x: unknown) => x)).toMatchObject({ service: "noticebox", status: null, message: "noticebox timed out" });
  });
});
