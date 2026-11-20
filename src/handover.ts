// The handover: a submission a person moved to its form's mapped state becomes a client, a draft quote and its documents in Invoice
// Ninja. One row per submission (src/db/handovers.ts) makes every step resumable: what a step made is stored before the next starts, so
// a second post of the same decision, or a retry after a failure, never makes a second client, quote or document. A failure is kept
// with the step and the service's status, pushed once, and tried again by retry.ts; after 24 hours it is given up, with a push. Nothing
// of the submission is stored or logged: ids, counts, states, and errors that name only a step, a service and a status.
import type { HandoverRow } from "./db/handovers.ts";
import { documentName, forInvoiceNinja, MAX_BYTES } from "./files.ts";
import {
  attachToQuote,
  countryId,
  createClient,
  createQuoteDraft,
  findClientByEmail,
  findQuoteFor,
  quoteDocumentNames,
  updateQuoteNotes,
  type CustomValues,
} from "./invoiceninja.ts";
import { namedFields, type Mapping } from "./mapping.ts";
import { quoteNotes } from "./notes.ts";
import { getFile, getForm, getSubmission, type Submission } from "./noticebox.ts";
import { push } from "./push.ts";
import type { Runtime } from "./runtime.ts";
import { ServiceError } from "./serviceerror.ts";

const GIVE_UP_MS = 24 * 60 * 60_000;
const LONGEST_WAIT_MIN = 60;

type Step = "read" | "client" | "quote" | "files";

/** A failure the bridge names itself (not a service's answer). */
class HandoverError extends Error {}

// Per store: the handovers running now, so the hook and the retry timer never run one twice at once, and tests can wait for them.
const running = new WeakMap<object, Map<string, Promise<HandoverRow | undefined>>>();

/** Waits until no handover of this runtime is running. */
export async function whenIdle(rt: Runtime): Promise<void> {
  const now = running.get(rt.store);
  while (now && now.size > 0) await Promise.allSettled([...now.values()]);
}

/**
 * noticebox's post, taken: a decision to a mapped form's state records the handover (a second post of it changes nothing) and says
 * which submission to run; anything else is ignored.
 */
export function accept(rt: Runtime, mappings: Mapping[], body: unknown): { taken: "handover"; id: string } | { taken: "ignored" } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const m = mappings.find((x) => x.form === b.form);
  if (b.event !== "decided" || typeof b.id !== "string" || !m || b.to !== m.state) {
    rt.log.debug({ event: typeof b.event === "string" ? b.event : null, form: typeof b.form === "string" ? b.form : null }, "hook: ignored");
    return { taken: "ignored" };
  }
  const now = rt.clock().toISOString();
  if (rt.store.insertHandover(b.id, m.form, now)) rt.log.info({ submission: b.id, form: m.form }, "handover: received");
  return { taken: "handover", id: b.id };
}

/** accept(), then the handover run to its end. */
export async function receive(rt: Runtime, mappings: Mapping[], body: unknown): Promise<{ taken: "handover" | "ignored" }> {
  const a = accept(rt, mappings, body);
  if (a.taken === "handover") await run(rt, mappings, a.id);
  return { taken: a.taken };
}

/** Runs the handover of `id` from where it stands; a done or given-up one is left alone. */
export async function run(rt: Runtime, mappings: Mapping[], id: string): Promise<HandoverRow | undefined> {
  const busy = running.get(rt.store) ?? new Map<string, Promise<HandoverRow | undefined>>();
  running.set(rt.store, busy);
  const already = busy.get(id);
  if (already) return already;
  const p = attempt(rt, mappings, id).finally(() => busy.delete(id));
  busy.set(id, p);
  return p;
}

