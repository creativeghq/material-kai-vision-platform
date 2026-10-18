/** Pure rules the page review applies to the model's reply. Import-free so the unit tests load it directly. */

const bare = (u: string) => u.replace(/\/+$/, '');

/** Cut at the last word boundary that fits; a clipped word reads as a typo in a SERP. */
export function clampAtWord(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '');
}

/** Only a sibling we handed the model may become a link; anything else is invented and dropped. */
export function keepKnownLinks<T extends { to_url: string }>(links: T[], siblings: { url: string }[], alreadyLinked: string[]): T[] {
  const known = new Set(siblings.map((s) => bare(s.url)));
  const linked = new Set(alreadyLinked.map(bare));
  const seen = new Set<string>();
  return links.filter((l) => {
    const u = bare(String(l.to_url ?? ''));
    if (!known.has(u) || linked.has(u) || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}
