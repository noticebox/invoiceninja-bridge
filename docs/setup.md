# Setup

The bridge runs as one container next to noticebox. It needs no public address: noticebox posts to it, and it calls out to noticebox,
Invoice Ninja and (optionally) ntfy.

## 1. Tokens

- **noticebox:** a `read` API token (`nbx_…`) of the person who accepts the submissions, made in noticebox's settings or with its MCP
  tool `create_api_token`. The bridge only reads with it; noticebox records nothing in its name.
- **Invoice Ninja:** an API token (*Settings → Account Management → API Tokens*) of a user who may view and create clients and quotes.
- **The hook's secret:** 32 or more random characters, `openssl rand -hex 32`.

## 2. The files

Next to each other in one folder: `compose.yaml` from this repository, `.env` from
[`.env.example`](https://github.com/noticebox/invoiceninja-bridge/blob/main/.env.example) filled in (`chmod 600`), and
`mappings.json` with a [mapping](mapping.md) per form. Every setting: [Configuration](configuration.md).

```sh
docker compose up -d
docker compose logs invoiceninja-bridge   # "mappings read", and a warning for anything that doesn't fit its form
```

A bad `.env` or `mappings.json` stops the start, naming each problem. Whether the mappings fit the forms as noticebox has them is
checked at start too and logged, never stopping the start (noticebox may be down at that moment).

## 3. The webhook in noticebox

noticebox ≥ 0.22.0 can post a decision to a webhook. Add a target to the form, with the secret as a variable in noticebox's
environment:

```json
"notify": [
  { "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}" },
  { "type": "webhook", "url": "${INVOICENINJA_BRIDGE_HOOK}", "on": ["decided"] }
]
```

with `INVOICENINJA_BRIDGE_HOOK=http://invoiceninja-bridge:8080/hooks/noticebox/<secret>` when both containers share a Docker network,
or the bridge's own URL otherwise. `on: ["decided"]` sends decisions only: the bridge has nothing to do with an arrival. The form needs
the state the mapping names (`accepted`, say), closed, so the inbox shows the request as handled.

## 4. Invoice Ninja's upload limit

A file goes into Invoice Ninja as one upload, and Invoice Ninja's PHP takes 10 MB by default (`upload_max_filesize`,
`post_max_size`); Invoice Ninja itself takes up to 100 MB. Raise PHP's limits to `100M` if requests come with large files: a file over
the limit is left in noticebox and named in the quote's notes, the rest is attached. Adding `stl,3mf` to `ADDITIONAL_UPLOAD_EXTENSIONS`
does not help: Invoice Ninja checks a file by its content, and the bridge zips model files for that reason ([ADR 0003](adr/0003-files-zipped-for-invoice-ninja.md)).

## 5. Try it

Post a submission to the form, move it to the mapped state, and look in Invoice Ninja: the client, a draft quote with the notes, the
files under its documents. The bridge's log says `handover: done` with the quote's number. If it says `handover: failed`, the error
names the step and the service's answer (`client: invoiceninja answered 401`: the token); it is tried again by itself.

## Upgrading

Change the image's tag in `compose.yaml` and `docker compose up -d`. `bridge.sqlite` is migrated at start.
