// Vitest's setupFiles: every test file gets a temporary directory as DATA_DIR, set again before each test and removed at the end, so no
// test reads or writes a real data directory (conventions: code/tests-temp-dirs).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "bridge-test-"));
process.env.DATA_DIR = dir;
beforeEach(() => {
  process.env.DATA_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
