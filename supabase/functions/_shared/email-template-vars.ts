/** Apart from the React renderer so it carries no `npm:` import and the guard test can read it. */

import { escapeHtml } from './html.ts';

/**
 * `{{#if key}}…{{/if}}` and `{{#key}}…{{/key}}` survive only on a non-empty value. They matched
 * no variable pattern, so live catalog and role-upgrade emails shipped `{{#if catalog_subtitle}}`.
 */
function applySections(template: string, variables: Record<string, any>): string {
  const present = (key: string) => {
    const v = variables[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  };
  return template
    .replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key, inner) => (present(key) ? inner : ''))
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key, inner) => (present(key) ? inner : ''));
}

export function renderTemplateWithVariables(
  template: string,
  variables: Record<string, any>,
  opts: { allowRaw?: boolean } = {},
): string {
  // `{{{key}}}` is pre-built HTML from our OWN code — the finance digest hands over five
  // <table> strings and escaping them put literal markup in the inbox. Without allowRaw it
  // degrades to an escaped value: inert, still delivered, never an injection point.
  const withRaw = applySections(template, variables).replace(/\{\{\{(\w+)\}\}\}/g, (m, key) => {
    const v = variables[key];
    if (v === undefined || v === null) return '';
    return opts.allowRaw ? String(v) : escapeHtml(String(v));
  });

  return withRaw.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? escapeHtml(String(variables[key])) : `{{${key}}}`;
  });
}
