import { failure } from "./http.js";
import type { ReactEmailElement, Result } from "./types.js";

type RenderFn = (node: unknown, options?: Record<string, unknown>) => Promise<string> | string;

// Headings keep their case in the text part (html-to-text upper-cases them, which also breaks {{merge_tags}}).
export const TEXT_OPTIONS = {
  plainText: true,
  htmlToTextOptions: {
    selectors: ["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
      selector,
      format: "heading",
      options: { leadingLineBreaks: 2, trailingLineBreaks: 2, uppercase: false },
    })),
  },
};

let loaded: Promise<RenderFn | null> | undefined;

/** @react-email/render is an optional peer dependency, loaded the first time a `react` email is sent. */
function loadRender(): Promise<RenderFn | null> {
  loaded ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@react-email/render").then(
    (mod) => {
      const m = mod as unknown as { render?: RenderFn; default?: { render?: RenderFn } };
      return m.render ?? m.default?.render ?? null;
    },
    () => null,
  );
  return loaded;
}

/** `react` → { html, text } exactly like Resend's SDK does it. */
export async function renderReact(element: ReactEmailElement, opts: { text: boolean }): Promise<Result<{ html: string; text?: string }>> {
  const render = await loadRender();
  if (!render) {
    return failure(
      "missing_dependency",
      "To send React emails, install @react-email/render next to mailmanny: npm install @react-email/render",
    );
  }
  try {
    const html = await render(element);
    const text = opts.text ? await render(element, TEXT_OPTIONS) : undefined;
    return { data: { html, text }, error: null };
  } catch (e) {
    return failure("render_error", `Rendering the React email failed: ${(e as Error)?.message ?? String(e)}`);
  }
}
