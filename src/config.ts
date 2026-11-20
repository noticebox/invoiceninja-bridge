// The bridge's settings, read once from the environment at start. A bad or missing setting stops the start with one message naming
// every such variable. VARIABLES names every variable the service and its image read, these and the ones read elsewhere (the log, Node,
// the image's entrypoint); .env.example and docs/configuration.md list exactly those (envExampleListsEveryVariable in config.test.ts),
// so the three change together.
import * as z from "zod";

export type Config = {
  /** BRIDGE_NOTICEBOX_URL and BRIDGE_NOTICEBOX_TOKEN: where noticebox is, and a `read` token of the person who accepts submissions. */
  noticebox: { url: string; token: string };
  /** BRIDGE_HOOK_SECRET: the last part of the hook's path, /hooks/noticebox/<secret>; noticebox's posts are unsigned. */
  hookSecret: string;
  /** BRIDGE_INVOICENINJA_URL and BRIDGE_INVOICENINJA_TOKEN: Invoice Ninja v5 and an API token of a user who may make clients and quotes. */
  invoiceNinja: { url: string; token: string };
  /** BRIDGE_MAPPINGS: the mappings file (a JSON list, one per form). */
  mappingsPath: string;
  /** BRIDGE_NTFY_URL: an ntfy topic for the pushes about failed handovers; without it, only the log says so. */
  ntfyUrl?: string;
  /** DATA_DIR: bridge.sqlite. */
  dataDir: string;
  /** PORT: what the server listens on. */
  port: number;
};

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const url = (name: string) => z.preprocess(blank, z.url({ protocol: /^https?$/, error: `${name} must be an http(s) URL` }));
const text = (name: string) => z.preprocess(blank, z.string({ error: `${name} is required` }).trim());
const optional = z.preprocess(blank, z.string().trim().optional());

const schema = z.object({
  BRIDGE_NOTICEBOX_URL: url("BRIDGE_NOTICEBOX_URL"),
  BRIDGE_NOTICEBOX_TOKEN: text("BRIDGE_NOTICEBOX_TOKEN"),
  BRIDGE_HOOK_SECRET: z.preprocess(
    blank,
    z.string({ error: "BRIDGE_HOOK_SECRET must be at least 32 characters" }).min(32, "BRIDGE_HOOK_SECRET must be at least 32 characters"),
  ),
  BRIDGE_INVOICENINJA_URL: url("BRIDGE_INVOICENINJA_URL"),
  BRIDGE_INVOICENINJA_TOKEN: text("BRIDGE_INVOICENINJA_TOKEN"),
  BRIDGE_MAPPINGS: optional,
  BRIDGE_NTFY_URL: z.preprocess(blank, z.url({ protocol: /^https?$/, error: "BRIDGE_NTFY_URL must be an http(s) URL" }).optional()),
  DATA_DIR: optional,
  PORT: z.preprocess(
    blank,
    z.coerce.number({ error: "PORT must be a port number" }).int("PORT must be a port number").min(1, "PORT must be a port number").max(65535).optional(),
  ),
});

/** Who reads a variable that isn't loadConfig's own. */
type ReadBy = "src/log.ts" | "Node" | "docker-entrypoint.mjs";

/** Every variable the bridge reads: loadConfig's (the schema's keys) and the rest, each with who reads it. */
export const VARIABLES: Record<string, "loadConfig" | ReadBy> = {
  ...(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, "loadConfig"])) as Record<string, "loadConfig">),
  BRIDGE_LOG_LEVEL: "src/log.ts",
  TZ: "Node",
  NODE_EXTRA_CA_CERTS: "Node",
  PUID: "docker-entrypoint.mjs",
  PGID: "docker-entrypoint.mjs",
};

const trim = (u: string) => u.replace(/\/+$/, "");

/** The settings from `env`; throws naming every variable that is wrong. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const e = parsed.data;
  const config: Config = {
    noticebox: { url: trim(e.BRIDGE_NOTICEBOX_URL), token: e.BRIDGE_NOTICEBOX_TOKEN },
    hookSecret: e.BRIDGE_HOOK_SECRET,
    invoiceNinja: { url: trim(e.BRIDGE_INVOICENINJA_URL), token: e.BRIDGE_INVOICENINJA_TOKEN },
    mappingsPath: e.BRIDGE_MAPPINGS ?? "/config/mappings.json",
    dataDir: e.DATA_DIR ?? "/data",
    port: e.PORT ?? 8080,
  };
  if (e.BRIDGE_NTFY_URL) config.ntfyUrl = e.BRIDGE_NTFY_URL;
  return config;
}
