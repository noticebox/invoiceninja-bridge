import { describe, expect, it } from "vitest";
import { quoteNotes } from "./notes.ts";
import type { FormInfo, Submission } from "./noticebox.ts";
import { ORDER_FORM, ORDER_MAPPING, orderRequest } from "./testing/orders.ts";

const form: FormInfo = {
  name: "3dbruckner-order",
  states: ORDER_FORM.states,
  fields: Object.entries(ORDER_FORM.fields).map(([name, f]) => ({ name, type: f.type, label: f.label ?? name })),
};

function submission(over: Parameters<typeof orderRequest>[0] = {}): Submission {
  const s = orderRequest(over);
  return {
    id: s.id,
    form: s.form,
    state: s.state,
    url: "https://inbox.test/forms/3dbruckner-order/submissions/s1",
    fields: s.fields,
    files: s.files.map((f) => ({ id: f.id, field: f.field, name: f.name, type: f.type, size: f.bytes.length })),
  };
}

describe("quoteNotes", () => {
  it("follows the form's order and labels, leaving out what the mapping takes", () => {
    expect(quoteNotes(submission(), form, ORDER_MAPPING, { left: [] })).toBe(
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
  });

  it("names the files left in noticebox, and the address given when the client existed", () => {
    const s = submission();
    const notes = quoteNotes(s, form, ORDER_MAPPING, { left: [s.files[0]!], addressGiven: "Hauptstr. 5, 12345 Berlin, Deutschland" });
    expect(notes).toContain("Dateien: 1 attached\n");
    expect(notes).toContain("Not attached (too large or refused), in noticebox until it deletes them: teil.stl\n");
    expect(notes).toContain("Address given: Hauptstr. 5, 12345 Berlin, Deutschland\n");
  });

  it("leaves out empty fields and file fields without files", () => {
    const notes = quoteNotes(submission({ files: [], fields: { name: "Anna", email: "a@b.c", material: "", description: "" } }), form, ORDER_MAPPING, {
      left: [],
    });
    expect(notes).toBe("Request from noticebox: https://inbox.test/forms/3dbruckner-order/submissions/s1");
  });
});
