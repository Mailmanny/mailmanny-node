import type { MailmannyError, MailmannyOptions, Result } from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_BASE_URL = "https://www.mailmanny.com";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequest = {
  method: Method;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

const env = (name: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name]?.trim();
  return value ? value : undefined;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const failure = (name: MailmannyError["name"], message: string, statusCode: number | null = null, details?: Record<string, unknown>) =>
  ({ data: null, error: { name, message, statusCode, ...(details ? { details } : {}) } }) as const;

/** "https://www.mailmanny.com", "https://www.mailmanny.com/api/v1/" → "https://www.mailmanny.com/api/v1". */
export function apiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(
    private readonly apiKey: string,
    options: MailmannyOptions,
  ) {
    this.baseUrl = apiBase(options.baseUrl ?? env("MAILMANNY_BASE_URL") ?? DEFAULT_BASE_URL);
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") throw new Error("mailmanny needs fetch (Node.js 18+). Pass `fetch` in the options on older runtimes.");
    this.fetchImpl = f.bind(globalThis);
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.timeout = options.timeout ?? 30_000;
    this.extraHeaders = options.headers ?? {};
  }

  async request<T>(req: HttpRequest): Promise<Result<T>> {
    const url = new URL(`${this.baseUrl}${req.path}`);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      ...this.extraHeaders,
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `mailmanny-node/${VERSION}`,
    };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;
    const body = req.body === undefined ? undefined : JSON.stringify(req.body);
    const retryable = req.method !== "POST" && req.method !== "PATCH" ? true : Boolean(req.idempotencyKey);

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: req.method, headers, body, signal: controller.signal });
      } catch (e) {
        clearTimeout(timer);
        if (retryable && attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        const aborted = (e as { name?: string } | null)?.name === "AbortError";
        return aborted
          ? failure("timeout", `The request to ${url.host} timed out after ${this.timeout} ms.`)
          : failure("network_error", `Couldn't reach ${url.host}: ${(e as Error)?.message ?? String(e)}`);
      }
      clearTimeout(timer);

      const retryAfter = Number(res.headers.get("retry-after"));
      // A quota that resets in minutes or hours (daily/monthly plan limits) isn't worth waiting for: return it.
      const waitable = !(Number.isFinite(retryAfter) && retryAfter > 60);
      if ((res.status === 429 || res.status >= 500) && waitable && retryable && attempt < this.maxRetries) {
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoff(attempt));
        continue;
      }

      const raw = await res.text();
      let json: unknown = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      if (res.ok) return { data: json as T, error: null };
      const e = (json ?? {}) as Partial<MailmannyError> & { statusCode?: number };
      return failure(
        (e.name as MailmannyError["name"]) ?? (res.status >= 500 ? "application_error" : "invalid_request"),
        e.message ?? `Request failed with status ${res.status}${raw && !json ? `: ${raw.slice(0, 200)}` : ""}`,
        e.statusCode ?? res.status,
        e.details,
      );
    }
  }
}

/** 0.5 s, 1 s, 2 s… with ±25 % jitter. */
function backoff(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base * (0.75 + Math.random() * 0.5);
}
