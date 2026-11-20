import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./connection.ts";
import { MIGRATIONS } from "./migrations.ts";

describe("openDatabase", () => {
  it("opens bridge.sqlite in WAL mode at the last migration, and again without running one twice", () => {
    const dir = mkdtempSync(join(process.env.DATA_DIR!, "db-"));
    openDatabase(dir).raw.close();
    const { raw } = openDatabase(dir);
    try {
      expect(raw.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(raw.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
      expect(raw.prepare("select name from sqlite_master where type = 'table' order by name").pluck().all()).toEqual(["handovers"]);
    } finally {
      raw.close();
    }
  });
});