async function attempt(rt: Runtime, mappings: Mapping[], id: string): Promise<HandoverRow | undefined> {
  const row = rt.store.handover(id);
  if (!row || row.state === "done" || row.state === "given_up") return row;
  const m = mappings.find((x) => x.form === row.form);
  const now = () => rt.clock().toISOString();
  const attempts = row.attempts + 1;
  rt.store.updateHandover(id, { attempts }, now());
  let step: Step = "read";
  try {
    if (!m) throw new HandoverError(`no mapping for the form ${row.form} any more`);
    const s = await getSubmission(rt, id);
    if (!s) throw new HandoverError("the submission is gone from noticebox");
    // Nothing is written to Invoice Ninja unless noticebox says the submission is in the handover state: the post is unsigned, and the
    // person may have moved it on while an earlier try waited (V1).
    if (!row.client_id && s.state !== m.state) return giveUp(rt, row, `read: the submission is in "${s.state}" in noticebox, not "${m.state}"`, attempts);
    const form = await getForm(rt, s.form);
    if (!form) throw new HandoverError("the form is gone from noticebox");
    const fields = new Set(form.fields.map((f) => f.name));
    for (const { field, at } of namedFields(m))
      if (!fields.has(field)) throw new HandoverError(`the mapping names ${field} (${at}), which the form no longer has`);

    step = "client";
    let clientId = row.client_id;
    let existed = row.client_existed === 1;
    if (!clientId) {
      const email = (s.fields[m.client.email] ?? "").trim();
      if (!email) throw new HandoverError(`the submission has no email in ${m.client.email}`);
      clientId = await findClientByEmail(rt, email);
      existed = clientId !== null;
      clientId ??= await createClient(rt, await clientFrom(rt, s, m, email));
      rt.store.updateHandover(id, { client_id: clientId, client_existed: existed ? 1 : 0 }, now());
    }

    step = "quote";
    let quoteId = row.quote_id;
    let quoteNumber = row.quote_number;
    const addressGiven = existed ? addressOf(s, m) : undefined;
    // A retry looks first for a quote an earlier try made but never heard back about (a timeout, a crash).
    if (!quoteId && attempts > 1) {
      const found = await findQuoteFor(rt, clientId, `Request from noticebox: ${s.url}`);
      if (found) {
        quoteId = found.id;
        quoteNumber = found.number;
        rt.store.updateHandover(id, { quote_id: quoteId, quote_number: quoteNumber }, now());
      }
    }
    if (!quoteId) {
      const made = await createQuoteDraft(rt, { clientId, privateNotes: quoteNotes(s, form, m, { left: [], addressGiven }), customValues: customValues(s, m) });
      quoteId = made.id;
      quoteNumber = made.number;
      rt.store.updateHandover(id, { quote_id: quoteId, quote_number: quoteNumber }, now());
    }

    step = "files";
    const done = new Set<string>(JSON.parse(row.files_done) as string[]);
    const left: Submission["files"] = [];
    // On a retry, what an earlier try attached without hearing back counts as attached.
    const there = attempts > 1 && s.files.some((f) => !done.has(f.id)) ? await quoteDocumentNames(rt, quoteId) : new Set<string>();
    for (const f of s.files) {
      if (done.has(f.id)) continue;
      if (there.has(documentName(f))) {
        done.add(f.id);
        rt.store.updateHandover(id, { files_done: JSON.stringify([...done]) }, now());
        continue;
      }
      const bytes = await getFile(rt, id, f.id);
      if (!bytes) {
        left.push(f);
        continue;
      }
      const out = forInvoiceNinja({ name: f.name, type: f.type, bytes });
      if (out.bytes.length > MAX_BYTES) {
        left.push(f);
        continue;
      }
      try {
        await attachToQuote(rt, quoteId, out);
      } catch (e) {
        // 422: Invoice Ninja refuses the file; 413: its PHP or web server finds it too large.
        if (e instanceof ServiceError && (e.status === 422 || e.status === 413)) {
          left.push(f);
          continue;
        }
        throw e;
      }
      done.add(f.id);
      rt.store.updateHandover(id, { files_done: JSON.stringify([...done]) }, now());
    }
    if (left.length > 0) await updateQuoteNotes(rt, quoteId, quoteNotes(s, form, m, { left, addressGiven }));

    rt.store.updateHandover(id, { state: "done", files_left: left.length, error: null, next_try: null }, now());
    rt.log.info({ submission: id, form: row.form, quote: quoteNumber, files: done.size, left: left.length, attempts }, "handover: done");
    if (left.length > 0)
      await push(rt, {
        title: `Handed over with files left: ${row.form}`,
        message: `Quote ${quoteNumber}: ${left.length} ${left.length === 1 ? "file was" : "files were"} too large or refused and ${left.length === 1 ? "stays" : "stay"} in noticebox until it deletes ${left.length === 1 ? "it" : "them"}.`,
        click: s.url,
      });
    return rt.store.handover(id);
  } catch (e) {
    return failed(rt, row, step, e, attempts);
  }
}

