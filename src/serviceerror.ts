// What a call to noticebox or Invoice Ninja that didn't work becomes: which service, and its status (null for a network error or a
// timeout). The message is only those two, never anything from the answer's body, which may echo a person's data; it is what the
// handover row's error and the push say.
export type Service = "noticebox" | "invoiceninja";

export class ServiceError extends Error {
  readonly service: Service;
  readonly status: number | null;
  constructor(service: Service, status: number | null, reason: "answered" | "timed out" | "unreachable" = "answered") {
    super(status === null ? `${service} ${reason === "answered" ? "unreachable" : reason}` : `${service} answered ${status}`);
    this.service = service;
    this.status = status;
  }
}

/** `fetch`, with a failure turned into a ServiceError; `ok` statuses besides 2xx (e.g. 404) are passed through. */
export async function call(
  rt: { fetch: typeof fetch },
  service: Service,
  url: string,
  init: RequestInit & { timeoutMs: number },
  ok: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<Response> {
  let r: Response;
  try {
    r = await rt.fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs) });
  } catch (e) {
    throw new ServiceError(service, null, e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable");
  }
  if (!ok(r.status)) throw new ServiceError(service, r.status);
  return r;
}
