// Public types of the mailmanny SDK. Inputs are camelCase (like Resend's SDK); API objects come back exactly as the
// HTTP API returns them (snake_case), so the docs' JSON examples match what you get.

/** A React element such as `<WelcomeEmail name="Sam" />`. Rendered with @react-email/render. */
export type ReactEmailElement = { type: unknown; props: unknown; key: unknown };

export type MailmannyErrorName =
  | "invalid_request"
  | "validation_error"
  | "missing_api_key"
  | "invalid_api_key"
  | "restricted_api_key"
  | "browser_request_blocked"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "invalid_idempotent_request"
  | "concurrent_idempotent_requests"
  | "invalid_from_address"
  | "sending_blocked"
  | "workspace_paused"
  | "rate_limit_exceeded"
  | "quota_exceeded"
  | "plan_required"
  | "application_error"
  | "service_unavailable"
  // SDK-side
  | "missing_dependency"
  | "render_error"
  | "network_error"
  | "timeout";

export type MailmannyError = {
  name: MailmannyErrorName;
  message: string;
  /** HTTP status; null when the request never got a response (network, timeout, local render). */
  statusCode: number | null;
  details?: Record<string, unknown>;
};

/** Every method resolves (never throws for API errors): check `error` first, like Resend's SDK. */
export type Result<T> = { data: T; error: null } | { data: null; error: MailmannyError };

export type RequestOptions = {
  /** Retried requests with the same key never send twice (24 h+). */
  idempotencyKey?: string;
};

export type ListParams = { cursor?: string; limit?: number };
export type List<T> = { object: "list"; data: T[]; has_more: boolean; next_cursor: string | null };

// ── Emails ──

export type Tag = { name: string; value: string };

export type SendEmailOptions = {
  /** "Name <you@your-verified-domain.com>" or a bare address. */
  from: string;
  to: string | string[];
  subject?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  /** Resend v1 spelling, accepted for drop-in compatibility. */
  reply_to?: string | string[];
  /** Rendered to `html` (and `text`, unless you pass one) with @react-email/render. */
  react?: ReactEmailElement;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: Tag[];
  /** Date, ISO 8601 string or natural language ("in 10 minutes"). */
  scheduledAt?: Date | string;
  scheduled_at?: string;
  /** A saved template's id or external id (e.g. "welcome" for a pushed emails/welcome.tsx). */
  templateId?: string;
  template?: { id: string; variables?: Record<string, unknown> };
  /** Values for {{merge_tags}} in the template. */
  variables?: Record<string, unknown>;
};

export type SendEmailResponse = { id: string; ids: string[] };
export type BatchEmailResponse = { data: SendEmailResponse[] };

export type EmailLastEvent =
  | "scheduled"
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed"
  | "canceled";

export type Email = {
  object: "email";
  id: string;
  from: string;
  to: string[];
  reply_to: string[] | null;
  subject: string;
  status: string;
  last_event: EmailLastEvent;
  tags: Tag[];
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  error: string | null;
};

// ── Audiences ──

export type Audience = {
  object: "audience";
  id: string;
  name: string;
  double_opt_in: boolean;
  from_name: string | null;
  from_email: string | null;
  stats: { subscribed: number; pending: number; unsubscribed: number; total: number };
  fields: { key: string; label: string; type: string; required: boolean; options: string[] }[];
  created_at: string;
};

// ── Contacts ──

export type ContactStatus = "subscribed" | "pending" | "unsubscribed" | "bounced" | "complained" | "archived";

export type Contact = {
  object: "contact";
  id: string;
  audience_id: string;
  email: string;
  status: ContactStatus;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birthday: string | null;
  fields: Record<string, unknown>;
  tags: string[];
  source: string;
  consent_source: string | null;
  consent_at: string | null;
  opted_in_at: string | null;
  unsubscribed_at: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
};

/** Identify a contact by id, email, or Mailchimp subscriber hash (md5 of the lowercase email). */
export type ContactRef = { audienceId: string } & ({ id: string; email?: never } | { email: string; id?: never });

export type CreateContactOptions = {
  audienceId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  /** "MM-DD" (or "YYYY-MM-DD"; the year is dropped). */
  birthday?: string | null;
  /** Custom fields by key, e.g. { COMPANY: "Acme" }. */
  fields?: Record<string, unknown>;
  /** Tag names (created when new). */
  tags?: string[];
  /** Default "subscribed" — becomes "pending" on double opt-in audiences until they confirm. */
  status?: "subscribed" | "pending";
  /** Where and how they gave permission. */
  consentSource?: string;
  /** Their IP when they opted in. */
  ip?: string;
  /** Full-access keys only, with consentSource. */
  skipDoubleOptIn?: boolean;
  /** Existing contact: overwrite what you send (default) or only fill blanks. */
  updateExisting?: boolean;
};

export type UpdateContactOptions = ContactRef & {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  birthday?: string | null;
  fields?: Record<string, unknown>;
  /** Only "unsubscribed": the API never resubscribes anyone. */
  status?: "unsubscribed";
};

export type ListContactsOptions = ListParams & { audienceId: string; status?: ContactStatus };
export type RemoveContactOptions = ContactRef & { permanent?: boolean };
export type ContactTagsOptions = ContactRef & { add?: string[]; remove?: string[] };

export type CreateContactResponse = Contact & { created: boolean };
export type RemoveContactResponse = { object: "contact"; id: string; deleted: true; permanent: boolean };
export type ContactTagsResponse = { object: "contact"; id: string; added: string[]; removed: string[]; tags: string[] };

// ── Events ──

export type TrackEventOptions = { audienceId: string; email: string; name: string; properties?: Record<string, unknown> };
export type TrackEventResponse = { object: "event"; id: string | null; name: string; contact_id: string; accepted: true };

// ── Templates ──

export type Template = {
  object: "template";
  id: string;
  external_id: string | null;
  name: string;
  kind: "builder" | "html";
  subject: string | null;
  preview_text: string | null;
  created_at: string;
  updated_at: string;
};
export type TemplateDetail = Template & { html: string | null; text: string | null };

export type PushTemplateOptions = {
  /** Stable id, e.g. "welcome". Pushing the same id again updates the template. */
  externalId: string;
  name?: string;
  subject?: string | null;
  previewText?: string | null;
  react?: ReactEmailElement;
  html?: string;
  text?: string | null;
};
export type PushTemplateResponse = TemplateDetail & { created: boolean };
export type RemoveTemplateResponse = { object: "template"; id: string; deleted: true };

// ── Client ──

export type MailmannyOptions = {
  /** Default: process.env.MAILMANNY_BASE_URL or https://www.mailmanny.com. With or without the /api/v1 suffix. */
  baseUrl?: string;
  /** Custom fetch (tests, proxies). Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /** Retries for 429 / 5xx / network errors on safe requests (GET, PUT, DELETE, and POSTs with an idempotency key). Default 2. */
  maxRetries?: number;
  /** Per-attempt timeout in ms. Default 30 000. */
  timeout?: number;
  /** Extra headers on every request. */
  headers?: Record<string, string>;
};
