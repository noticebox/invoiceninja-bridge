# invoiceninja-bridge: an accepted noticebox submission becomes a draft quote in Invoice Ninja

Status: agreed 2026-11-20. Part of 3dbruckner.de's order flow (`3D-Bruckner/orders`, `docs/superpowers/specs/2026-11-20-order-flow-design.md`,
D9), built generic and open source for anyone who takes requests with a noticebox form and quotes in Invoice Ninja.

## What it does

A person reads a request in noticebox and moves it to the state that means "we take it" (`angenommen` for 3dbruckner.de). noticebox
posts that decision to the bridge (a webhook with `on: ["decided"]`, noticebox ≥ 0.22.0, ADR 0008 there). The bridge then, with a
`read` token:

1. reads the submission, its form's field labels and its files from noticebox;
2. finds the Invoice Ninja client by the submission's email, or creates it with the name and address;
3. creates a **draft** quote: chosen fields into the quote's custom fields, every other field into its private notes under the
   form's own label, and a link back to the submission;
4. attaches every file to the quote as a private document (pictures and PDFs as they are, anything else zipped, because Invoice Ninja
   only takes a fixed list of file types).

It never writes to noticebox, never sends a quote or an email, and keeps no personal data: a handover row of ids and a state.

```mermaid
sequenceDiagram
    actor P as Person
    participant N as noticebox
    participant B as invoiceninja-bridge
    participant I as Invoice Ninja
    P->>N: moves a submission to "angenommen"
    N->>B: webhook: decided (ids, states, link; no content)
    B->>N: GET submission, form labels, files (read token)
    B->>I: client by email, or a new one
    B->>I: draft quote: custom fields, notes
    B->>I: files as private documents
    Note over B: handover done; a failure is kept, pushed (ntfy) and retried by itself
```

## The mapping

One per form, in a JSON file mounted into the container (`BRIDGE_MAPPINGS`, a list of these), checked at start against the form as
noticebox has it:

```json
{
  "form": "3dbruckner-order",
  "state": "angenommen",
  "client": { "name": "name", "email": "email", "street": "street", "houseNumber": "housenumber", "postalCode": "zip", "city": "city", "country": "country" },
  "countries": { "Deutschland": "DE", "Österreich": "AT", "Schweiz": "CH" },
  "defaultCountry": "DE",
  "customFields": { "custom_value1": "modellink" }
}
```

- `client.name` and `client.email` are required; the address fields are optional. A name's first word is the contact's first name,
  the rest the last name.
- `countries` maps the form's values to ISO 3166-1 alpha-2 codes; Invoice Ninja's country id comes from its statics. Anything else:
  `defaultCountry`.
- `customFields` maps `custom_value1`…`custom_value4` of the quote to form fields.
- Every field the mapping doesn't name goes into the notes as `<label>: <value>` in the form's order (a multi-line value under its
  label after a blank line), file fields as `<label>: <n> attached` plus the names of any file left in noticebox.

## Decisions

- **B1 A separate service, not a noticebox feature:** noticebox's V1 and ADR 0008: noticebox itself never sends content out; a
  person's decision starts a read by a token that person gave.
- **B2 Drafts only, never sent:** the person who accepted the request prices and sends the quote in Invoice Ninja.
- **B3 No personal data of its own:** a handover row holds the noticebox id, the Invoice Ninja ids, the files attached (by noticebox
  file id), a state and an error naming no person, address or file.
- **B4 A failure is never lost:** the webhook answers 200, the failure is kept and retried by the bridge itself after 1, 2, 4 …
  60 minutes for 24 hours; one push (ntfy) when it first fails, one when it gives up. A second post or a retry never makes a second
  client, quote or document.
- **B5 A plain service, no sign-in, no MCP, no API** (Marcel, 2026-11-20: "it just takes data from one side and pushes it to the
  other"): Node and TypeScript without a framework, `node:http` with two routes (`POST /hooks/noticebox/<secret>`, `GET /health`),
  SQLite through kysely and better-sqlite3 for the handover rows, pino logs, settings `BRIDGE_*`. A deliberate exception to the
  engineering conventions' MCP first: nothing here is for a person to operate.
- **B6 Mappings in a file**, mounted read-only and validated at start; changed by editing the file and restarting.
