# What the bridge stands for

invoiceninja-bridge moves a request from noticebox into Invoice Ninja once a person has decided to take it. This page says what it will
stay, whoever runs it. A change to it is judged against these points, and a review names the one it touches ("this breaks V1"). It
follows [noticebox's values](https://noticebox.github.io/noticebox/values/), from which it takes the first.

## V1. A person's decision starts it {#v1}

A submission's content leaves noticebox only after a person has moved it to the state that means "we take it", and only through a
token that person gave the bridge. noticebox's webhook says that a decision was made, never what the submission says; the bridge reads
the rest itself.

**Rules out:** handing a submission over on its arrival; content in the webhook; a token with more than `read` on noticebox; the bridge
writing to noticebox.

ADRs: [0001](adr/0001-a-bridge-not-a-noticebox-feature.md).

## V2. Drafts only {#v2}

The bridge prepares; the person who accepted the request prices and sends. It makes a client and a draft quote, and nothing that
reaches the customer.

**Rules out:** sending a quote, an invoice or a mail; marking anything sent or approved; filling in prices.

ADRs: [0002](adr/0002-drafts-only.md).

## V3. Nothing kept but ids {#v3}

What a person sent lives in noticebox until it deletes it, and in Invoice Ninja once it is taken. The bridge keeps one row per handover
with ids, counts and a state, and logs nothing of the submission.

**Rules out:** storing a field, a name, an address, an email or a file name; logging them; a cache of submissions or files.

ADRs: [0004](adr/0004-no-sign-in-no-mcp.md).

## Changing this page

Points keep their numbers, so that reviews and issues citing them stay right. A change needs the maintainer's approval and says why in
its pull request. Weakening one of these is a change to what the bridge is.
