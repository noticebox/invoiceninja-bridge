// The quote's private notes: what the submission said that the mapping doesn't put elsewhere, under the form's own labels and in its
// order, so nothing is lost when noticebox deletes the submission. The bridge's own words are English; the labels are the form's.
import type { Mapping } from "./mapping.ts";
import { namedFields } from "./mapping.ts";
import type { FormInfo, Submission } from "./noticebox.ts";

export function quoteNotes(s: Submission, form: FormInfo, m: Mapping, extra: { left: Submission["files"]; addressGiven?: string }): string {
  const mapped = new Set(namedFields(m).map((f) => f.field));
  const leftIds = new Set(extra.left.map((f) => f.id));
  const lines: string[] = [];
  const blocks: string[] = [];
  for (const field of form.fields) {
    if (mapped.has(field.name)) continue;
    if (field.type === "file") {
      const attached = s.files.filter((f) => f.field === field.name && !leftIds.has(f.id)).length;
      if (attached > 0) lines.push(`${field.label}: ${attached} attached`);
      continue;
    }
    const value = (s.fields[field.name] ?? "").trim();
    if (!value) continue;
    if (field.type === "textarea" || value.includes("\n")) blocks.push(`${field.label}:\n${value}`);
    else lines.push(`${field.label}: ${value}`);
  }
  if (extra.left.length > 0) lines.push(`Not attached (too large or refused), in noticebox until it deletes them: ${extra.left.map((f) => f.name).join(", ")}`);
  if (extra.addressGiven) lines.push(`Address given: ${extra.addressGiven}`);
  return [`Request from noticebox: ${s.url}`, ...(lines.length ? ["", ...lines] : []), ...blocks.flatMap((b) => ["", b])].join("\n");
}
