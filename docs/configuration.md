# Configuration

Every setting is an environment variable, in one `.env` file next to `compose.yaml`: a filled-in copy of
[`.env.example`](https://github.com/noticebox/invoiceninja-bridge/blob/main/.env.example), `chmod 600`. A missing or wrong required
setting stops the start with one message naming each. An empty value counts as unset. The mappings are a file of their own
([Mapping](mapping.md)).

| Variable                    | Required | Default                 | What it does                                                                                                                                                      |
| --------------------------- | -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRIDGE_NOTICEBOX_URL`      | yes      |                         | Where noticebox is, such as `https://inbox.example.org`.                                                                                                          |
| `BRIDGE_NOTICEBOX_TOKEN`    | yes      |                         | A `read` API token (`nbx_…`) of the person who accepts the submissions. The bridge only reads.                                                                    |
| `BRIDGE_HOOK_SECRET`        | yes      |                         | 32 or more random characters: noticebox posts to `<bridge>/hooks/noticebox/<secret>`. Its posts are unsigned, so the secret in the path is what keeps others out. |
| `BRIDGE_INVOICENINJA_URL`   | yes      |                         | Invoice Ninja v5, such as `https://invoices.example.org`.                                                                                                         |
| `BRIDGE_INVOICENINJA_TOKEN` | yes      |                         | An API token of an Invoice Ninja user who may view and create clients and quotes. The bridge only ever writes drafts.                                             |
| `BRIDGE_MAPPINGS`           |          | `/config/mappings.json` | The mappings file inside the container. A bad file stops the start.                                                                                               |
| `BRIDGE_NTFY_URL`           |          | none: the log only      | An ntfy topic: a push when a handover fails, and when it is given up after 24 hours.                                                                              |
| `BRIDGE_LOG_LEVEL`          |          | `info`                  | `debug`, `info`, `warn`, `error` or `silent`. The log is JSON on stdout and never holds a token, the secret, an address or a field's value.                       |
| `DATA_DIR`                  |          | `/data`                 | Where `bridge.sqlite` lives: one row per handover, ids only.                                                                                                      |
| `PORT`                      |          | `8080`                  | The port the server listens on.                                                                                                                                   |
| `TZ`                        |          | `UTC`                   | The time zone of the log's dates.                                                                                                                                 |
| `PUID`, `PGID`              |          | the owner of `/data`    | Who owns `/data` inside the container (1000 if the folder belongs to root).                                                                                       |
| `NODE_EXTRA_CA_CERTS`       |          |                         | A mounted PEM file of extra CA certificates, for a noticebox or Invoice Ninja behind your own CA.                                                                 |
