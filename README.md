# mailmanny

The official Node.js SDK and CLI for [Mailmanny](https://www.mailmanny.com). Use it to:

- send transactional email written in [React Email](https://react.email),
- add people to your audiences (Mailchimp-style audience keys),
- track events that start automations,
- push a folder of React Email templates with one command.

It has zero runtime dependencies and runs on Node.js 18.17 or later. It works from ESM and CommonJS.

```bash
npm install mailmanny @react-email/render
```

`@react-email/render` is optional. You only need it to send `react` emails.

## Quickstart

1. Create an API key in **Settings → API keys**. Keys start with `mm_live_`, and Mailmanny shows each one only once.
2. Verify the domain you send from in **Settings → Domains**.
3. Send:

```tsx
import { Mailmanny } from "mailmanny";
import WelcomeEmail from "./emails/welcome";

const mm = new Mailmanny(process.env.MAILMANNY_API_KEY);

const { data, error } = await mm.emails.send({
  from: "Manny's Bakery <hello@mannysbakery.com>",
  to: "sam@example.com",
  subject: "Welcome to the bakery!",
  react: <WelcomeEmail name="Sam" />,
});

if (error) throw new Error(`${error.name}: ${error.message}`);
console.log(data.id);
```

Every method resolves to `{ data, error }` and never throws for API errors, just like Resend's SDK. `error` has a
stable `name` (for example `validation_error` or `rate_limit_exceeded`), a human `message` and the HTTP `statusCode`.

## Coming from Resend?

Change the import and the key. Everything else stays the same.

```diff
- import { Resend } from "resend";
- const resend = new Resend(process.env.RESEND_API_KEY);
+ import { Mailmanny } from "mailmanny";
+ const resend = new Mailmanny(process.env.MAILMANNY_API_KEY);

  await resend.emails.send({ from, to, subject, react: <WelcomeEmail /> });
```

These all work unchanged:

- `emails.send` and its alias `emails.create`
- `batch.send`
- `replyTo` and `reply_to`
- `scheduledAt`
- `tags`
- `headers`
- the `Idempotency-Key` option

Attachments aren't supported. Link to the file instead.

## Emails

```ts
await mm.emails.send(
  {
    from: "Acme <billing@acme.com>",
    to: ["sam@example.com"],
    cc: "finance@example.com",
    replyTo: "support@acme.com",
    subject: "Your receipt",
    html: "<p>Thanks for your order!</p>",
    text: "Thanks for your order!", // optional; rendered from `react` automatically
    tags: [{ name: "category", value: "receipt" }],
    scheduledAt: "in 10 minutes", // or a Date / ISO string, up to 30 days ahead
  },
  { idempotencyKey: `receipt-${order.id}` }, // retries never send twice
);

// From a saved or pushed template, with {{merge_tags}} filled in:
await mm.emails.send({
  from: "Acme <hello@acme.com>",
  to: "sam@example.com",
  templateId: "welcome",
  variables: { first_name: "Sam" },
});

await mm.emails.batch([{ from, to: "a@example.com", subject, html }, { from, to: "b@example.com", subject, html }]);

const { data: email } = await mm.emails.get(id); // email.last_event: "delivered" | "opened" | "bounced" | …
```

## Audiences and contacts

Contacts are upserted by email, the same way Mailchimp does it. Double opt-in audiences send a confirmation email.
The contact stays `pending` until they confirm.

```ts
const { data: audiences } = await mm.audiences.list();

await mm.contacts.create({
  audienceId,
  email: "sam@example.com",
  firstName: "Sam",
  fields: { COMPANY: "Acme" },
  tags: ["newsletter", "from-checkout"],
  consentSource: "Checkout opt-in checkbox",
  ip: request.ip,
});

await mm.contacts.get({ audienceId, email: "sam@example.com" });
await mm.contacts.update({ audienceId, email: "sam@example.com", lastName: "Rivera" });
await mm.contacts.tags({ audienceId, email: "sam@example.com", add: ["vip"], remove: ["trial"] });
await mm.contacts.update({ audienceId, email: "sam@example.com", status: "unsubscribed" });
await mm.contacts.remove({ audienceId, email: "sam@example.com" }); // archive; { permanent: true } erases
await mm.contacts.list({ audienceId, status: "subscribed", limit: 100 });
```

An **audience key** has only the `contacts:write` permission and is limited to one or more audiences. It can add and
update people there, but it can't read your list, send email or erase contacts (`permanent: true` needs a full-access
key), which makes it safe for signup integrations.

## Events

```ts
await mm.events.track({ audienceId, email: "sam@example.com", name: "order.completed", properties: { total: 42 } });
```

An event starts every active automation whose trigger is **API event** with the same name.

## Templates and the CLI

Keep your emails in a React Email folder (`emails/` by default) and push them all with one command:

```bash
MAILMANNY_API_KEY=mm_live_… npx mailmanny templates push
```

The CLI works through the folder like this:

1. It compiles every email file in the folder with your project's own `esbuild`, or `tsx` if esbuild isn't installed.
2. It renders each default export with your `@react-email/render`, using the component's `PreviewProps`.
3. It uploads the HTML and the plain-text version.

Each template is stored under its file name, so `emails/welcome.tsx` becomes `welcome` and
`emails/auth/reset.tsx` becomes `auth.reset`. Pushing again updates the template.

The CLI skips these:

- folders whose names start with `_` or `.`
- `static/` and `components/`
- files with no default export

A template file can export a few optional extras:

```tsx
export const subject = "Welcome to Manny's Bakery"; // or (props) => `Welcome, ${props.name}`
export const meta = { name: "Welcome email", previewText: "Fresh bread awaits" };

export default function WelcomeEmail({ name }: { name: string }) {
  /* … */
}

// Merge tags render as-is and are filled in per recipient at send time.
WelcomeEmail.PreviewProps = { name: "{{first_name|friend}}" };
```

```bash
npx mailmanny templates push --dir src/emails --only welcome,receipt
npx mailmanny templates push --dry-run   # render only
npx mailmanny templates list
```

The CLI reads `MAILMANNY_API_KEY` and `MAILMANNY_BASE_URL` from the environment, `.env.local` or `.env`. The API
key needs the **Push templates** permission.

You can also push from code with `mm.templates.push({ externalId: "welcome", react: <WelcomeEmail />, subject })`.

## Options

```ts
new Mailmanny(apiKey, {
  baseUrl: "https://www.mailmanny.com", // or MAILMANNY_BASE_URL
  maxRetries: 2, // 429 / 5xx / network, for GET, PUT, DELETE and POSTs with an idempotency key
  timeout: 30_000,
  fetch: customFetch,
});
```

## Security

API keys are secret. Use them from your server only. The API rejects browser requests. Revoke a leaked key in
**Settings → API keys**; it stops working right away.

## Using an AI coding agent?

Point it at https://www.mailmanny.com/llms.txt. It's the docs index in the [llms.txt](https://llmstxt.org) format, with
a link to every docs page as Markdown (add `.md` to any docs URL, e.g. https://www.mailmanny.com/docs/sending.md).
https://www.mailmanny.com/llms-full.txt has every page in one file, and
https://www.mailmanny.com/docs/ai-agents has a ready-made setup prompt.

Full docs: https://www.mailmanny.com/docs
