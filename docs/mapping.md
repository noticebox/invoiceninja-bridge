# The mapping

`mappings.json` is a list with one mapping per form. A mapping says when a submission of that form is handed over and which of its
fields are the client's; every other field goes into the quote's notes.

```json
[
  {
    "form": "3dbruckner-order",
    "state": "angenommen",
    "client": {
      "name": "name",
      "email": "email",
      "street": "street",
      "houseNumber": "housenumber",
      "postalCode": "zip",
      "city": "city",
      "country": "country"
    },
    "countries": { "Deutschland": "DE", "Österreich": "AT", "Schweiz": "CH" },
    "defaultCountry": "DE",
    "customFields": { "custom_value1": "modellink" }
  }
]
```

| Key | Required | What it is |
| --- | --- | --- |
| `form` | yes | The form's name in noticebox. A form may be mapped once. |
| `state` | yes | The state that hands a submission over. Moving it there is the decision; any other decision is ignored. |
| `client.name`, `client.email` | yes | The fields with the person's name and email. The name's first word is the contact's first name, the rest the last name. |
| `client.street`, `client.houseNumber`, `client.postalCode`, `client.city`, `client.country` | | The address fields; street and house number go together into the first address line. |
| `countries` | | The country field's values as ISO 3166-1 alpha-2 codes (`DE`); Invoice Ninja's country follows from the code. |
| `defaultCountry` | | The code for a submission whose country is empty or not in `countries`; without it, Invoice Ninja uses the company's. |
| `customFields` | | Quote custom values (`custom_value1` … `custom_value4`, as named in Invoice Ninja's settings) filled from fields. |

## What goes into the notes

The quote's private notes start with a link to the submission, then every field the mapping doesn't name, under the form's own label
and in the form's order. Empty fields are left out; a long text (a textarea, or anything with line breaks) comes last under its label.

```text
Request from noticebox: https://inbox.example.org/forms/3dbruckner-order/submissions/kemGIkDjIh9Y

Ausgangslage: vorhanden
Dateien: 2 attached
Mehrfarbig: nein
Material: PETG

Beschreibung:
Bitte in Rot.
Zwei Stück.
```

A file left in noticebox (too large, or refused by Invoice Ninja) is named in a line of its own. For a client that existed already, the
address as the submission gave it is noted too (`Address given: …`); the client's own stays as it is.

## When a mapping no longer fits

The mappings are checked against noticebox at start; a form, state or field that isn't there is logged as a warning. A handover whose
mapping names a field the form no longer has fails with that field named, and is tried again (fix the mapping and restart within 24
hours, and it goes through).
