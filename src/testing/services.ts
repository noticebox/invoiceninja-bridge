// noticebox, Invoice Ninja and ntfy in memory, behind a fake fetch, answering in the shapes the real ones do (noticebox 0.22, Invoice
// Ninja 5.13): what a handover test needs to see what the bridge read, made and attached. `fail` lets a test refuse a call.
import type { Runtime } from "../runtime.ts";
import { fakeFetch, type Call } from "./fetch.ts";

export type FakeFile = { id: string; field: string; name: string; type: string; bytes: Uint8Array };
export type FakeSubmission = { id: string; form: string; state: string; fields: Record<string, string>; files: FakeFile[] };
export type FakeForm = { fields: Record<string, { type: string; label?: string }>; states: string[] };
export type FakeClient = {
  id: string;
  name: string;
  address1?: string;
  postal_code?: string;
  city?: string;
  country_id?: string;
  contacts: { email: string; first_name?: string; last_name?: string }[];
};
export type FakeQuote = { id: string; number: string; client_id: string; private_notes: string; custom: Record<string, string>; line_items: unknown[] };
export type FakeDocument = { quoteId: string; name: string; type: string; size: number; isPublic: string };

export function fakeServices(rt: Runtime, base: { forms?: Record<string, FakeForm>; submissions?: FakeSubmission[]; clients?: FakeClient[] } = {}) {
  const forms = new Map(Object.entries(base.forms ?? {}));
  const submissions = new Map((base.submissions ?? []).map((s) => [s.id, s]));
  const clients: FakeClient[] = [...(base.clients ?? [])];
  const quotes = new Map<string, FakeQuote>();
  const documents: FakeDocument[] = [];
  const pushes: { title: string; message: string; click?: string }[] = [];
  let fail: (c: Call) => Response | undefined = () => undefined;
  let n = 0;

  const nb = rt.config.noticebox.url;
  const inUrl = rt.config.invoiceNinja.url;
  const f = fakeFetch(async (c) => {
    const refused = fail(c);
    if (refused) return refused;
    const url = new URL(c.url);
    if (c.url.startsWith(rt.config.ntfyUrl ?? "\0")) {
      pushes.push({ title: c.headers.title!, message: String(c.body), ...(c.headers.click ? { click: c.headers.click } : {}) });
      return new Response("ok");
    }
    if (c.url.startsWith(`${nb}/api/v1/`)) {
      if (c.headers.authorization !== `Bearer ${rt.config.noticebox.token}`) return new Response(null, { status: 401 });
      const path = url.pathname.slice("/api/v1".length);
      let m = path.match(/^\/submissions\/([^/]+)\/files\/([^/]+)$/);
      if (m) {
        const file = submissions.get(m[1]!)?.files.find((x) => x.id === m![2]);
        return file ? new Response(file.bytes.slice()) : new Response(null, { status: 404 });
      }
      m = path.match(/^\/submissions\/([^/]+)$/);
      if (m) {
        const s = submissions.get(m[1]!);
        if (!s) return new Response(null, { status: 404 });
        return Response.json({
          id: s.id,
          form: s.form,
          kind: "message",
          state: s.state,
          url: `${nb}/forms/${s.form}/submissions/${s.id}`,
          fields: s.fields,
          files: s.files.map((x) => ({
            id: x.id,
            field: x.field,
            name: x.name,
            type: x.type,
            size: x.bytes.length,
            picture: x.type.startsWith("image/"),
            url: "u",
            api_url: "a",
          })),
        });
      }
      m = path.match(/^\/forms\/([^/]+)$/);
      if (m) {
        const form = forms.get(m[1]!);
        return form
          ? Response.json({ name: m[1], form: { fields: form.fields, states: form.states.map((s) => ({ name: s })) } })
          : new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    }
    if (c.url.startsWith(`${inUrl}/api/v1/`)) {
      if (c.headers["x-api-token"] !== rt.config.invoiceNinja.token) return new Response(null, { status: 401 });
      const path = url.pathname.slice("/api/v1".length);
      if (path === "/statics")
        return Response.json({
          countries: [
            { id: "276", iso_3166_2: "DE" },
            { id: "40", iso_3166_2: "AT" },
            { id: "756", iso_3166_2: "CH" },
          ],
        });
      if (path === "/clients" && c.method === "GET") {
        const email = (url.searchParams.get("email") ?? "").toLowerCase();
        return Response.json({ data: clients.filter((k) => k.contacts.some((x) => x.email.toLowerCase() === email)) });
      }
      if (path === "/clients" && c.method === "POST") {
        const body = JSON.parse(String(c.body)) as Omit<FakeClient, "id">;
        const client = { ...body, id: `c${++n}` };
        clients.push(client);
        return Response.json({ data: { id: client.id } });
      }
      if (path === "/quotes" && c.method === "POST") {
        const { client_id, private_notes, line_items, ...custom } = JSON.parse(String(c.body)) as Record<string, unknown>;
        const id = `q${++n}`;
        const quote = {
          id,
          number: `Q-${quotes.size + 1}`,
          client_id: String(client_id),
          private_notes: String(private_notes),
          custom: custom as Record<string, string>,
          line_items: line_items as unknown[],
        };
        quotes.set(id, quote);
        return Response.json({ data: { id, number: quote.number } });
      }
      let m = path.match(/^\/quotes\/([^/]+)\/upload$/);
      if (m && c.method === "POST") {
        const form = c.body as FormData;
        const file = form.get("documents[]") as File;
        documents.push({ quoteId: m[1]!, name: file.name, type: file.type, size: file.size, isPublic: String(form.get("is_public")) });
        return Response.json({ data: { id: m[1] } });
      }
      m = path.match(/^\/quotes\/([^/]+)$/);
      if (m && c.method === "PUT") {
        const q = quotes.get(m[1]!);
        if (!q) return new Response(null, { status: 404 });
        q.private_notes = String((JSON.parse(String(c.body)) as { private_notes: string }).private_notes);
        return Response.json({ data: { id: q.id } });
      }
      return new Response(null, { status: 404 });
    }
    throw new Error(`a test reached the network: ${c.url}`);
  });
  rt.fetch = f.fetch;
  return {
    calls: f.calls,
    forms,
    submissions,
    clients,
    quotes,
    documents,
    pushes,
    /** Refuse the calls `rule` answers for, until it is replaced. */
    failWhen: (rule: (c: Call) => Response | undefined) => void (fail = rule),
  };
}
