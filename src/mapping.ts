// The mappings (design B6): one per form, in a JSON file (BRIDGE_MAPPINGS), read once at start. A mapping says in which state a
// submission of the form is handed over, which fields are the client's, how the form's countries map to ISO codes, and which fields go
// into the quote's custom values; every other field goes into the quote's notes. A bad file stops the start, naming each problem;
// whether the mappings fit the forms as noticebox has them is checked at start too, but only logged, since noticebox may be down then.
import { readFileSync } from "node:fs";
import * as z from "zod";
import { getForm } from "./noticebox.ts";
import type { Runtime } from "./runtime.ts";

const FIELD = z.string().trim().min(1, "a field's name");
const ISO2 = z.string().regex(/^[A-Za-z]{2}$/, "an ISO 3166-1 alpha-2 country code such as DE");

export const mappingSchema = z.strictObject({
  form: z.string().trim().min(1, "the form's name"),
  state: z.string().trim().min(1, "the state that hands a submission over"),
  client: z.strictObject({
    name: FIELD,
    email: FIELD,
    street: FIELD.optional(),
    houseNumber: FIELD.optional(),
    postalCode: FIELD.optional(),
    city: FIELD.optional(),
    country: FIELD.optional(),
  }),
  countries: z.record(z.string(), ISO2).optional(),
  defaultCountry: ISO2.optional(),
  customFields: z.partialRecord(z.enum(["custom_value1", "custom_value2", "custom_value3", "custom_value4"]), FIELD).optional(),
});

export type Mapping = z.infer<typeof mappingSchema>;

/** The mappings in `path`; throws naming the file and each problem. */
export function loadMappings(path: string): Mapping[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`the mappings file ${path} can't be read`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`the mappings file ${path} is not JSON`);
  }
  const parsed = z.array(mappingSchema).safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `${i.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("") || "the file"}: ${i.message}`,
    );
    throw new Error(`the mappings file ${path}: ${problems.join("; ")}`);
  }
  const seen = new Set<string>();
  for (const m of parsed.data) {
    if (seen.has(m.form)) throw new Error(`the mappings file ${path}: the form ${m.form} is mapped twice`);
    seen.add(m.form);
  }
  return parsed.data;
}

/** Every field a mapping names, with where it names it. */
export function namedFields(m: Mapping): { field: string; at: string }[] {
  return [
    ...Object.entries(m.client).map(([k, f]) => ({ field: f, at: `client.${k}` })),
    ...Object.entries(m.customFields ?? {}).map(([k, f]) => ({ field: f, at: `customFields.${k}` })),
  ];
}

/** What doesn't fit the forms as noticebox has them, one line each; empty when everything fits. */
export async function checkMappings(rt: Runtime, mappings: Mapping[]): Promise<string[]> {
  const problems: string[] = [];
  for (const m of mappings) {
    let form;
    try {
      form = await getForm(rt, m.form);
    } catch (e) {
      problems.push(`${m.form}: noticebox couldn't be asked (${e instanceof Error ? e.message : "error"})`);
      continue;
    }
    if (!form) {
      problems.push(`${m.form}: noticebox has no such form`);
      continue;
    }
    if (form.states && !form.states.includes(m.state)) problems.push(`${m.form}: the form has no state "${m.state}" (it has ${form.states.join(", ")})`);
    const fields = new Set(form.fields.map((f) => f.name));
    for (const { field, at } of namedFields(m)) if (!fields.has(field)) problems.push(`${m.form}: the form has no field "${field}" (${at})`);
  }
  return problems;
}
