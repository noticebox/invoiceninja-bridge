# invoiceninja-bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person moves a noticebox submission to a form's handover state, it becomes in Invoice Ninja a client (found by email
or made), a draft quote (custom fields, notes under the form's labels) and the files as private documents.

**Architecture:** A Next.js app on next-app-kit, built from upload's skeleton (3D-Bruckner/upload) with the portfolio taken out:
sign-in only for MCP's OAuth, MCP, REST, API tokens, SQLite. Mappings per form live in the database. noticebox posts `{event:
"decided", form, id, to, …}` to `/api/hooks/noticebox/<secret>`; when `to` is the form's mapped state, a handover row (ids only) is
recorded and resumable steps run: read → client → quote → files. Each step stores its result before the next.

**Tech Stack:** Next.js 16, next-app-kit 0.1.7, kysely + better-sqlite3, zod, pino, fflate, Vitest, Playwright, Material for MkDocs.

**Spec:** `docs/superpowers/specs/2026-11-20-invoiceninja-bridge-design.md`; the order flow it serves:
3D-Bruckner/orders `docs/superpowers/specs/2026-11-20-order-flow-design.md`.

## Global Constraints

- No personal data stored (B3); logs never hold a token, the hook secret, an email address, a field value or a file name.
- Never writes to noticebox; only drafts in Invoice Ninja, never sent (B2).
- Settings: `BRIDGE_SECRET`, `BRIDGE_ALLOWED_EMAILS`, the kit's `BRIDGE_SMTP_*` / `BRIDGE_OIDC_<NAME>_*`, `BRIDGE_NOTICEBOX_URL`,
  `BRIDGE_NOTICEBOX_TOKEN`, `BRIDGE_HOOK_SECRET` (≥ 32 characters), `BRIDGE_INVOICENINJA_URL`, `BRIDGE_INVOICENINJA_TOKEN`,
  `BRIDGE_NTFY_URL` (optional), `BRIDGE_LOG_LEVEL`, plus `PUBLIC_URL`, `DATA_DIR`, `PORT`, `TZ`. `backend/config.ts` (`VARIABLES`),
  `.env.example` and `docs/configuration.md` change together. No default points at Marcel's instances.
- Invoice Ninja: `X-API-TOKEN`, `X-Requested-With: XMLHttpRequest`. noticebox: `Authorization: Bearer nbx_…`.
- Tests never reach noticebox, Invoice Ninja or ntfy (fake `rt.fetch`), data in a temporary `DATA_DIR`.
- English everywhere (code, logs, MCP, docs, the notes' own words: `Request from noticebox: <url>`, `<n> attached`, `not attached
  (too large or refused): …`); the field labels in the notes are the form's own.
- Public, AGPL-3.0-only, CLA, `SECURITY.md`, a docs site with values and roadmap pages (engineering conventions: docs-site,
  values-and-roadmap, cla, security); repo `noticebox/invoiceninja-bridge`, image `ghcr.io/noticebox/invoiceninja-bridge`.
- One commit per task, trailers as the session says; merge only on Marcel's word.

## Facts checked on the instances (2026-11-20)

- noticebox: `GET /api/v1/submissions/{id}` → `{id, form, state, url, fields: Record<string,string>, files: [{id, field, name, type,
  size, picture, url, api_url}]}`; `GET /api/v1/submissions/{id}/files/{file}` the bytes; `GET /api/v1/forms/{name}` the form as
  stored (fields with `type`, `label`, in order; `states`). A `read` token may GET all three.
- Invoice Ninja 5.13.48: `GET /api/v1/clients?email=<e>&status=active` (without `status=active` deleted clients too);
  `POST /api/v1/clients`, `POST /api/v1/quotes` (a draft unless sent), `PUT /api/v1/quotes/{id}`, `POST /api/v1/quotes/{id}/upload`
  (multipart, `_method=PUT`, `documents[]`, `is_public`). Countries: `GET /api/v1/statics` (each with `id` and `iso_3166_2`; verify
  the shape in Task 3 against the instance before the fixture is written).
- Documents are validated with Laravel `mimes` by content against `png, ai, jpeg, tiff, pdf, gif, psd, txt, doc, xls, ppt, xlsx,
  docx, pptx, webp, xml, zip, csv, ods, odt, odp` (`ADDITIONAL_UPLOAD_EXTENSIONS` adds to it, but a binary STL is
  `application/octet-stream` and fails anyway), `max:100000` KB. Marcel's instance: PHP `upload_max_filesize`/`post_max_size` 10M,
  nginx 100M. So: `image/*` of those kinds and PDFs as they are, all else zipped; the docs say to raise PHP's limits.

## Review Focus

1. **The same decision twice, or a retry after a half-done handover:** one client, one quote, each file once.
2. **A returning customer, email in another case:** the existing client.
3. **A file Invoice Ninja refuses or that is too large after zipping:** the rest attached, the notes name it, `done` with
   `filesLeft`, one push.
4. **A mapping that no longer fits the form** (a field renamed in noticebox after `put_mapping`): the handover fails naming the
   missing field, not with a crash; `put_mapping` refuses unknown fields and states up front.
5. **noticebox or Invoice Ninja down, slow, or refusing the token:** 200 to the hook, `failed` with step and status, one push,
   `retry_handover` finishes it.

---

### Task 1: The skeleton

**Files:** the repository `/root/noticebox/invoiceninja-bridge`, from upload cut down: root config (`package.json` name
`invoiceninja-bridge`, AGPL-3.0-only, upload's pinned versions without `sharp`, fonts, `lucide-react` unless the sign-in pages need
them), `.nvmrc`, `.npmrc`, `.editorconfig`, Prettier and ESLint configs (same boundaries), `tsconfig.json`, `next.config.ts`, Vitest
and Playwright configs, `proxy.ts` + test, `instrumentation.ts` (config and DB open only), `Dockerfile`, `docker-entrypoint.mjs`,
`compose.yaml`, `.env.example`, `LICENSE`, `CLA.md`, `CONTRIBUTING.md`, `SECURITY.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`,
`.github/` (`ci.yml` jobs `check` and `image`, `audit.yml`, `cla.yml`, `dependabot.yml`, `dependabot-automerge.yml`),
`scripts/generate-openapi.mjs`. `backend/`: `config.ts` (core), `accounts.ts` (prefix `BRIDGE`, tokens `nib_`), `runtime.ts`,
`log.ts`, `health.ts`, `outcome.ts`, `db/` (connection, schema, migration `init`, store), `mcp.ts` + `rest.ts` with the token tools,
`index.ts`, `testing/`, the matching tests. `app/`: sign-in, consent, one page (`/`: "This bridge has no screens; set it up over
MCP at /mcp" and sign-out), auth, `.well-known`, `api/v1`, `mcp`, `health`, `api/test/sign-in`, `api/language`; copy `en.ts` +
`de.ts`; one e2e test.

**Interfaces:** `Runtime` = upload's minus `askClaude` and `onSiteChange`; `Store = { transaction, answers, close }` plus later tables.

- [ ] **Step 1:** Copy and cut down; `npm ci`.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e && npm run generate -- --check`
  green; `docker build .` and the image's `/health` 200.
- [ ] **Step 3:** Commit `The skeleton: next-app-kit sign-in, MCP and REST`.

### Task 2: Settings and the push

**Files:** `backend/config.ts`, `backend/config.test.ts`, `.env.example`, `docs/configuration.md`, `backend/push.ts`, `backend/push.test.ts`

**Interfaces:** `Config.noticebox?: { url; token; hookSecret }` (all three set), `Config.invoiceNinja?: { url; token }` (both set;
trailing `/` dropped), `Config.ntfyUrl?`; `ready(config): boolean`. `push(rt, { title, message, click?, priority? })` — ntfy POST,
10 s, logged once without a URL, never throws.

- [ ] **Step 1: Failing tests:** `"reads the bridge settings"`, `"stays off while a part is missing"`, `"refuses a hook secret under
  32 characters"`, `"the URLs must be http(s)"`, `envExampleListsEveryVariable`; `"posts title, priority and click"`, `"does nothing
  without BRIDGE_NTFY_URL"`, `"swallows a failed push"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `Settings and the ntfy push`.

### Task 3: The noticebox and Invoice Ninja clients

**Files:** `backend/serviceerror.ts`, `backend/noticebox.ts`, `backend/invoiceninja.ts`, `backend/integrations.test.ts`

**Interfaces:**
- `ServiceError { service: "noticebox" | "invoiceninja"; status: number | null }`, message without anything from a body.
- noticebox: `getSubmission(rt, id): Promise<Submission | null>`; `getForm(rt, name): Promise<FormInfo | null>` with `FormInfo = {
  name; states: string[]; fields: { name: string; type: string; label: string }[] }` (label falls back to the name);
  `getFile(rt, submissionId, fileId): Promise<Uint8Array>`. 15 s; files 120 s.
- Invoice Ninja: `findClientByEmail`, `createClient(rt, NewClient)`, `countryId(rt, iso2): Promise<string | null>` (statics, kept per
  runtime), `createQuoteDraft(rt, { clientId, privateNotes, customValues: Partial<Record<"custom_value1"|…|"custom_value4", string>> })`
  → `{ id; number }`, `updateQuoteNotes(rt, quoteId, notes)`, `attachToQuote(rt, quoteId, { name; type; bytes })` (`is_public=0`).

- [ ] **Step 0:** Read `GET /api/v1/statics` once on Marcel's instance (MCP `apiRequest`) and write the fixture from its real shape.
- [ ] **Step 1: Failing tests:** `"getSubmission sends the bearer token"`, `"getSubmission is null on 404"`, `"getForm reads labels
  in order"`, `"getFile returns the bytes"`, `"findClientByEmail matches ignoring case"`, `"…ignores a client for another address"`,
  `"createClient sends the headers and the contact"`, `"countryId maps DE to its id"`, `"createQuoteDraft makes a draft and never
  sends it"`, `"attachToQuote sends one private document"`, `"a 5xx or a timeout is a ServiceError naming service and status only"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `noticebox and Invoice Ninja clients`.

### Task 4: Mappings

**Files:** `backend/db/migrations.ts` (migration `mappings`: `form text primary key, definition text not null, updated_at`),
`backend/db/mappings.ts`, `backend/mapping.ts`, `backend/mapping.test.ts`

**Interfaces:** `mappingSchema` (zod) for the spec's JSON: `form`, `state`, `client { name, email, street?, houseNumber?,
postalCode?, city?, country? }`, `countries?: Record<string, ISO2>`, `defaultCountry?: ISO2` (used when the country field is
empty or not in `countries`; without it the client gets no country and Invoice Ninja uses the company's), `customFields?:
Partial<Record<"custom_value1"|…|"custom_value4", string>>`. `putMapping(rt, input): Promise<Outcome<Mapping>>` — checks against
`getForm`: the form exists, `state` is one of its states, every named field exists (else `invalid` naming each); `getMapping`,
`listMappings`, `deleteMapping`.

- [ ] **Step 1: Failing tests:** `"a mapping is checked against the form"` (unknown field, unknown state, unknown form → each named),
  `"a valid mapping is stored and read back"`, `"put replaces, delete removes"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `Mappings per form, checked against noticebox`.

### Task 5: The handover

**Files:** migration `handovers`, `backend/db/handovers.ts`, `backend/files.ts`, `backend/notes.ts`, `backend/handover.ts`, their tests

**Interfaces:**
- Table `handovers (submission_id text primary key, form text not null, state text not null check (state in
  ('pending','done','failed')), client_id, quote_id, quote_number, files_done text not null default '[]', files_left integer not null
  default 0, attempts integer not null default 0, error text, received_at, updated_at)`.
- `files.ts`: `forInvoiceNinja({ name, type, bytes })` — `image/png|jpeg|gif|webp|tiff` and `application/pdf` as they are, else
  `<name>.zip` (fflate `zipSync`, level 6); `MAX_BYTES = 100_000 * 1024`.
- `notes.ts`: `quoteNotes(s: Submission, form: FormInfo, m: Mapping, left: string[]): string` — exactly:
  ```
  Request from noticebox: <s.url>

  <Label>: <value>                (each unmapped single-line field, form order, empty ones left out)
  <File label>: <n> attached      (each file field with files)
  Not attached (too large or refused), in noticebox until it deletes them: <name>, <name>

  <Label>:                        (each unmapped multi-line value, form order)
  <value>
  ```
- `handover.ts`: `receiveHook(rt, body): Promise<{ taken: "handover" | "ignored"; handover? }>` — only `event: "decided"` with a
  mapping for `form` and `to === mapping.state`. `runHandover(rt, id)` — as step 2's intake: (1) `getSubmission` + `getForm` (gone →
  `the submission is gone from noticebox`; a mapped field missing from the form → `the mapping names <field>, which the form no
  longer has`); (2) client: stored, else `findClientByEmail`, else `createClient(clientFrom(fields, m))`; (3) quote: stored, else
  `createQuoteDraft`; (4) each file not in `files_done`: `getFile` → `forInvoiceNinja` → over `MAX_BYTES` or Invoice Ninja 422 → left;
  else attach, then record; (5) files left → `updateQuoteNotes`. Errors → `failed` with `"<step>: <service> answered <status>"` /
  `timed out`; one push when turning `failed` (`Handover failed: <form>`, click the submission's url); one push for `done` with files
  left. `clientFrom(fields, m)`; `retryHandover`, `listHandoversView`, `quoteUrl(rt, h) = <IN url>/quotes/<id>/edit`.

- [ ] **Step 1: Failing tests** (`handover.test.ts` with a fake noticebox + Invoice Ninja; `files.test.ts`; `notes.test.ts`):
  `"an accepted submission becomes client, draft quote and documents"` (3dbruckner's mapping as the fixture: `Anna` / `Beispiel
  Muster`, `Hauptstr. 5`, country via statics, `custom_value1` = the link, notes exactly as above, `.jpg` as is, `.stl` as
  `teil.stl.zip`, both private); `"a returning customer keeps their client"`; `"the same decision twice makes one quote, each file
  once"`; `"a retry after a failed upload attaches only the rest"`; `"a file too large is left and named"`; `"a refused file is
  left, the rest goes on"`; `"other decisions, forms without a mapping and arrivals are ignored"`; `"a sparse submission still makes
  a quote"`; `"a mapping that no longer fits fails naming the field"`; `"a submission gone fails with that reason"`; `"nothing
  personal is stored or logged"`; `notes.test.ts` `"notes follow the form's order and labels"`; `files.test.ts` `"pictures and PDFs
  as they are"`, `"a model file zipped under its name"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `The handover`.

### Task 6: The hook

**Files:** `app/api/hooks/noticebox/[secret]/route.ts`, `hook.ts`, `hook.test.ts`

**Interfaces:** `noticeboxHook(rt, req, secret)` — 404 when not `ready` or the secret is wrong (`timingSafeEqual` over SHA-256);
400 for non-JSON or over 16 KB; else 200 `{ taken }`; an error inside → logged, 200.

- [ ] **Step 1: Failing tests:** wrong secret 404 and nothing runs; not configured 404; a handover decision 200 and it ran; an arrival
  200 ignored; a broken body 400; Invoice Ninja down still 200.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `The noticebox hook`.

### Task 7: MCP tools and REST operations

**Files:** `backend/shapes.ts`, `backend/mcp.ts`, `backend/rest.ts`, tests, `openapi.json`

**Interfaces:** tools and their operations: `list_mappings` (`GET /mappings`), `get_mapping` (`GET /mappings/{form}`), `put_mapping`
(`PUT /mappings/{form}`), `delete_mapping` (`DELETE /mappings/{form}`), `list_handovers` (`GET /handovers?state=`), `retry_handover`
(`POST /handovers/{id}/retry`). `put_mapping`'s description carries the mapping's shape and an example; its guidance says to add the
webhook to the form in noticebox (`{type: "webhook", url: "<PUBLIC_URL>/api/hooks/noticebox/<secret>", on: ["decided"]}`, the secret
as a `${VAR}`), and to check Invoice Ninja's upload limits. `retry_handover` done → the quote's number and url, "price it and send it
there". A read token may only GET.

- [ ] **Step 1: Failing tests:** `checkOpsMirrorTools`; `"mappings over REST"` (400 naming an unknown field; read token 403 on
  PUT); `"lists and retries handovers"`; `"put_mapping guidance names the webhook to add"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement; `npm run generate`. **Step 4:** → PASS. **Step 5:** Commit `MCP tools and REST`.

### Task 8: The docs site

**Files:** `mkdocs.yml` (Material, the conventions' theme with its own colour and icon, `site_url:
https://noticebox.github.io/invoiceninja-bridge/`), `requirements-docs.txt`, `.github/workflows/docs.yml` (Pages from `main`),
`docs/index.md`, `docs/setup.md` (compose, `.env`, the noticebox webhook, the Invoice Ninja token and upload limits:
`ADDITIONAL_UPLOAD_EXTENSIONS` doesn't help binary models, raise PHP's `upload_max_filesize`/`post_max_size`), `docs/mapping.md`,
`docs/configuration.md`, `docs/mcp.md`, `docs/values.md` (V1 content leaves noticebox only after a person's decision, through a
token they gave; V2 drafts only; V3 nothing kept but ids; each with **Rules out:**), `docs/roadmap.yml` + page, `docs/adr/0001-a-
bridge-not-a-noticebox-feature.md`, `0002-drafts-only.md`, `0003-files-zipped-for-invoice-ninja.md`; `README.md` short; `CLAUDE.md`.

- [ ] **Step 1:** Write; `mkdocs build --strict`; `npm run format:check`.
- [ ] **Step 2:** Full run: lint, typecheck, unit, build, e2e, `generate -- --check`.
- [ ] **Step 3:** Commit `Docs site, values, roadmap, ADRs 0001–0003`.

### Task 9 (after Marcel's merge): Deploy and test end to end

- [ ] GitHub `noticebox/invoiceninja-bridge`: ruleset `main` requires `check`; Pages; Dependabot automerge; CLA. Release `v0.1.0`
  (tag on main; CI publishes `ghcr.io/noticebox/invoiceninja-bridge:0.1.0`).
- [ ] Tokens: Invoice Ninja API token `invoiceninja-bridge`; noticebox `read` token; hook secret; `BRIDGE_SECRET`. 1Password
  "Business Admin" and the gewerbe vault.
- [ ] noticebox/stacks: `invoiceninja-bridge/compose.yaml`. Business ansible (gewerbe): the stack, its `.env`, DNS and Caddy for its
  host (Marcel picks the name, e.g. `invoiceninja-bridge.marcelbruckner.de`), noticebox's env `HOOK_INVOICENINJA_BRIDGE`, Invoice
  Ninja's PHP limits to 100M (business stacks). PRs; Marcel merges; deploy gewerbe-1 from main.
- [ ] Over MCP: `put_mapping` for `3dbruckner-order` (the spec's example). noticebox (needs 0.22.0 deployed): the form's states
  `new`, `angenommen` (closed), `answered` (closed), `test`, and the webhook with `on: ["decided"]`.
- [ ] End to end: one real request through 3dbruckner.de's form from Marcel's address with a small STL and a photo; accepted in the
  inbox → existing client, draft quote with notes, both files (STL zipped); `list_handovers` shows it `done`. Marcel deletes the
  draft (its number stays used).
