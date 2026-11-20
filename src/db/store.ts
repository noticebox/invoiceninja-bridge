// The Store: every query the bridge makes, bound to one connection. Domain code gets it as rt.store and never sees kysely or
// better-sqlite3.
import { databaseAnswers, openDatabase } from "./connection.ts";
import { handoverQueries } from "./handovers.ts";

export type Store = ReturnType<typeof handoverQueries> & {
  /** Runs `fn` in one transaction (a savepoint when nested): all its writes or none. */
  transaction<T>(fn: () => T): T;
  /** Whether the database answers: false once it is closed or broken. */
  answers(): boolean;
  close(): void;
};

/** Opens DATA_DIR/bridge.sqlite, migrated to the last schema, and the queries on it. */
export function openStore(dataDir: string): Store {
  const { exec, raw } = openDatabase(dataDir);
  return {
    ...handoverQueries(exec),
    transaction: (fn) => raw.transaction(fn)(),
    answers: () => databaseAnswers(raw),
    close: () => raw.close(),
  };
}
