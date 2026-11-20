import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, VARIABLES } from "./config.ts";

const SECRET = "h".repeat(32);
const ENV = {
  BRIDGE_NOTICEBOX_URL: "https://inbox.example.org/",
  BRIDGE_NOTICEBOX_TOKEN: "nbx_read",
  BRIDGE_HOOK_SECRET: SECRET,
  BRIDGE_INVOICENINJA_URL: "https://invoices.example.org",
  BRIDGE_INVOICENINJA_TOKEN: "in-token",
};

describe("loadConfig", () => {
  it("reads every setting, with the defaults for what is left out", () => {
    expect(loadConfig(ENV)).toEqual({
      noticebox: { url: "https://inbox.example.org", token: "nbx_read" },
      hookSecret: SECRET,
      invoiceNinja: { url: "https://invoices.example.org", token: "in-token" },
      mappingsPath: "/config/mappings.json",
      dataDir: "/data",
      port: 8080,
    });
    const all = loadConfig({ ...ENV, BRIDGE_MAPPINGS: "/m.json", BRIDGE_NTFY_URL: "https://ntfy.sh/topic", DATA_DIR: "/srv/b", PORT: "9000" });
    expect(all).toMatchObject({ mappingsPath: "/m.json", ntfyUrl: "https://ntfy.sh/topic", dataDir: "/srv/b", port: 9000 });
  });

  it("names every missing or wrong setting at once", () => {
    let message = "";
    try {
      loadConfig({ BRIDGE_NOTICEBOX_URL: "inbox", BRIDGE_INVOICENINJA_URL: "ftp://x", PORT: "zero" });
    } catch (e) {
      message = (e as Error).message;
    }
    for (const name of ["BRIDGE_NOTICEBOX_URL", "BRIDGE_NOTICEBOX_TOKEN", "BRIDGE_HOOK_SECRET", "BRIDGE_INVOICENINJA_URL", "BRIDGE_INVOICENINJA_TOKEN", "PORT"])
      expect(message).toContain(name);
  });

  it("refuses a hook secret under 32 characters", () => {
    expect(() => loadConfig({ ...ENV, BRIDGE_HOOK_SECRET: "h".repeat(31) })).toThrow(/BRIDGE_HOOK_SECRET.*32/);
  });

  it("treats an empty value as unset", () => {
    expect(loadConfig({ ...ENV, BRIDGE_NTFY_URL: "", BRIDGE_MAPPINGS: " " }).ntfyUrl).toBeUndefined();
    expect(loadConfig({ ...ENV, BRIDGE_MAPPINGS: "" }).mappingsPath).toBe("/config/mappings.json");
  });
});

/** The variables .env.example sets or shows commented out (NAME=). */
const inEnvFile = (text: string): string[] => [...text.matchAll(/^#? ?([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!);

/** The variables docs/configuration.md's table names in its first column. */
const inDocsTable = (text: string): string[] =>
  text
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .flatMap((l) => [...l.split("|")[1]!.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1]!));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("the settings' three lists", () => {
  const root = join(import.meta.dirname, "..");
  it("envExampleListsEveryVariable: .env.example and docs/configuration.md name exactly the variables the service reads", () => {
    const known = Object.keys(VARIABLES).sort();
    expect([...new Set(inEnvFile(readFileSync(join(root, ".env.example"), "utf8")))].sort()).toEqual(known);
    expect([...new Set(inDocsTable(readFileSync(join(root, "docs", "configuration.md"), "utf8")))].sort()).toEqual(known);
    const read = new Set(
      sources(join(root, "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!)),
    );
    for (const name of read) expect(known, name).toContain(name);
  });
});
