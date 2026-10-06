/** Which kept templates a new document's title plausibly belongs to. Import-free so a unit test can call it. */

export type TemplateCandidate = { id: string; title: string; summary?: string | null };

const GENERIC = new Set([
  'the', 'and', 'for', 'our', 'your', 'with', 'about', 'from', 'into', 'new', 'this', 'that',
  'template', 'templates', 'doc', 'docs', 'document', 'documents', 'draft', 'framework', 'write', 'create',
]);

export const significantTokens = (text: string): string[] => {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const out = new Set<string>();
  for (const raw of folded.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || GENERIC.has(raw)) continue;
    out.add(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return [...out];
};

/** A template matches on two shared title words, or on one that is at least half of its title. */
export const matchTemplates = (request: string, templates: TemplateCandidate[]): TemplateCandidate[] => {
  const asked = new Set(significantTokens(request));
  if (asked.size === 0) return [];
  const scored = templates.map((t) => {
    const own = significantTokens(t.title);
    const shared = own.filter((w) => asked.has(w)).length;
    const hit = shared >= 2 || (shared >= 1 && own.length > 0 && shared / own.length >= 0.5);
    return { t, shared, hit };
  });
  return scored.filter((s) => s.hit).sort((a, b) => b.shared - a.shared).map((s) => s.t);
};
