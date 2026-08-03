// Canonical HTML escaper for the Vercel Node functions in `api/` (invariant 11).
//
// Third twin of src/utils/escapeHtml.ts (Vite bundle) and supabase/functions/_shared/html.ts
// (Deno edge). Three runtimes that genuinely cannot share one module — Deno resolves by URL,
// Vite resolves the `@/` alias, and these serverless handlers are plain ESM `.js` compiled by
// Vercel with no alias and no TypeScript step. Escapes the full `& < > " '`, so it is safe in
// text content AND in double/single-quoted attribute values.
//
// The three are no longer "identical by convention": tests/unit/escapeHtmlParity.test.ts
// imports all three and fails if any one of them diverges on a shared corpus. That test is the
// reason a third copy is acceptable here — invariant 11 exists to stop escapers DRIFTING to
// different strengths, which is exactly what the test now makes impossible.
//
// Underscore-prefixed so Vercel treats it as a shared module, not a route.
//
// HTML escaping ONLY — not a PostgREST filter sanitizer, not a CSV quoter, not an XML escaper
// (XML wants `&apos;`, not `&#39;` — see the separate `xmlEscape` in api/sitemap.js).

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}
