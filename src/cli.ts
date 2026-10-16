#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { EmailRenderer, EXTERNAL_ID_RE, findEmailFiles, SetupError } from "./cli/compile.js";
import { readSetting } from "./cli/env.js";
import { c, fail, ok, table, warn } from "./cli/output.js";
import { apiBase } from "./http.js";
import { Mailmanny } from "./index.js";
import { VERSION } from "./version.js";

const HELP = `${c.bold("mailmanny")} ${c.dim(`v${VERSION}`)} — the Mailmanny CLI

${c.bold("Usage")}
  mailmanny templates push [options]   Render every React Email file and upload it as a template
  mailmanny templates list [options]   List the templates in your workspace

${c.bold("Options")}
  --dir <path>        React Email folder (default: emails)
  --key <key>         API key (default: $MAILMANNY_API_KEY, also read from .env.local / .env)
  --base-url <url>    API origin (default: $MAILMANNY_BASE_URL or https://www.mailmanny.com)
  --only <ids>        push: comma-separated template ids to push (file names without extension)
  --dry-run           push: render only, upload nothing
  -h, --help          Show this help
  -v, --version       Show the version

${c.bold("Examples")}
  npx mailmanny templates push
  npx mailmanny templates push --dir src/emails --only welcome,receipt
  MAILMANNY_API_KEY=mm_live_… npx mailmanny templates list

Docs: https://www.mailmanny.com/docs/templates`;

