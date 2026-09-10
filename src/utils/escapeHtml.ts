// Canonical HTML escaper for the frontend (invariant 11).
// Byte-equivalent twin of supabase/functions/_shared/html.ts (Deno edge) and
// api/_shared/html.js (Vercel Node functions) — three runtimes that can't share a module.
// They are held identical by tests/unit/escapeHtmlParity.test.ts, which imports all three
// and diffs them over a shared corpus. Do not rely on convention: that is how the earlier
// per-file copies drifted to three different strengths in the first place.

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
