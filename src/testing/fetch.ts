// A fake fetch for tests: records every call (url, method, headers, body as text or FormData) and answers by a handler; no test
// reaches the network.
export type Call = { url: string; method: string; headers: Record<string, string>; body: string | FormData | null };

export function fakeFetch(answer: (c: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const raw = init?.body;
    const body = raw === undefined || raw === null ? null : raw instanceof FormData ? raw : String(raw);
    const c: Call = { url: String(input), method: init?.method ?? "GET", headers, body };
    calls.push(c);
    return answer(c);
  }) as typeof fetch;
  return { fetch: f, calls };
}