type Flags = { dir?: string; key?: string; baseUrl?: string; only?: string; dryRun: boolean; help: boolean; version: boolean };

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const flags: Flags = { dryRun: false, help: false, version: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${name} needs a value.`);
      return v;
    };
    switch (name) {
      case "--dir":
        flags.dir = value();
        break;
      case "--key":
        flags.key = value();
        break;
      case "--base-url":
        flags.baseUrl = value();
        break;
      case "--only":
        flags.only = value();
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "-v":
      case "--version":
        flags.version = true;
        break;
      default:
        if (arg.startsWith("-")) throw new UsageError(`Unknown option ${arg}. Run mailmanny --help.`);
        positional.push(arg);
    }
  }
  return { positional, flags };
}

class UsageError extends Error {}

function client(flags: Flags, cwd: string): Mailmanny {
  const key = flags.key ?? readSetting("MAILMANNY_API_KEY", cwd);
  if (!key) {
    throw new UsageError(
      "No API key. Set MAILMANNY_API_KEY (in your shell or .env.local) or pass --key. Create one at https://www.mailmanny.com/settings/api-keys.",
    );
  }
  if (!/^mm_live_[0-9A-Za-z]{32}$/.test(key)) throw new UsageError("That doesn't look like a Mailmanny API key (they start with mm_live_).");
  return new Mailmanny(key, { baseUrl: flags.baseUrl ?? readSetting("MAILMANNY_BASE_URL", cwd) });
}

async function push(flags: Flags, cwd: string): Promise<number> {
  const dir = path.resolve(cwd, flags.dir ?? "emails");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new UsageError(`No folder at ${path.relative(cwd, dir) || "."}. Point --dir at your React Email folder.`);
  }
  let files = findEmailFiles(dir);
  if (flags.only) {
    const only = new Set(flags.only.split(",").map((s) => s.trim()).filter(Boolean));
    const unknown = [...only].filter((id) => !files.some((f) => f.externalId === id));
    if (unknown.length) throw new UsageError(`No email file for: ${unknown.join(", ")}.`);
    files = files.filter((f) => only.has(f.externalId));
  }
  if (!files.length) {
    console.log(`${warn} No email files in ${path.relative(cwd, dir) || "."}.`);
    return 0;
  }
  const mm = flags.dryRun ? null : client(flags, cwd);
  const target = flags.dryRun ? c.dim("(dry run)") : c.dim(`→ ${apiBase(flags.baseUrl ?? readSetting("MAILMANNY_BASE_URL", cwd) ?? "https://www.mailmanny.com")}`);
  const renderer = await EmailRenderer.create(dir);
  console.log(`${c.bold("Mailmanny")} pushing ${files.length} template${files.length === 1 ? "" : "s"} from ${path.relative(cwd, dir) || "."} ${target}\n`);

  const width = Math.max(...files.map((f) => f.externalId.length));
  let pushed = 0;
  let failed = 0;
  let skipped = 0;
  try {
    for (const f of files) {
      const label = f.externalId.padEnd(width);
      if (!EXTERNAL_ID_RE.test(f.externalId)) {
        skipped++;
        console.log(`  ${warn} ${label}  ${c.dim("Skipped: rename the file to letters, numbers, dots, dashes or underscores.")}`);
        continue;
      }
      const outcome = await renderer.render(f);
      if (!outcome.ok) {
        if (outcome.skipped) skipped++;
        else failed++;
        console.log(`  ${outcome.skipped ? warn : fail} ${label}  ${outcome.skipped ? c.dim(outcome.message) : c.red(outcome.message)}`);
        continue;
      }
      const e = outcome.email;
      const size = `${Math.round(Buffer.byteLength(e.html) / 102.4) / 10} KB`;
      if (!mm) {
        pushed++;
        console.log(`  ${ok} ${label}  ${c.dim(`rendered ${size}`)}${e.subject ? `  ${c.dim(`“${e.subject}”`)}` : ""}`);
        continue;
      }
      const res = await mm.templates.push({
        externalId: e.externalId,
        name: e.name ?? undefined,
        subject: e.subject ?? undefined,
        previewText: e.previewText ?? undefined,
        html: e.html,
        text: e.text,
      });
      if (res.error) {
        failed++;
        console.log(`  ${fail} ${label}  ${c.red(res.error.message)}`);
        if (res.error.name === "invalid_api_key" || res.error.name === "restricted_api_key" || res.error.name === "missing_api_key") break;
        continue;
      }
      pushed++;
      console.log(`  ${ok} ${label}  ${res.data.created ? c.green("created") : "updated"}  ${c.dim(size)}${e.subject ? `  ${c.dim(`“${e.subject}”`)}` : ""}`);
    }
  } finally {
    renderer.dispose();
  }
  const parts = [`${pushed} ${flags.dryRun ? "rendered" : "pushed"}`];
  if (skipped) parts.push(`${skipped} skipped`);
  if (failed) parts.push(c.red(`${failed} failed`));
  console.log(`\n${parts.join(", ")}.${!flags.dryRun && pushed ? ` Use them with ${c.cyan('template_id: "<id>"')} when sending.` : ""}`);
  return failed ? 1 : 0;
}

async function list(flags: Flags, cwd: string): Promise<number> {
  const mm = client(flags, cwd);
  const rows: string[][] = [[c.bold("EXTERNAL ID"), c.bold("NAME"), c.bold("KIND"), c.bold("UPDATED"), c.bold("ID")]];
  let cursor: string | undefined;
  do {
    const res = await mm.templates.list({ cursor, limit: 100 });
    if (res.error) {
      console.error(`${fail} ${res.error.message}`);
      return 1;
    }
    for (const t of res.data.data) {
      rows.push([t.external_id ?? c.dim("—"), t.name, t.kind, t.updated_at.slice(0, 16).replace("T", " "), c.dim(t.id)]);
    }
    cursor = res.data.next_cursor ?? undefined;
  } while (cursor);
  if (rows.length === 1) {
    console.log("No templates yet. Push your React Email folder with: npx mailmanny templates push");
    return 0;
  }
  console.log(table(rows));
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  if (flags.version) {
    console.log(VERSION);
    return 0;
  }
  const [group, command] = positional;
  if (flags.help || !group) {
    console.log(HELP);
    return 0;
  }
  const cwd = process.cwd();
  if (group === "templates" && command === "push") return push(flags, cwd);
  if (group === "templates" && (command === "list" || command === "ls")) return list(flags, cwd);
  throw new UsageError(`Unknown command "${positional.join(" ")}". Run mailmanny --help.`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof UsageError || error instanceof SetupError) {
      console.error(`${fail} ${error.message}`);
    } else {
      console.error(`${fail} ${(error as Error)?.stack ?? String(error)}`);
    }
    process.exit(1);
  },
);
