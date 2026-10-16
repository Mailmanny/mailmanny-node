import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TEXT_OPTIONS } from "../render.js";

// Compiles + renders a React Email folder with the user's OWN toolchain (esbuild, or tsx as a fallback) and their own
// react / @react-email/render, so components render exactly like in `email dev`.

export const EXTERNAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

const EMAIL_EXT = /\.(tsx|jsx|ts|js|mjs|mts)$/;
const SKIP_FILE = /(^[_.])|\.d\.ts$|\.(test|spec|stories)\.[a-z]+$/;
const SKIP_DIR = new Set(["static", "components", "node_modules", "dist", "out"]);

export type EmailFile = { file: string; externalId: string };

/** Email files under `dir` (recursive). Folders starting with "_" or ".", static/ and components/ are skipped, like React Email's preview. */
export function findEmailFiles(dir: string): EmailFile[] {
  const out: EmailFile[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) {
        if (!name.startsWith("_") && !name.startsWith(".") && !SKIP_DIR.has(name)) walk(full);
        continue;
      }
      if (!EMAIL_EXT.test(name) || SKIP_FILE.test(name)) continue;
      const rel = path.relative(dir, full).replace(EMAIL_EXT, "");
      out.push({ file: full, externalId: rel.split(path.sep).join(".") });
    }
  };
  walk(dir);
  return out;
}

export type RenderedEmail = {
  externalId: string;
  name: string | null;
  subject: string | null;
  previewText: string | null;
  html: string;
  text: string;
};

export type RenderOutcome = { ok: true; email: RenderedEmail } | { ok: false; skipped: boolean; message: string };

type RenderFn = (node: unknown, options?: Record<string, unknown>) => Promise<string> | string;
type CreateElement = (type: unknown, props?: unknown) => unknown;
type EmailModule = Record<string, unknown> & { default?: unknown };

export class SetupError extends Error {}

const importFile = (file: string) => import(`${pathToFileURL(file).href}?t=${Date.now()}`);

