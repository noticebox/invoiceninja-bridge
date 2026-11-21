# invoiceninja-bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person moves a noticebox submission to a form's handover state, it becomes in Invoice Ninja a client (found by email
or made), a draft quote (custom fields, notes under the form's labels) and the files as private documents.

**Architecture:** A plain Node/TypeScript service, no framework, no sign-in, no MCP (design B5): `node:http` with
`POST /hooks/noticebox/<secret>` and `GET /health`. Mappings come from a JSON file (B6). A handover row (ids only) makes every step
resumable: read → client → quote → files, each result stored before the next. A minute timer retries failed handovers (B4).

**Tech Stack:** Node 26, TypeScript (built with `tsc` to `dist/`), kysely + better-sqlite3, zod, pino, fflate, Vitest, ESLint
(typescript-eslint), Prettier 160, Docker, Material for MkDocs.

**Spec:** `docs/superpowers/specs/2026-11-20-invoiceninja-bridge-design.md`; the order flow it serves: 3D-Bruckner/print-bridge
`docs/superpowers/specs/2026-11-20-order-flow-design.md`.

## Global Constraints

- No personal data stored (B3); logs never hold a token, the hook secret, an email address, a field value or a file name.
- Never writes to noticebox; only drafts in Invoice Ninja, never sent (B2).
- Settings (all `BRIDGE_*` but `DATA_DIR`, `PORT`, `TZ`): `BRIDGE_NOTICEBOX_URL`, `BRIDGE_NOTICEBOX_TOKEN`, `BRIDGE_HOOK_SECRET`
  (≥ 32 characters), `BRIDGE_INVOICENINJA_URL`, `BRIDGE_INVOICENINJA_TOKEN`, `BRIDGE_MAPPINGS` (path, default `/config/mappings.json`),
  `BRIDGE_NTFY_URL` (optional), `BRIDGE_LOG_LEVEL` (default `info`), `DATA_DIR` (default `/data`), `PORT` (default `8080`), `TZ`. All
  required ones missing or wrong stop the start, naming each. `src/config.ts`, `.env.example` and `docs/configuration.md` list the
  same variables (a test checks it). No default points at Marcel's instances.
- Invoice Ninja: `X-API-TOKEN`, `X-Requested-With: XMLHttpRequest`. noticebox: `Authorization: Bearer nbx_…`.
- Only `src/db/` imports kysely and better-sqlite3 (ESLint `no-restricted-imports`); migrations are append-only.
- Tests never reach noticebox, Invoice Ninja or ntfy (a fake `fetch` in the runtime), data in a temporary `DATA_DIR` per test file.
- English everywhere; the notes' own words: `Request from noticebox: <url>`, `<n> attached`, `Not attached (too large or refused), in
  noticebox until it deletes them: …`; field labels are the form's own.
- Public, AGPL-3.0-only, CLA, `SECURITY.md`, a docs site with values and roadmap; image `ghcr.io/noticebox/invoiceninja-bridge`.
- One commit per task, trailers as the session says; merge only on Marcel's word.

## Facts checked on the instances (2026-11-20)

- noticebox: `GET /api/v1/submissions/{id}` → `{id, form, state, url, fields: Record<string,string>, files: [{id, field, name, type,
  size, picture, url, api_url}]}`; `GET /api/v1/submissions/{id}/files/{file}` the bytes; `GET /api/v1/forms/{name}` the form as
  stored (fields with `type`, `label`, in order; `states`). A `read` token may GET all three. Decision posts need noticebox ≥ 0.22.0.
- Invoice Ninja 5.13.48: `GET /api/v1/clients?email=<e>&status=active` (without `status=active` deleted clients too);
  `POST /api/v1/clients`; `POST /api/v1/quotes` (a draft unless sent); `PUT /api/v1/quotes/{id}`; `POST /api/v1/quotes/{id}/upload`
  (multipart, `_method=PUT`, `documents[]`, `is_public`). Countries: `GET /api/v1/statics` (verify the shape in Task 3 first).
- Documents are validated with Laravel `mimes` by content against `png, ai, jpeg, tiff, pdf, gif, psd, txt, doc, xls, ppt, xlsx,
  docx, pptx, webp, xml, zip, csv, ods, odt, odp`, `max:100000` KB; Marcel's PHP takes 10 MB until raised. So: pictures and PDFs as
  they are, everything else zipped.

## Review Focus

1. **The same decision twice, or a retry after a half-done handover:** one client, one quote, each file once.
2. **A returning customer, email in another case:** the existing client.
3. **A file Invoice Ninja refuses or that is too large after zipping:** the rest attached, the notes name it, `done` with files left,
   one push.
4. **A mapping that no longer fits the form** (a field renamed in noticebox): the start logs it; a handover fails naming the field.
5. **noticebox or Invoice Ninja down or refusing the token:** 200 to the hook, `failed`, retried by the timer, one push, a second
   push when it gives up after 24 hours.

---

### Task 1: The service's frame

**Files:** `package.json` (`type: module`, scripts `build` = `tsc -p tsconfig.build.json`, `start` = `node dist/main.js`, `dev` =
`node --watch --experimental-strip-types src/main.ts`, `lint`, `format`, `format:check`, `typecheck`, `test`), `tsconfig.json`,
`tsconfig.build.json`, `eslint.config.mjs`, `.prettierrc.json` (160), `.prettierignore`, `.editorconfig`, `.nvmrc` (26), `.gitignore`,
`.dockerignore`, `vitest.config.ts` (setup file sets a temporary `DATA_DIR`), `Dockerfile` (node 26 slim, build stage, non-root,
`/data`, `HEALTHCHECK` on `/health`), `compose.yaml` (the image, `/data` volume, the mappings file read-only, `.env`), `.env.example`,
`LICENSE` (AGPL-3.0), `CLA.md`, `CONTRIBUTING.md`, `SECURITY.md`, `README.md`, `CLAUDE.md`, `.github/` (`ci.yml`: `check` = format,
lint, typecheck, test, build; `image` = build and start the image, `/health` 200, push `:main` from main and `:X.Y.Z` from tags;
`audit.yml`, `cla.yml`, `dependabot.yml`, `dependabot-automerge.yml`).
`src/`: `main.ts` (load config, open runtime, start server and timer, stop cleanly on SIGTERM), `config.ts` (every setting above),
`log.ts`, `runtime.ts` (`{ config, store, fetch, clock, log }`), `server.ts` (`handle(rt, req): Promise<Response>` over Web
`Request`/`Response`, adapted to `node:http` in `main.ts`), `health.ts`, `db/` (`connection.ts`, `migrations.ts` with `handovers`,
`schema.ts`, `store.ts` with `transaction`, `answers`, `close`), `testing/` (setup, `testRuntime(env?)` with a fake fetch).

**Interfaces:** `loadConfig(env): Config` throws naming each bad variable; `Config = { noticebox: { url; token }, hookSecret,
invoiceNinja: { url; token }, mappingsPath, ntfyUrl?, dataDir, port }`. `handle(rt, req)`: `GET /health` 200 `{status: "ok"}` / 503;
anything else 404 (the hook comes in Task 6).

- [ ] **Step 1: Failing tests:** `config.test.ts` (`"reads every setting"`, `"names every missing or wrong setting at once"`, `"refuses
  a hook secret under 32 characters"`, `"drops a trailing slash"`, `"envExampleListsEveryVariable"`); `server.test.ts` (`"health is 200
  with the database, 503 without"`, `"anything else is 404"`); `db/connection.test.ts` (`"opens bridge.sqlite in WAL at the last
  migration"`).
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** `npm run lint && npm run typecheck && npm test && npm run build` green;
  `docker build .` and the container's `/health` 200 with a test `.env` and an empty mappings file `[]`.
- [ ] **Step 5:** Commit `The service's frame: settings, health, SQLite, image`.

### Task 2: The push

**Files:** `src/push.ts`, `src/push.test.ts`. **Interfaces:** `push(rt, { title, message, click?, priority? })` — POST to
`ntfyUrl` (headers `Title`, `Priority` default 4, `Click`), 10 s; without a URL logged once; a failure logged with its status only,
never thrown.

- [ ] **Step 1: Failing tests:** `"posts title, priority and click"`, `"does nothing without BRIDGE_NTFY_URL"`, `"swallows a failed
  push"`. **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `The push`.

### Task 3: The noticebox and Invoice Ninja clients

**Files:** `src/serviceerror.ts`, `src/noticebox.ts`, `src/invoiceninja.ts`, `src/integrations.test.ts`

**Interfaces:**
- `ServiceError { service: "noticebox" | "invoiceninja"; status: number | null }` — null for a network error or timeout; the
  message names service and status, nothing from a body.
- noticebox: `getSubmission(rt, id): Promise<Submission | null>` (404 → null); `getForm(rt, name): Promise<FormInfo | null>`,
  `FormInfo = { name; states: string[]; fields: { name; type; label }[] }` (label falls back to the name);
  `getFile(rt, submissionId, fileId): Promise<Uint8Array>`. 15 s; files 120 s.
- Invoice Ninja: `findClientByEmail` (`status=active`, then a contact's email equal ignoring case), `createClient(rt, NewClient)`,
  `countryId(rt, iso2): Promise<string | null>` (statics, kept per runtime), `createQuoteDraft(rt, { clientId, privateNotes,
  customValues })` → `{ id; number }` (`line_items: []`, never sent), `updateQuoteNotes(rt, quoteId, notes)`, `attachToQuote(rt,
  quoteId, { name; type; bytes })` (`is_public=0`). 15 s; uploads 120 s.

- [ ] **Step 0:** Read `GET /api/v1/statics` once on Marcel's instance (MCP `apiRequest`) and write the fixture from its real shape.
- [ ] **Step 1: Failing tests:** `"getSubmission sends the bearer token"`, `"getSubmission is null on 404"`, `"getForm reads labels in
  order"`, `"getFile returns the bytes"`, `"findClientByEmail matches ignoring case"`, `"…ignores a client for another address"`,
  `"createClient sends the headers and the contact"`, `"countryId maps DE to its id"`, `"createQuoteDraft makes a draft and never
  sends it"`, `"attachToQuote sends one private document"`, `"a 5xx or a timeout is a ServiceError naming service and status only"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `noticebox and Invoice Ninja clients`.

### Task 4: Mappings

**Files:** `src/mapping.ts`, `src/mapping.test.ts`

**Interfaces:** `mappingSchema` (zod) per the design: `form`, `state`, `client { name, email, street?, houseNumber?, postalCode?,
city?, country? }`, `countries?: Record<string, ISO2>`, `defaultCountry?: ISO2` (used when the country field is empty or not in
`countries`; without it no country is sent), `customFields?: Partial<Record<"custom_value1"|…|"custom_value4", string>>`.
`loadMappings(path): Mapping[]` — reads the file (a list), validates, throws naming the file and each problem; a form twice is an error.
`checkMappings(rt, mappings): Promise<string[]>` — per mapping against `getForm`: the form exists, `state` is one of its states, each
named field exists; returns the problems (logged at start as warnings, never stopping it: noticebox may be down then).

- [ ] **Step 1: Failing tests:** `"reads a valid file"`, `"names each problem of a bad file"`, `"a form twice is refused"`,
  `"checkMappings names an unknown form, state and field"`, `"checkMappings is quiet for a fitting mapping"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement; `main.ts` loads the file (a bad file stops the start) and runs the check.
- [ ] **Step 4:** → PASS. **Step 5:** Commit `Mappings from a file, checked against noticebox`.

### Task 5: The handover and its retries

**Files:** migration `handovers` (in Task 1's list, filled here if Task 1 left it empty), `src/db/handovers.ts`, `src/files.ts`,
`src/notes.ts`, `src/handover.ts`, `src/retry.ts`, their tests

**Interfaces:**
- Table `handovers (submission_id text primary key, form text not null, state text not null check (state in
  ('pending','done','failed','given_up')), client_id, quote_id, quote_number, files_done text not null default '[]', files_left
  integer not null default 0, attempts integer not null default 0, next_try text, error text, received_at, updated_at)`.
- `files.ts`: `forInvoiceNinja({ name, type, bytes })` — `image/png|jpeg|gif|webp|tiff` and `application/pdf` as they are, else
  `<name>.zip` (fflate `zipSync`, level 6); `MAX_BYTES = 100_000 * 1024`.
- `notes.ts`: `quoteNotes(s, form, m, left): string` — exactly:
  ```
  Request from noticebox: <s.url>

  <Label>: <value>                (each unmapped single-line field, form order, empty ones left out)
  <File label>: <n> attached      (each file field with files)
  Not attached (too large or refused), in noticebox until it deletes them: <name>, <name>

  <Label>:                        (each unmapped multi-line value, form order)
  <value>
  ```
- `handover.ts`: `receive(rt, mappings, body): Promise<{ taken: "handover" | "ignored" }>` — only `event: "decided"` whose `form`
  has a mapping and whose `to` is its `state`; inserts the row (an existing one is left as it is) and runs it. `run(rt, mappings,
  id)` — nothing for `done`/`given_up`; `attempts + 1`; (1) `getSubmission` + `getForm` (gone → `the submission is gone from
  noticebox`; a mapped field missing → `the mapping names <field>, which the form no longer has`); (2) client: stored, else
  `findClientByEmail`, else `createClient`; (3) quote: stored, else `createQuoteDraft`; (4) each file not in `files_done`: `getFile`
  → `forInvoiceNinja` → over `MAX_BYTES` or a 422 → left; else attach and record; (5) files left → `updateQuoteNotes`. Errors →
  `failed`, `error = "<step>: <service> answered <status>"` / `"… timed out"`, `next_try` = now + 1, 2, 4 … 60 minutes by attempt;
  one push when it first turns `failed` (`Handover failed: <form>`, its error, click the submission's url); after 24 h since
  `received_at` → `given_up`, one push. `done` with files left: one push naming the count and the quote's number.
- `retry.ts`: `retryDue(rt, mappings): Promise<number>` — runs every `failed` handover whose `next_try` has passed, one at a time;
  `startRetries(rt, mappings): () => void` — every 60 s, skipped while a run is busy.

- [ ] **Step 1: Failing tests** (`handover.test.ts` with a fake noticebox + Invoice Ninja; `retry.test.ts`; `files.test.ts`;
  `notes.test.ts`): `"an accepted submission becomes client, draft quote and documents"` (3dbruckner's mapping: `Anna` / `Beispiel
  Muster`, `Hauptstr. 5`, country via statics, `custom_value1` = the link, notes exactly, `.jpg` as is, `.stl` as `teil.stl.zip`, both
  private); `"a returning customer keeps their client"`; `"the same decision twice makes one quote, each file once"`; `"a retry after a
  failed upload attaches only the rest"`; `"a file too large is left and named"`; `"a refused file is left, the rest goes on"`;
  `"other decisions, forms without a mapping and arrivals are ignored"`; `"a sparse submission still makes a quote"`; `"a mapping
  that no longer fits fails naming the field"`; `"a submission gone fails with that reason"`; `"nothing personal is stored or
  logged"`; `retry.test.ts`: `"a failed handover is retried when due, not before"`, `"backoff doubles to 60 minutes"`, `"after 24
  hours it is given up with one push"`, `"one push when it first fails, none for later failures"`; `notes.test.ts` `"notes follow
  the form's order and labels"`; `files.test.ts` `"pictures and PDFs as they are"`, `"a model file zipped under its name"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement; `main.ts` starts the retries. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `The handover, retried by itself`.

### Task 6: The hook

**Files:** `src/hook.ts`, `src/hook.test.ts`, `src/server.ts`

**Interfaces:** `POST /hooks/noticebox/<secret>` — 404 when the secret is wrong (`timingSafeEqual` over SHA-256 of both); 400 for
non-JSON or a body over 16 KB; else 200 `{ taken }`. The handover runs before the answer; an error inside is logged and still 200.

- [ ] **Step 1: Failing tests:** wrong secret 404 and nothing runs; a handover decision 200 and it ran; an arrival 200 ignored; a
  broken body 400; Invoice Ninja down still 200 and the row `failed`; the secret never in a log line.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** Commit `The noticebox hook`.

### Task 7: The docs site

**Files:** `mkdocs.yml` (Material, the conventions' theme with its own colour and icon, `site_url:
https://noticebox.github.io/invoiceninja-bridge/`), `requirements-docs.txt`, `.github/workflows/docs.yml`, `docs/index.md`,
`docs/setup.md` (compose, `.env`, the mappings file, the noticebox webhook `{type: "webhook", url: "<bridge>/hooks/noticebox/<secret>",
on: ["decided"]}`, the Invoice Ninja token and upload limits), `docs/mapping.md`, `docs/configuration.md`, `docs/values.md` (V1
content leaves noticebox only after a person's decision, through a token they gave; V2 drafts only; V3 nothing kept but ids; each
with **Rules out:**), `docs/roadmap.yml` + page, `docs/adr/0001-a-bridge-not-a-noticebox-feature.md`, `0002-drafts-only.md`,
`0003-files-zipped-for-invoice-ninja.md`, `0004-no-sign-in-no-mcp.md`; `README.md` short; `CLAUDE.md`.

- [ ] **Step 1:** Write; `mkdocs build --strict`; `npm run format:check`.
- [ ] **Step 2:** Full run: lint, typecheck, test, build, the image's `/health`.
- [ ] **Step 3:** Commit `Docs site, values, roadmap, ADRs`.

### Task 8 (after Marcel's merge): Deploy and test end to end

- [ ] GitHub: ruleset `main` requires `check`; Pages; Dependabot automerge; CLA. Tag `v0.1.0` (CI publishes the image).
- [ ] Tokens: Invoice Ninja API token `invoiceninja-bridge`; noticebox `read` token; the hook secret. 1Password "Business Admin" and
  the gewerbe vault.
- [ ] noticebox/stacks: `invoiceninja-bridge/compose.yaml` and `mappings.json` (3dbruckner's). Business ansible (gewerbe): the stack
  and its `.env` beside noticebox, no public host needed (noticebox posts to it on the server's own network); noticebox's env
  `HOOK_INVOICENINJA_BRIDGE`; Invoice Ninja's PHP limits to 100M (business stacks). PRs; Marcel merges; deploy gewerbe-1 from main.
- [ ] noticebox (needs 0.22.0 deployed): the form's states `new`, `angenommen` (closed), `answered` (closed), `test`, and the webhook
  with `on: ["decided"]`.
- [ ] End to end: one real request through 3dbruckner.de's form from Marcel's address with a small STL and a photo; accepted in the
  inbox → the existing client, a draft quote with notes, both files (the STL zipped); the bridge's log says `done`. Marcel deletes
  the draft (its number stays used).
