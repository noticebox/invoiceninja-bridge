// The data layer's connection (conventions: architecture/data-layer, stacks/sqlite): only src/db/ holds better-sqlite3 and kysely; the
// rest calls the store's functions (store.ts). kysely builds the queries and better-sqlite3 runs them synchronously.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, type Compilable } from "kysely";
import { MIGRATIONS } from "./migrations.ts";
import type { DB } from "./schema.ts";

/** What the queries run on: the query builder, and synchronous all/first/run of what it builds. */
export type Exec = {
  q: Kysely<DB>;
  all<O>(query: Compilable<O>): O[];
  first<O>(query: Compilable<O>): O | undefined;
  /** Runs a write; returns how many rows it changed. */
  run(query: Compilable<unknown>): number;
};

export type Connection = { exec: Exec; raw: Database.Database };

/** Brings `raw` to the last migration, each in a transaction with its user_version. */
function migrate(raw: Database.Database): void {
  const at = raw.pragma("user_version", { simple: true }) as number;
  for (const [i, m] of MIGRATIONS.entries()) {
    if (i < at) continue;
    raw.transaction(() => {
      raw.exec(m.sql);
      raw.pragma(`user_version = ${i + 1}`);
    })();
  }
}

/** Opens DATA_DIR/bridge.sqlite (creating the directory), in WAL mode, and brings it to the last migration. */
export function openDatabase(dataDir: string): Connection {
  mkdirSync(dataDir, { recursive: true });
  const raw = new Database(join(dataDir, "bridge.sqlite"));
  try {
    raw.pragma("journal_mode = WAL");
    raw.pragma("busy_timeout = 5000");
    migrate(raw);
  } catch (e) {
    raw.close();
    throw e;
  }
  const q = new Kysely<DB>({ dialect: new SqliteDialect({ database: raw }) });
  const exec: Exec = {
    q,
    all: (query) => {
      const c = query.compile();
      return raw.prepare(c.sql).all(...c.parameters) as never;
    },
    first: (query) => {
      const c = query.compile();
      return raw.prepare(c.sql).get(...c.parameters) as never;
    },
    run: (query) => {
      const c = query.compile();
      return raw.prepare(c.sql).run(...c.parameters).changes;
    },
  };
  return { exec, raw };
}

/** Whether the database answers a query: false once it is closed or broken. */
export function databaseAnswers(raw: Database.Database): boolean {
  try {
    return raw.prepare("select 1 as one").get() !== undefined;
  } catch {
    return false;
  }
}
