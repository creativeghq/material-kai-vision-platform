/** Fills a flow's email body. Every {{path}} is HTML-escaped; {{{path}}} inserts a server-built fragment raw, and only when allowRaw. */
import { escapeHtml } from './html.ts';

function lookup(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => (
    cur && typeof cur === 'object' && key in (cur as Record<string, unknown>) ? (cur as Record<string, unknown>)[key] : undefined
  ), obj);
}

export function resolveHtmlTemplate(template: string, context: Record<string, unknown>, allowRaw: boolean): string {
  return template.replace(/\{\{\{([^}]+)\}\}\}|\{\{([^}]+)\}\}/g, (match, rawPath: string | undefined, path: string | undefined) => {
    const value = lookup(context, (rawPath ?? path ?? '').trim());
    if (value === undefined) return match;
    if (value === null) return '';
    return rawPath !== undefined && allowRaw ? String(value) : escapeHtml(String(value));
  });
}
