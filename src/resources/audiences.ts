import type { HttpClient } from "../http.js";
import type { Audience, List, ListParams, Result } from "../types.js";

export class Audiences {
  constructor(private readonly http: HttpClient) {}

  /** Audiences your key can reach (audience keys: only theirs). */
  list(params: ListParams = {}): Promise<Result<List<Audience>>> {
    return this.http.request<List<Audience>>({ method: "GET", path: "/audiences", query: params });
  }

  get(id: string): Promise<Result<Audience>> {
    return this.http.request<Audience>({ method: "GET", path: `/audiences/${encodeURIComponent(id)}` });
  }
}
