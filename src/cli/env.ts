import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** process.env first, then .env.local / .env in the working directory (KEY=value lines; quotes stripped). */
export function readSetting(name: string, cwd: string): string | undefined {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  for (const file of [".env.local", ".env"]) {
    const p = path.join(cwd, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || m[1] !== name) continue;
      const value = m[2]!.replace(/^(['"])(.*)\1$/, "$2").trim();
      if (value) return value;
    }
  }
  return undefined;
}
