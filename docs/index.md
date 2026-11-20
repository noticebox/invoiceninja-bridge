# invoiceninja-bridge

When you accept a [noticebox](https://noticebox.github.io/noticebox/) submission, the bridge puts it into
[Invoice Ninja](https://invoiceninja.com) so you don't type it twice: the client, a **draft** quote with what the person wrote, and
the files they sent. You price and send the quote in Invoice Ninja as you always do.

```mermaid
sequenceDiagram
    actor P as You
    participant N as noticebox
    participant B as invoiceninja-bridge
    participant I as Invoice Ninja
    P->>N: move a submission to "accepted"
    N->>B: webhook: decided (ids, states, link; no content)
    B->>N: read the submission, its form and its files (read token)
    B->>I: the client, found by email or made with the address
    B->>I: a draft quote: fields in its notes and custom fields
    B->>I: every file as a private document
```

## What it does

- **Only what you accepted.** A submission is handed over when you move it to the state its form's [mapping](mapping.md) names,
  and not before. Spam and declined requests never reach your bookkeeping, and noticebox deletes them as it always does.
- **The client:** found by the submission's email (case ignored), so a returning customer keeps their client. A new one gets the name
  (first word as the first name) and the address. For an existing client, the address as given is noted on the quote.
- **The quote:** a draft without lines, for you to price. The fields the mapping names go into the quote's custom fields; every other
  field goes into its private notes under the form's own label, in the form's order, with a link back to the submission.
- **The files:** each attached to the quote as a private document, not shown in the client portal. Pictures and PDFs go as they are,
  anything else (an STL, a 3MF, a STEP) zipped, because Invoice Ninja doesn't take model files ([ADR 0003](adr/0003-files-zipped-for-invoice-ninja.md)).
  A file that is too large or refused stays in noticebox and is named in the notes.
- **Never lost, never twice.** If noticebox or Invoice Ninja is down, the bridge tries again by itself after 1, 2, 4 … up to 60
  minutes for 24 hours, and pushes to you (ntfy) when a handover first fails and when it gives up. A second post or a retry never makes
  a second client, quote or document.

## What it never does

It never sends a quote or a mail, never writes to noticebox, and keeps nothing of a submission: one row of ids per handover. There is
no sign-in and nothing to click: it is set up with a [settings file](configuration.md) and a [mapping](mapping.md), and runs next to
noticebox ([Setup](setup.md)).
