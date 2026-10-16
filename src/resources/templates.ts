import { failure, type HttpClient } from "../http.js";
import { renderReact } from "../render.js";
import type { List, ListParams, PushTemplateOptions, PushTemplateResponse, RemoveTemplateResponse, Result, Template, TemplateDetail } from "../types.js";

export class Templates {
  constructor(private readonly http: HttpClient) {}

  list(params: ListParams = {}): Promise<Result<List<Template>>> {
    return this.http.request<List<Template>>({ method: "GET", path: "/templates", query: params });
  }

  /** By id or external id. */
  get(idOrExternalId: string): Promise<Result<TemplateDetail>> {
    return this.http.request<TemplateDetail>({ method: "GET", path: `/templates/${encodeURIComponent(idOrExternalId)}` });
  }

  /** Create or update an HTML template by external id (what `mailmanny templates push` does per file). */
  async push(template: PushTemplateOptions): Promise<Result<PushTemplateResponse>> {
    let html = template.html;
    let text = template.text;
    if (template.react) {
      const rendered = await renderReact(template.react, { text: text === undefined });
      if (rendered.error) return rendered;
      html = rendered.data.html;
      text = text ?? rendered.data.text;
    }
    if (!html) return failure("validation_error", "Pass html or react to push a template.");
    const body: Record<string, unknown> = { html, text, name: template.name, subject: template.subject, preview_text: template.previewText };
    for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
    return this.http.request<PushTemplateResponse>({ method: "PUT", path: `/templates/${encodeURIComponent(template.externalId)}`, body });
  }

  remove(idOrExternalId: string): Promise<Result<RemoveTemplateResponse>> {
    return this.http.request<RemoveTemplateResponse>({ method: "DELETE", path: `/templates/${encodeURIComponent(idOrExternalId)}` });
  }
}
