import type { HttpClient } from "../http.js";
import type { RequestOptions, Result, TrackEventOptions, TrackEventResponse } from "../types.js";

export class Events {
  constructor(private readonly http: HttpClient) {}

  /** Record a custom event for a contact. Automations with an "API event" trigger of the same name start. */
  track(event: TrackEventOptions, options: RequestOptions = {}): Promise<Result<TrackEventResponse>> {
    return this.http.request<TrackEventResponse>({
      method: "POST",
      path: "/events",
      body: { audience_id: event.audienceId, email: event.email, name: event.name, properties: event.properties },
      idempotencyKey: options.idempotencyKey,
    });
  }
}
