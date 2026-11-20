# 0001: A bridge of its own, not a noticebox feature

- Status: accepted
- Date: 2026-11-20

## Context and Problem Statement

3dbruckner.de takes order requests with a noticebox form and writes quotes in Invoice Ninja. Once a request is accepted, its text, the
customer's address and the files were typed into Invoice Ninja by hand. noticebox's V1 says personal data leaves only by a person's
hand and rules out a token or API call that pushes submission content out of noticebox.

## Considered Options

1. noticebox pushes an accepted submission to Invoice Ninja itself.
2. A service of 3D Bruckner's own that also does printing (`orders`), with the handover as one of its parts.
3. A separate, generic bridge in the noticebox org: noticebox announces the decision (its ADR 0008, 0.22.0), the bridge reads the
   submission with a token the person gave it and writes to Invoice Ninja.

## Decision Outcome

Option 3. Option 1 breaks noticebox's V1 and would put Invoice Ninja's API into a general inbox. Option 2 ties a generic step to one
business: nothing in the handover is about printing. The bridge is configured per form ([mapping](../mapping.md)) and open source like
noticebox, so anyone who quotes in Invoice Ninja for requests from a noticebox form can run it.

### Consequences

- Good: noticebox stays an inbox; the person's decision is what starts a read by their token (noticebox's V1, this project's V1).
- Good: the order flow's printing part (3D-Bruckner/orders) talks only to Invoice Ninja.
- Bad: one more container to run, next to noticebox.
