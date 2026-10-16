import { HttpClient } from "./http.js";
import { Audiences } from "./resources/audiences.js";
import { Contacts } from "./resources/contacts.js";
import { Batch, Emails } from "./resources/emails.js";
import { Events } from "./resources/events.js";
import { Templates } from "./resources/templates.js";
import type { MailmannyOptions } from "./types.js";

export type * from "./types.js";
export { VERSION } from "./version.js";

/**
 * The Mailmanny client.
 * @example
 * import { Mailmanny } from "mailmanny";
 * const mm = new Mailmanny(process.env.MAILMANNY_API_KEY);
 */
export class Mailmanny {
  readonly emails: Emails;
  /** Resend-style alias: `mm.batch.send([...])`. */
  readonly batch: Batch;
  readonly contacts: Contacts;
  readonly audiences: Audiences;
  readonly events: Events;
  readonly templates: Templates;

  constructor(apiKey?: string, options: MailmannyOptions = {}) {
    const key = (apiKey ?? readEnv("MAILMANNY_API_KEY"))?.trim();
    if (!key) {
      throw new Error('Missing API key. Pass it to the constructor: new Mailmanny("mm_live_…"), or set MAILMANNY_API_KEY.');
    }
    const http = new HttpClient(key, options);
    this.emails = new Emails(http);
    this.batch = new Batch(this.emails);
    this.contacts = new Contacts(http);
    this.audiences = new Audiences(http);
    this.events = new Events(http);
    this.templates = new Templates(http);
  }
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export default Mailmanny;
