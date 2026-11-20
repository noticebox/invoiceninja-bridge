import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMappings, loadMappings } from "./mapping.ts";
import { fakeFetch } from "./testing/fetch.ts";
import { testRuntime, type TestRuntime } from "./testing/runtime.ts";

export const ORDERS = {
  form: "3dbruckner-order",
  state: "angenommen",
  client: { name: "name", email: "email", street: "street", houseNumber: "housenumber", postalCode: "zip", city: "city", country: "country" },
  countries: { Deutschland: "DE", Österreich: "AT", Schweiz: "CH" },
  defaultCountry: "DE",
  customFields: { custom_value1: "modellink" },
};

function file(content: unknown): string {
  const p = join(mkdtempSync(join(process.env.DATA_DIR!, "m-")), "mappings.json");
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return p;
}

describe("loadMappings", () => {
  it("reads a valid file", () => {
    const minimal = { form: "contact", state: "accepted", client: { name: "who", email: "mail" } };
    expect(loadMappings(file([ORDERS, minimal]))).toEqual([ORDERS, minimal]);
    expect(loadMappings(file([]))).toEqual([]);
  });

  it("names the file and each problem of a bad one", () => {
    const p = file([{ form: "x", client: { name: "n" }, countries: { A: "Austria" }, customFields: { custom_value9: "f" } }]);
    let message = "";
    try {
      loadMappings(p);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(p);
    for (const part of ["[0].state", "[0].client.email", "[0].countries.A", "[0].customFields"]) expect(message).toContain(part);
    expect(() => loadMappings(file("{not json"))).toThrow(/not JSON/);
    expect(() => loadMappings("/nonexistent/mappings.json")).toThrow(/can't be read/);
  });

  it("refuses a form twice", () => {
    expect(() => loadMappings(file([ORDERS, ORDERS]))).toThrow(/3dbruckner-order.*twice/);
  });
});

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
});

const FORM = {
  name: "3dbruckner-order",
  form: {
    fields: Object.fromEntries(
      ["name", "email", "street", "housenumber", "zip", "city", "country", "modellink", "description"].map((n) => [n, { type: "text" }]),
    ),
    states: [{ name: "new" }, { name: "angenommen" }, { name: "answered" }],
  },
};

describe("checkMappings", () => {
  function rtWithForms() {
    const rt = testRuntime();
    opened.push(rt);
    rt.fetch = fakeFetch((c) => (c.url.endsWith("/forms/3dbruckner-order") ? Response.json(FORM) : new Response(null, { status: 404 }))).fetch;
    return rt;
  }

  it("is quiet for a mapping that fits its form", async () => {
    expect(await checkMappings(rtWithForms(), [ORDERS])).toEqual([]);
  });

  it("names an unknown form, state and field", async () => {
    const rt = rtWithForms();
    const problems = await checkMappings(rt, [
      { ...ORDERS, state: "accepted", client: { ...ORDERS.client, city: "town" } },
      { form: "gone", state: "x", client: { name: "n", email: "e" } },
    ]);
    expect(problems).toEqual([
      '3dbruckner-order: the form has no state "accepted" (it has new, angenommen, answered)',
      '3dbruckner-order: the form has no field "town" (client.city)',
      "gone: noticebox has no such form",
    ]);
  });
});
