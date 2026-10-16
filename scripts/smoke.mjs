// Smoke test for the built package (CI and before publishing): both module formats load and expose the client, and
// the CLI starts. Run after `npm run build`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fail = (msg) => {
  console.error(`smoke: ${msg}`);
  process.exit(1);
};

const esm = await import(path.join(root, "dist/esm/index.js"));
if (typeof esm.Mailmanny !== "function") fail("ESM build has no Mailmanny export");
const cjs = createRequire(import.meta.url)(path.join(root, "dist/cjs/index.js"));
if (typeof cjs.Mailmanny !== "function") fail("CommonJS build has no Mailmanny export");
if (esm.VERSION !== cjs.VERSION) fail(`ESM/CJS versions differ (${esm.VERSION} vs ${cjs.VERSION})`);
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (esm.VERSION !== version) fail(`built VERSION ${esm.VERSION} doesn't match package.json ${version}`);

const help = execFileSync(process.execPath, [path.join(root, "dist/esm/cli.js"), "--help"], { encoding: "utf8" });
if (!help.includes("mailmanny")) fail("CLI --help did not print its usage");

console.log(`smoke: ok (v${esm.VERSION}, ESM + CJS + CLI)`);
