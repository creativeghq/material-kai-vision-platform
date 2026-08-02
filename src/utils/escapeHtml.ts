// Canonical HTML escaper for the frontend (invariant 11, pentest #250).
// Byte-equivalent twin of supabase/functions/_shared/html.ts — Deno edge code and the
// Vite bundle can't share a module, so the two are kept identical by convention.
// Escapes the full `& < > " '`, so it is safe in text content AND quoted attributes.
// Use for any interpolation of user/AI-supplied text into an HTML string built by hand.
// This is HTML escaping ONLY — not a PostgREST filter sanitizer (see DocumentList's
// `sanitizeIlikeTerm`) and not a CSV quoter (see ReportsTab's `csvQuote`). Different
// contracts; do not reuse this for them.

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}
