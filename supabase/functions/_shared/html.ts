// Canonical HTML escaper for edge functions (invariant 11).
// There were ~6 hand-rolled copies with THREE different strengths — and CLAUDE.md
// invariant 11 told everyone to "mirror send-quote-email", whose copy escaped only
// `& < >` (attribute-unsafe). This is the single source of truth: it escapes the full
// `& < > " '`, so it is safe in BOTH text content AND double/single-quoted attribute
// values.

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
