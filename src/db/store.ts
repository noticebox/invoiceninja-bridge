// The Store: every query the bridge makes, bound to one connection. Domain code gets it as rt.store and never sees kysely or
// better-sqlite3.
import { databaseAnswers, openDatabase } from "./connection.ts";

export type Store = {
  /** Runs `fn` in one transaction (a savepoint when nested): all its writes or none. */
  transaction<T>(fn: () => T): T;
  /** Whether the database answers: false once it is closed or broken. */
  answers(): boolean;
  close(): void;
};

/** Opens DATA_DIR/bridge.sqlite, migrated to the last schema, and the queries on it. */
export function openStore(dataDir: string): Store {
  const { raw } = openDatabase(dataDir);
  return {
    transaction: (fn) => raw.transaction(fn)(),
    answers: () => databaseAnswers(raw),
    close: () => raw.close(),
  };
}
