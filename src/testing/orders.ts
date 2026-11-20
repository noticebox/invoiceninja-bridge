// 3dbruckner.de's order form as noticebox has it (fields, labels, states, 2026-11-20), its mapping, and one accepted request: the
// fixture the handover tests run on.
import type { Mapping } from "../mapping.ts";
import type { FakeForm, FakeSubmission } from "./services.ts";

export const FORM_NAME = "3dbruckner-order";

export const ORDER_FORM: FakeForm = {
  fields: {
    name: { type: "text", label: "Name" },
    email: { type: "email", label: "E-Mail" },
    modelsource: { type: "select", label: "Ausgangslage" },
    modellink: { type: "text", label: "Link zum Modell" },
    description: { type: "textarea", label: "Beschreibung" },
    dateien: { type: "file", label: "Dateien" },
    multicolor: { type: "select", label: "Mehrfarbig" },
    material: { type: "text", label: "Material" },
    street: { type: "text", label: "Straße" },
    housenumber: { type: "text", label: "Hausnummer" },
    zip: { type: "text", label: "PLZ" },
    city: { type: "text", label: "Stadt" },
    country: { type: "select", label: "Land" },
  },
  states: ["new", "angenommen", "answered", "test"],
};

export const ORDER_MAPPING: Mapping = {
  form: FORM_NAME,
  state: "angenommen",
  client: { name: "name", email: "email", street: "street", houseNumber: "housenumber", postalCode: "zip", city: "city", country: "country" },
  countries: { Deutschland: "DE", Österreich: "AT", Schweiz: "CH" },
  defaultCountry: "DE",
  customFields: { custom_value1: "modellink" },
};

export function orderRequest(over: Partial<FakeSubmission> = {}): FakeSubmission {
  return {
    id: "s1",
    form: FORM_NAME,
    state: "angenommen",
    fields: {
      name: "Anna Beispiel Muster",
      email: "anna@example.org",
      modelsource: "vorhanden",
      modellink: "https://makerworld.com/models/1",
      description: "Bitte in Rot.\nZwei Stück.",
      multicolor: "nein",
      material: "PETG",
      street: "Hauptstr.",
      housenumber: "5",
      zip: "12345",
      city: "Berlin",
      country: "Deutschland",
    },
    files: [
      { id: "f1", field: "dateien", name: "teil.stl", type: "model/stl", bytes: new TextEncoder().encode("solid teil\nendsolid teil\n") },
      { id: "f2", field: "dateien", name: "foto.jpg", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ],
    ...over,
  };
}

/** noticebox's decision post for `id` moving to `to`. */
export const decided = (id: string, to = "angenommen", form = FORM_NAME, from = "new") => ({
  event: "decided",
  form,
  kind: "message",
  id,
  from,
  to,
  at: "2026-11-20T10:00:00.000Z",
  url: `https://inbox.test/forms/${form}/submissions/${id}`,
});
