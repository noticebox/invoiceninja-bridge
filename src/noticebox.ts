// noticebox's REST API (/api/v1), read with a `read` token of the person who accepts the submissions: a submission with its fields and
// files, its form's fields (labels, in order) and states, and a file's bytes. The bridge never writes to noticebox.
import type { Runtime } from "./runtime.ts";
import { call } from "./serviceerror.ts";

export type Submission = {
  id: string;
  form: string;
  state: string;
  url: string;
  fields: Record<string, string>;
  files: { id: string; field: string; name: string; type: string; size: number }[];
};

export type FormInfo = { name: string; states: string[]; fields: { name: string; type: string; label: string }[] };

const TIMEOUT_MS = 15_000;
const FILE_TIMEOUT_MS = 120_000;

const get = (rt: Runtime, path: string, timeoutMs = TIMEOUT_MS) =>
  call(
    rt,
    "noticebox",
    `${rt.config.noticebox.url}/api/v1${path}`,
    { headers: { authorization: `Bearer ${rt.config.noticebox.token}`, accept: "application/json" }, timeoutMs },
    (s) => (s >= 200 && s < 300) || s === 404,
  );

/** The submission, or null when noticebox has none by that id (deleted, or never there). */
export async function getSubmission(rt: Runtime, id: string): Promise<Submission | null> {
  const r = await get(rt, `/submissions/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  const s = (await r.json()) as Submission & { files?: (Submission["files"][number] & Record<string, unknown>)[] };
  return {
    id: s.id,
    form: s.form,
    state: s.state,
    url: s.url,
    fields: s.fields ?? {},
    files: (s.files ?? []).map((f) => ({ id: f.id, field: f.field, name: f.name, type: f.type, size: f.size })),
  };
}

/** The form's fields in its order, each with its label (its name when it has none), and its states; null when there is no such form. */
export async function getForm(rt: Runtime, name: string): Promise<FormInfo | null> {
  const r = await get(rt, `/forms/${encodeURIComponent(name)}`);
  if (r.status === 404) return null;
  const body = (await r.json()) as { name: string; form: { fields?: Record<string, { type?: string; label?: string }>; states?: { name: string }[] } };
  return {
    name: body.name,
    states: (body.form.states ?? []).map((s) => s.name),
    fields: Object.entries(body.form.fields ?? {}).map(([n, f]) => ({ name: n, type: f.type ?? "text", label: f.label || n })),
  };
}

/** A file that came with the submission, as bytes; null when noticebox doesn't have it (any more). */
export async function getFile(rt: Runtime, submissionId: string, fileId: string): Promise<Uint8Array | null> {
  const r = await get(rt, `/submissions/${encodeURIComponent(submissionId)}/files/${encodeURIComponent(fileId)}`, FILE_TIMEOUT_MS);
  if (r.status === 404) return null;
  return new Uint8Array(await r.arrayBuffer());
}
