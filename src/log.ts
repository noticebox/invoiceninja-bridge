// The service's log: pino, JSON on stdout, English. Never a token, the hook secret, an email address, a field's value or a file's name.
// BRIDGE_LOG_LEVEL (pino's levels: debug, info, warn, error, silent) defaults to info.
import pino from "pino";

export const log = pino({ base: { app: "invoiceninja-bridge" }, level: process.env.BRIDGE_LOG_LEVEL || "info" });
