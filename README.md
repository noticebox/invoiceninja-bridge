# invoiceninja-bridge

When you accept a [noticebox](https://github.com/noticebox/noticebox) submission (you move it to a state such as "accepted"), the
bridge puts it into [Invoice Ninja](https://invoiceninja.com): the client (found by email, or made with the address), a **draft**
quote with the submission's fields in its notes and chosen ones in custom fields, and every file as a private document of the quote.
It never sends anything, never writes to noticebox and keeps no personal data.

```sh
curl -O https://raw.githubusercontent.com/noticebox/invoiceninja-bridge/main/compose.yaml
curl -o .env https://raw.githubusercontent.com/noticebox/invoiceninja-bridge/main/.env.example   # fill it in
echo '[]' > mappings.json                                                                         # one mapping per form
docker compose up -d
```

Setup, the mapping and every setting: [noticebox.github.io/invoiceninja-bridge](https://noticebox.github.io/invoiceninja-bridge/).
AGPL-3.0-only.
