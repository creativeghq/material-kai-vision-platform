// Canonical HTML escaper for edge functions (invariant 11, pentest #250).
// There were ~6 hand-rolled copies with THREE different strengths — and CLAUDE.md
// invariant 11 told everyone to "mirror send-quote-email", whose copy escaped only
// `& < >` (attribute-unsafe). This is the single source of truth: it escapes the full
// `& < > " '`, so it is safe in BOTH text content AND double/single-quoted attribute
// values. Use it for every interpolation of tenant/customer/AI-supplied text into an
// HTML string. (The frontend twin — same behaviour — is src/utils/escapeHtml.ts;
// Deno and Vite can't share a module, so the two are kept byte-equivalent by design.)
// NOTE: this is HTML escaping only. It is NOT a PostgREST filter sanitizer and NOT a
// CSV quoter — those are different contracts (see DocumentList.tsx / ReportsTab.tsx).
// Don't reuse this for them, and don't name those `esc`.

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