/** The project's node_modules (nearest one above the emails folder). */
function findNodeModules(from: string): string | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules");
    if (existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

type Compiled = { mod: EmailModule; render: RenderFn; createElement: CreateElement };

export class EmailRenderer {
  private constructor(
    private readonly cacheDir: string,
    private readonly compile: (file: string, id: string) => Promise<Compiled>,
    readonly compiler: "esbuild" | "tsx",
  ) {}

  static async create(dir: string): Promise<EmailRenderer> {
    const req = createRequire(path.join(dir, "__mailmanny__.js"));
    const has = (name: string) => {
      try {
        return req.resolve(name);
      } catch {
        return null;
      }
    };
    if (!has("react")) throw new SetupError("Couldn't find react in your project. Run mailmanny from your app's folder (where react is installed).");
    const renderPkg = has("@react-email/render") ? "@react-email/render" : has("@react-email/components") ? "@react-email/components" : null;
    if (!renderPkg) throw new SetupError("Couldn't find @react-email/render in your project. Install it: npm install @react-email/render");
    const nodeModules = findNodeModules(dir);
    if (!nodeModules) throw new SetupError("Couldn't find a node_modules folder above your emails folder. Install your dependencies first.");
    const cacheDir = path.join(nodeModules, ".cache", "mailmanny");
    mkdirSync(cacheDir, { recursive: true });

    const esbuildPath = has("esbuild");
    if (esbuildPath) {
      const esbuildMod = (await importFile(esbuildPath)) as { build?: EsbuildBuild; default?: { build?: EsbuildBuild } };
      const build = esbuildMod.build ?? esbuildMod.default?.build;
      if (!build) throw new SetupError("The esbuild in your project doesn't expose build(). Update it: npm install -D esbuild@latest");
      return new EmailRenderer(cacheDir, async (file, id) => {
        const outfile = path.join(cacheDir, `${id}.${process.pid}.mjs`);
        // One module graph per email: the component plus the project's own react + render (external, resolved from the
        // project's node_modules at import time — the output lives inside it).
        const contents = [
          `import * as mod from ${JSON.stringify(file)};`,
          `import { createElement } from "react";`,
          `import { render } from ${JSON.stringify(renderPkg)};`,
          `export { mod, createElement, render };`,
        ].join("\n");
        await build({
          stdin: { contents, resolveDir: dir, sourcefile: "mailmanny-entry.js", loader: "js" },
          bundle: true,
          platform: "node",
          format: "esm",
          target: "node18",
          outfile,
          write: true,
          packages: "external",
          jsx: "automatic",
          loader: { ".js": "jsx" },
          logLevel: "silent",
        });
        try {
          return (await importFile(outfile)) as Compiled;
        } finally {
          rmSync(outfile, { force: true });
        }
      }, "esbuild");
    }

    const tsxApi = has("tsx/esm/api");
    if (tsxApi) {
      const api = (await importFile(tsxApi)) as { tsImport?: TsImport; default?: { tsImport?: TsImport } };
      const tsImport = api.tsImport ?? api.default?.tsImport;
      if (!tsImport) throw new SetupError("The tsx in your project is too old for mailmanny. Update it: npm install -D tsx@latest");
      const react = (await importFile(req.resolve("react"))) as { createElement?: CreateElement; default?: { createElement?: CreateElement } };
      const renderMod = (await importFile(req.resolve(renderPkg))) as { render?: RenderFn; default?: { render?: RenderFn } };
      const createElement = react.createElement ?? react.default?.createElement;
      const render = renderMod.render ?? renderMod.default?.render;
      if (!createElement || !render) throw new SetupError(`Couldn't load react / ${renderPkg} from your project.`);
      const load = async (file: string): Promise<Compiled> => ({
        mod: (await tsImport(pathToFileURL(file).href, import.meta.url)) as EmailModule,
        render,
        createElement,
      });
      return new EmailRenderer(cacheDir, load, "tsx");
    }

    throw new SetupError(
      "mailmanny templates push compiles your React Email files with esbuild (or tsx). Install one in your project: npm install -D esbuild",
    );
  }

  async render(email: EmailFile): Promise<RenderOutcome> {
    let compiled: Compiled;
    try {
      compiled = await this.compile(email.file, email.externalId.replace(/[^A-Za-z0-9_.-]/g, "_"));
    } catch (e) {
      return { ok: false, skipped: false, message: `Couldn't compile: ${firstLine(e)}` };
    }
    const { mod, render, createElement } = compiled;
    const Component = mod.default;
    const isComponent =
      typeof Component === "function" || (typeof Component === "object" && Component !== null && "$$typeof" in Component);
    if (!isComponent) return { ok: false, skipped: true, message: "No default-exported component (skipped)." };

    const meta = (typeof mod.meta === "object" && mod.meta ? mod.meta : {}) as {
      name?: unknown;
      subject?: unknown;
      previewText?: unknown;
      props?: unknown;
    };
    const props = (meta.props ?? (Component as { PreviewProps?: unknown }).PreviewProps ?? {}) as Record<string, unknown>;
    try {
      const element = createElement(Component, props);
      const html = await render(element);
      const text = await render(element, TEXT_OPTIONS);
      const subjectExport = mod.subject ?? meta.subject;
      const subject = typeof subjectExport === "function" ? subjectExport(props) : subjectExport;
      return {
        ok: true,
        email: {
          externalId: email.externalId,
          name: typeof meta.name === "string" ? meta.name : null,
          subject: typeof subject === "string" ? subject : null,
          previewText: typeof meta.previewText === "string" ? meta.previewText : null,
          html,
          text: text.trim(),
        },
      };
    } catch (e) {
      return { ok: false, skipped: false, message: `Render failed: ${firstLine(e)}` };
    }
  }

  dispose(): void {
    try {
      if (existsSync(this.cacheDir) && readdirSync(this.cacheDir).length === 0) rmSync(this.cacheDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

type EsbuildBuild = (options: Record<string, unknown>) => Promise<unknown>;
type TsImport = (specifier: string, parent: string) => Promise<unknown>;

function firstLine(e: unknown): string {
  const errors = (e as { errors?: { text?: string; location?: { file?: string; line?: number } | null }[] } | null)?.errors;
  if (Array.isArray(errors) && errors[0]?.text) {
    const loc = errors[0].location;
    return `${errors[0].text}${loc?.file ? ` (${loc.file}:${loc.line ?? "?"})` : ""}`;
  }
  const message = (e as Error)?.message ?? String(e);
  return message.split("\n")[0] ?? message;
}
