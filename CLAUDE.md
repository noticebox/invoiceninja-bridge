# CLAUDE.md

invoiceninja-bridge: an accepted noticebox submission becomes a draft quote in Invoice Ninja (client, notes, files). A plain
Node/TypeScript service: no framework, no sign-in, no MCP, no API (design B5, ADR 0004). Follows Marceltov/engineering-conventions;
the rules here win where they differ.

## Commands

- `npm test` (Vitest; one file: `npm test -- src/handover.test.ts`), `npm run lint`, `npm run typecheck`, `npm run format` /
  `format:check` (Prettier, 160), `npm run build` (tsc to `dist/`), `npm run dev` (needs the settings of `.env.example`).
- CI (`.github/workflows/ci.yml`): `check` on every push and pull request; `image` builds, starts and pushes
  `ghcr.io/noticebox/invoiceninja-bridge` (`:main` from main, `:X.Y.Z` from a tag `vX.Y.Z` that matches package.json).
- Release: bump `version` in package.json, merge, `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`.

## Rules

- Never writes to noticebox; only ever drafts in Invoice Ninja, never sent.
- No personal data stored: a handover row holds ids, a state and an error naming no person, address or file. Logs never hold a
  token, the hook secret, an address, a field's value or a file name.
- Only `src/db/` touches kysely and better-sqlite3 (ESLint); migrations are append-only.
- `src/config.ts` (`VARIABLES`), `.env.example` and `docs/configuration.md` list the same variables (`config.test.ts`).
- Tests never reach the network: the test runtime's fetch throws unless a test replaces it; data in a temporary `DATA_DIR`.
- Changes are judged against `docs/values.md`; decisions go to `docs/adr/`. The design and plan: `docs/superpowers/`.
- Merge only when the maintainer says so; Dependabot's patch and minor bumps merge themselves once `check` is green.
