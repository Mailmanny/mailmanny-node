import type { HttpClient } from "../http.js";
import type {
  Contact,
  ContactRef,
  ContactTagsOptions,
  ContactTagsResponse,
  CreateContactOptions,
  CreateContactResponse,
  List,
  ListContactsOptions,
  RemoveContactOptions,
  RemoveContactResponse,
  Result,
  UpdateContactOptions,
} from "../types.js";

const contactPath = (ref: ContactRef) =>
  `/audiences/${encodeURIComponent(ref.audienceId)}/contacts/${encodeURIComponent((ref.id ?? ref.email ?? "").trim())}`;

const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export class Contacts {
  constructor(private readonly http: HttpClient) {}

  /** Add someone to an audience, or update them if the email is already there (Mailchimp-style upsert). */
  create(options: CreateContactOptions): Promise<Result<CreateContactResponse>> {
    const { audienceId, firstName, lastName, consentSource, skipDoubleOptIn, updateExisting, ...rest } = options;
    return this.http.request<CreateContactResponse>({
      method: "POST",
      path: `/audiences/${encodeURIComponent(audienceId)}/contacts`,
      body: compact({
        ...rest,
        first_name: firstName,
        last_name: lastName,
        consent_source: consentSource,
        skip_double_opt_in: skipDoubleOptIn,
        update_existing: updateExisting,
      }),
    });
  }

  /** Look up by `id` or `email`. */
  get(ref: ContactRef): Promise<Result<Contact>> {
    return this.http.request<Contact>({ method: "GET", path: contactPath(ref) });
  }

  update(options: UpdateContactOptions): Promise<Result<Contact>> {
    const { audienceId, id, email, firstName, lastName, ...rest } = options;
    const ref = (id ? { audienceId, id } : { audienceId, email }) as ContactRef;
    return this.http.request<Contact>({
      method: "PATCH",
      path: contactPath(ref),
      body: compact({ ...rest, first_name: firstName, last_name: lastName }),
    });
  }

  /** Archive (default) or `permanent: true` (full-access keys) to erase their data. They're never emailed again either way. */
  remove(options: RemoveContactOptions): Promise<Result<RemoveContactResponse>> {
    return this.http.request<RemoveContactResponse>({
      method: "DELETE",
      path: contactPath(options),
      query: options.permanent ? { permanent: true } : undefined,
    });
  }

  list(options: ListContactsOptions): Promise<Result<List<Contact>>> {
    const { audienceId, ...query } = options;
    return this.http.request<List<Contact>>({ method: "GET", path: `/audiences/${encodeURIComponent(audienceId)}/contacts`, query });
  }

  /** `{ add: ["vip"], remove: ["trial"] }` by tag name. */
  tags(options: ContactTagsOptions): Promise<Result<ContactTagsResponse>> {
    return this.http.request<ContactTagsResponse>({
      method: "POST",
      path: `${contactPath(options)}/tags`,
      body: { add: options.add ?? [], remove: options.remove ?? [] },
    });
  }
}
