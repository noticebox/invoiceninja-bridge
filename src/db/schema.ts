// The tables of bridge.sqlite as kysely sees them, one entry per table that migrations.ts creates. Rows come out of the store as
// Selectable<…> (snake_case, as stored); the domain turns them into its own types.
export interface HandoversTable {
  submission_id: string;
  form: string;
  state: "pending" | "done" | "failed" | "given_up";
  client_id: string | null;
  quote_id: string | null;
  quote_number: string | null;
  /** A JSON list of noticebox file ids. */
  files_done: string;
  files_left: number;
  attempts: number;
  next_try: string | null;
  error: string | null;
  received_at: string;
  updated_at: string;
}

export interface DB {
  handovers: HandoversTable;
}
