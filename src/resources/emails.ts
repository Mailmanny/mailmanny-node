import type { HttpClient } from "../http.js";
import { renderReact } from "../render.js";
import type { BatchEmailResponse, Email, RequestOptions, Result, SendEmailOptions, SendEmailResponse } from "../types.js";

/** camelCase SDK options → the snake_case HTTP body (rendering `react` on the way). */
async function toBody(email: SendEmailOptions): Promise<Result<Record<string, unknown>>> {
  const { react, replyTo, reply_to, scheduledAt, scheduled_at, templateId, ...rest } = email;
  let html = email.html;
  let text = email.text;
  if (react) {
    const rendered = await renderReact(react, { text: text === undefined });
    if (rendered.error) return rendered;
    html = rendered.data.html;
    text = text ?? rendered.data.text;
  }
  const schedule = scheduledAt instanceof Date ? scheduledAt.toISOString() : (scheduledAt ?? scheduled_at);
  const body: Record<string, unknown> = {
    ...rest,
    html,
    text,
    reply_to: replyTo ?? reply_to,
    scheduled_at: schedule,
    template_id: templateId,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return { data: body, error: null };
}

export class Emails {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send one email (Resend-compatible). `react` is rendered with @react-email/render.
   * @example
   * const { data, error } = await mm.emails.send({
   *   from: "Manny <hello@yourdomain.com>",
   *   to: "sam@example.com",
   *   subject: "Welcome!",
   *   react: <WelcomeEmail name="Sam" />,
   * });
   */
  async send(email: SendEmailOptions, options: RequestOptions = {}): Promise<Result<SendEmailResponse>> {
    const body = await toBody(email);
    if (body.error) return body;
    return this.http.request<SendEmailResponse>({ method: "POST", path: "/emails", body: body.data, idempotencyKey: options.idempotencyKey });
  }

  /** Alias of `send`, matching `resend.emails.create`. */
  create(email: SendEmailOptions, options: RequestOptions = {}): Promise<Result<SendEmailResponse>> {
    return this.send(email, options);
  }

  /** Up to 100 emails in one request. Each one is validated before any is queued. */
  async batch(emails: SendEmailOptions[], options: RequestOptions = {}): Promise<Result<BatchEmailResponse>> {
    const bodies: Record<string, unknown>[] = [];
    for (const email of emails) {
      const body = await toBody(email);
      if (body.error) return body;
      bodies.push(body.data);
    }
    return this.http.request<BatchEmailResponse>({ method: "POST", path: "/emails/batch", body: bodies, idempotencyKey: options.idempotencyKey });
  }

  /** Status and delivery timestamps of an email sent through the API. */
  get(id: string): Promise<Result<Email>> {
    return this.http.request<Email>({ method: "GET", path: `/emails/${encodeURIComponent(id)}` });
  }
}

/** `resend.batch.send(...)` shape. */
export class Batch {
  constructor(private readonly emails: Emails) {}

  send(emails: SendEmailOptions[], options: RequestOptions = {}): Promise<Result<BatchEmailResponse>> {
    return this.emails.batch(emails, options);
  }

  create(emails: SendEmailOptions[], options: RequestOptions = {}): Promise<Result<BatchEmailResponse>> {
    return this.emails.batch(emails, options);
  }
}
