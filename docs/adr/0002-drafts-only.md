# 0002: Drafts only

- Status: accepted
- Date: 2026-11-20

## Context and Problem Statement

The bridge could do more in Invoice Ninja than make a draft: add lines from products, send the quote, email the client.

## Considered Options

1. A draft quote without lines; the person prices and sends it.
2. A quote with lines filled from the submission (a product per field value), still a draft.
3. A quote sent to the customer at once.

## Decision Outcome

Option 1. What a request costs is the person's judgement, and what reaches the customer is the person's to send (V2). A request rarely
maps to products one to one; a guessed line is a line to correct.

### Consequences

- Good: nothing reaches a customer by the bridge; a wrong handover is a draft to delete.
- Bad: the person still prices every quote by hand.