/** Records the failure, schedules the next try (1, 2, 4 … 60 minutes) or gives up after 24 hours, and pushes on a change. */
async function failed(rt: Runtime, row: HandoverRow, step: Step, e: unknown, attempts: number): Promise<HandoverRow | undefined> {
  const error =
    e instanceof ServiceError || e instanceof HandoverError ? `${step}: ${e.message}` : `${step}: unexpected ${e instanceof Error ? e.name : "error"}`;
  if (!(e instanceof ServiceError || e instanceof HandoverError))
    rt.log.error({ submission: row.submission_id, step, error: e instanceof Error ? e.name : "error" }, "handover: unexpected error");
  const now = rt.clock();
  if (now.getTime() - Date.parse(row.received_at) >= GIVE_UP_MS)
    return giveUp(rt, row, error, attempts, "Tried for 24 hours; hand it over by hand from noticebox.");
  const link = linkTo(rt, row);
  const wait = Math.min(LONGEST_WAIT_MIN, 2 ** (attempts - 1));
  const next = new Date(now.getTime() + wait * 60_000).toISOString();
  rt.store.updateHandover(row.submission_id, { state: "failed", error, next_try: next }, now.toISOString());
  rt.log.warn({ submission: row.submission_id, form: row.form, error, attempts, next }, "handover: failed");
  if (row.state !== "failed") await push(rt, { title: `Handover failed: ${row.form}`, message: `${error}. It is tried again by itself.`, click: link });
  return rt.store.handover(row.submission_id);
}

const linkTo = (rt: Runtime, row: HandoverRow) =>
  `${rt.config.noticebox.url}/forms/${encodeURIComponent(row.form)}/submissions/${encodeURIComponent(row.submission_id)}`;

/** No more tries: recorded, logged and pushed. */
async function giveUp(rt: Runtime, row: HandoverRow, error: string, attempts: number, advice = "Nothing was handed over."): Promise<HandoverRow | undefined> {
  rt.store.updateHandover(row.submission_id, { state: "given_up", error, next_try: null }, rt.clock().toISOString());
  rt.log.warn({ submission: row.submission_id, form: row.form, error, attempts }, "handover: given up");
  await push(rt, { title: `Handover given up: ${row.form}`, message: `${error}. ${advice}`, click: linkTo(rt, row) });
  return rt.store.handover(row.submission_id);
}

/** The client from the mapped fields: the name's first word is the first name; the country by the mapping's codes, else its default. */
async function clientFrom(rt: Runtime, s: Submission, m: Mapping, email: string) {
  const v = (f?: string) => (f ? (s.fields[f] ?? "").trim() : "");
  const name = v(m.client.name).replace(/\s+/g, " ");
  const [first = "", ...rest] = name.split(" ");
  const given = v(m.client.country);
  const iso = (given && m.countries?.[given]) || m.defaultCountry;
  return {
    name,
    firstName: first,
    lastName: rest.join(" "),
    email,
    address1: [v(m.client.street), v(m.client.houseNumber)].filter(Boolean).join(" "),
    postalCode: v(m.client.postalCode),
    city: v(m.client.city),
    countryId: iso ? await countryId(rt, iso) : null,
  };
}

/** The address as the submission gave it, for a client that existed already (its own address is left as it is). */
function addressOf(s: Submission, m: Mapping): string | undefined {
  const v = (f?: string) => (f ? (s.fields[f] ?? "").trim() : "");
  const street = [v(m.client.street), v(m.client.houseNumber)].filter(Boolean).join(" ");
  const town = [v(m.client.postalCode), v(m.client.city)].filter(Boolean).join(" ");
  const parts = [street, town, v(m.client.country)].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function customValues(s: Submission, m: Mapping): CustomValues {
  const out: CustomValues = {};
  for (const [k, f] of Object.entries(m.customFields ?? {}) as [keyof CustomValues, string][]) {
    const value = (s.fields[f] ?? "").trim();
    if (value) out[k] = value;
  }
  return out;
}
