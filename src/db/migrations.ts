// bridge.sqlite's schema, in order, run at open by migrate() (connection.ts) and recorded in PRAGMA user_version. A migration that has
// shipped is never edited: a change to the schema is a new migration at the end of the list.
export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    // One row per submission handed over: noticebox's id, Invoice Ninja's ids, which of its files are attached (noticebox file ids),
    // how many were left in noticebox, and how the last try went. No field of the submission, no name, address or file name (design B3).
    // client_existed: 1 when the client was found by email, so the quote notes the address given. given_up: failed for 24 hours, or the
    // submission wasn't in the handover state; no more tries.
    name: "handovers",
    sql: `
      create table handovers (
        submission_id text primary key,
        form text not null,
        state text not null check (state in ('pending', 'done', 'failed', 'given_up')),
        client_id text,
        client_existed integer not null default 0,
        quote_id text,
        quote_number text,
        files_done text not null default '[]',
        files_left integer not null default 0,
        attempts integer not null default 0,
        next_try text,
        error text,
        received_at text not null,
        updated_at text not null
      );
      create index handovers_due on handovers (state, next_try);
    `,
  },
];
