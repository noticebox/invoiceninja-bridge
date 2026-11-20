// Invoice Ninja v5's API, with an API token (X-API-TOKEN; X-Requested-With as it asks for): clients by a contact's email, a new client,
// the country ids, a draft quote and its documents. The bridge only ever creates drafts: no quote is sent, no mail goes out.
import type { Runtime } from "./runtime.ts";
import { call } from "./serviceerror.ts";

export type NewClient = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  address1: string;
  postalCode: string;
  city: string;
  /** Invoice Ninja's country id; null leaves it to the company's. */
  countryId: string | null;
};

export type CustomValues = Partial<Record<"custom_value1" | "custom_value2" | "custom_value3" | "custom_value4", string>>;

const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000;

function headers(rt: Runtime, json: boolean): Record<string, string> {
  return {
    "X-API-TOKEN": rt.config.invoiceNinja.token,
    "X-Requested-With": "XMLHttpRequest",
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function api<T>(rt: Runtime, method: string, path: string, body?: unknown): Promise<T> {
  const r = await call(rt, "invoiceninja", `${rt.config.invoiceNinja.url}/api/v1${path}`, {
    method,
    headers: headers(rt, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
  return (await r.json()) as T;
}

/** The active client one of whose contacts has this email (case ignored), or null. Invoice Ninja's filter is a hint; this checks. */
export async function findClientByEmail(rt: Runtime, email: string): Promise<string | null> {
  const q = new URLSearchParams({ email, status: "active" });
  const { data } = await api<{ data: { id: string; contacts?: { email?: string }[] }[] }>(rt, "GET", `/clients?${q}`);
  const want = email.trim().toLowerCase();
  return data.find((c) => (c.contacts ?? []).some((k) => (k.email ?? "").trim().toLowerCase() === want))?.id ?? null;
}

/** A new client with one contact; its id. */
export async function createClient(rt: Runtime, c: NewClient): Promise<string> {
  const body: Record<string, unknown> = { name: c.name, address1: c.address1, postal_code: c.postalCode, city: c.city };
  if (c.countryId) body.country_id = c.countryId;
  body.contacts = [{ first_name: c.firstName, last_name: c.lastName, email: c.email, send_email: true }];
  const { data } = await api<{ data: { id: string } }>(rt, "POST", "/clients", body);
  return data.id;
}

// Per runtime: the statics' countries, ISO 3166-1 alpha-2 → Invoice Ninja's id, asked once.
const countries = new WeakMap<object, Promise<Map<string, string>>>();

/** Invoice Ninja's id for an ISO 3166-1 alpha-2 country code, or null when it has none. */
export async function countryId(rt: Runtime, iso2: string): Promise<string | null> {
  let m = countries.get(rt.store);
  if (!m) {
    m = api<{ countries: { id: string; iso_3166_2: string }[] }>(rt, "GET", "/statics").then(
      (s) => new Map(s.countries.map((c) => [c.iso_3166_2.toUpperCase(), String(c.id)])),
    );
    countries.set(rt.store, m);
    m.catch(() => countries.delete(rt.store));
  }
  return (await m).get(iso2.toUpperCase()) ?? null;
}

/** A draft quote for the client, without lines (the person prices it), with these notes and custom values. */
export async function createQuoteDraft(
  rt: Runtime,
  q: { clientId: string; privateNotes: string; customValues: CustomValues },
): Promise<{ id: string; number: string }> {
  const { data } = await api<{ data: { id: string; number: string } }>(rt, "POST", "/quotes", {
    client_id: q.clientId,
    private_notes: q.privateNotes,
    ...q.customValues,
    line_items: [],
  });
  return { id: data.id, number: data.number };
}

/**
 * The client's quote whose private notes start with `marker` (the link to its submission), or null: a quote made by an earlier try whose
 * answer was lost, so a retry doesn't make a second one.
 */
export async function findQuoteFor(rt: Runtime, clientId: string, marker: string): Promise<{ id: string; number: string } | null> {
  const q = new URLSearchParams({ client_id: clientId, per_page: "100", sort: "id|desc" });
  const { data } = await api<{ data: { id: string; number: string; private_notes?: string }[] }>(rt, "GET", `/quotes?${q}`);
  const hit = data.find((x) => (x.private_notes ?? "").startsWith(marker));
  return hit ? { id: hit.id, number: hit.number } : null;
}

/** The names of the quote's documents: what an earlier try attached although its answer was lost. */
export async function quoteDocumentNames(rt: Runtime, quoteId: string): Promise<Set<string>> {
  const { data } = await api<{ data: { documents?: { name?: string }[] } }>(rt, "GET", `/quotes/${encodeURIComponent(quoteId)}`);
  return new Set((data.documents ?? []).map((d) => d.name ?? ""));
}

/** Replaces the quote's private notes, nothing else. */
export async function updateQuoteNotes(rt: Runtime, quoteId: string, privateNotes: string): Promise<void> {
  await api(rt, "PUT", `/quotes/${encodeURIComponent(quoteId)}`, { private_notes: privateNotes });
}

/** One file as a document of the quote, not shown in the client portal. A 422 is Invoice Ninja refusing the file (ServiceError). */
export async function attachToQuote(rt: Runtime, quoteId: string, file: { name: string; type: string; bytes: Uint8Array }): Promise<void> {
  const form = new FormData();
  form.set("_method", "PUT");
  form.set("is_public", "0");
  form.set("documents[]", new File([file.bytes.slice()], file.name, { type: file.type }));
  await call(rt, "invoiceninja", `${rt.config.invoiceNinja.url}/api/v1/quotes/${encodeURIComponent(quoteId)}/upload`, {
    method: "POST",
    headers: headers(rt, false),
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}
