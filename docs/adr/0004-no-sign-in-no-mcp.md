# 0004: No sign-in, no MCP, no API

- Status: accepted
- Date: 2026-11-20

## Context and Problem Statement

The engineering conventions the bridge follows put an MCP server first and give each app sign-in, a REST API and tokens (Marceltov's
next-app-kit). The bridge's first plan did too: mappings edited over MCP, failed handovers retried with a tool. Its maintainer's
answer: it is a bridge; it takes data from one side and puts it on the other.

## Considered Options

1. A Next.js app on next-app-kit: sign-in for MCP's OAuth, MCP and REST for mappings and retries.
2. A plain Node service: a webhook and a health check, mappings in a file, retries by itself, failures pushed.

## Decision Outcome

Option 2, a deliberate exception to the conventions' MCP first: nothing in the bridge is for a person to operate. Mappings change
rarely and live in a file next to `compose.yaml`; a failure is retried for 24 hours and pushed (ntfy) when it starts and when it is
given up, which is what a person would have done with a retry tool.

### Consequences

- Good: two routes, no accounts, no session, no token store; less to secure and keep up to date.
- Good: nothing in the bridge holds personal data (V3); it has no screens that could show any.
- Bad: what happened is in the log and the pushes only; a handover given up is handed over by hand.
