/**
 * ΚΑΔ (Greek activity-code) merge — THE single derivation, shared by `myaade-rgwspublic2` and
 * `mygemi-opendata`. The frontend mirrors it in `src/modules/crm/services/companyResearch.ts`
 * (different runtime, same contract) — change both together.
 *
 * Why this exists: ΑΑΔΕ and ΓΕΜΗ both publish a company's activity codes and they overlap
 * heavily. The previous per-function copies concatenated the two lists and deduped only the flat
 * `kad_codes` string array, leaving `kad_all` — the array the UI actually renders and counts —
 * full of duplicates. A real row had 57 entries for 35 distinct codes and 3 rows flagged
 * `primary` when a company has exactly ONE primary activity.
 *
 * Rules:
 *  - one entry per code (case-insensitive), ΑΑΔΕ wins the duplicate because it is the tax
 *    registry of record; the losing source is recorded in `also_in` so provenance isn't lost;
 *  - a missing description is backfilled from the other source's copy;
 *  - exactly one entry may carry `primary` — ΑΑΔΕ's primary wins, otherwise the first one seen.
 */

/** One entry in the normalized, queryable ΚΑΔ list on `crm_companies.kad_all`. */
export interface KadEntry {
  code: string;
  description: string | null;
  source: 'aade' | 'gemi';
  primary: boolean;
  /** The other registry that also lists this code, when both do. */
  also_in?: 'aade' | 'gemi';
}

const SOURCE_RANK: Record<'aade' | 'gemi', number> = { aade: 0, gemi: 1 };

/**
 * Merge one source's ΚΑΔ into the company's existing `kad_all`, preserving the OTHER source's
 * entries (the two enrich functions run independently and must not clobber each other), then
 * dedupe the union by code.
 */
export function mergeKad(
  existingAll: unknown,
  source: 'aade' | 'gemi',
  items: Array<{ code: string | null; description: string | null; primary: boolean }>,
): { kad_all: KadEntry[]; kad_codes: string[] } {
  const kept: KadEntry[] = Array.isArray(existingAll)
    ? (existingAll as KadEntry[]).filter((x) => x && x.code && x.source && x.source !== source)
    : [];
  const fresh: KadEntry[] = items
    .filter((a) => a.code && String(a.code).trim())
    .map((a) => ({
      code: String(a.code).trim(),
      description: a.description ?? null,
      source,
      primary: !!a.primary,
    }));

  return dedupeKad([...kept, ...fresh]);
}

/**
 * Collapse a concatenated ΚΑΔ list to one entry per code and one primary overall.
 * Exported so a backfill / repair path can reuse it on rows written before this landed.
 */
export function dedupeKad(all: KadEntry[]): { kad_all: KadEntry[]; kad_codes: string[] } {
  const byCode = new Map<string, KadEntry>();

  for (const e of all) {
    if (!e || !e.code) continue;
    const key = String(e.code).trim().toLowerCase();
    if (!key) continue;
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, { ...e, code: String(e.code).trim() });
      continue;
    }
    // Same code from both registries: keep the higher-ranked source, remember the other,
    // and don't lose a description or a primary flag the loser happened to carry.
    const winner = SOURCE_RANK[e.source] < SOURCE_RANK[existing.source] ? e : existing;
    const loser = winner === existing ? e : existing;
    byCode.set(key, {
      ...winner,
      code: String(winner.code).trim(),
      description: winner.description ?? loser.description ?? null,
      primary: winner.primary || loser.primary,
      ...(winner.source !== loser.source ? { also_in: loser.source } : {}),
    });
  }

  const kad_all = [...byCode.values()];

  // Exactly one primary: ΑΑΔΕ's claim beats ΓΕΜΗ's, otherwise first wins. The UI stars it.
  const primaryIdx = kad_all.findIndex((e) => e.primary && e.source === 'aade');
  const keepIdx = primaryIdx >= 0 ? primaryIdx : kad_all.findIndex((e) => e.primary);
  for (let i = 0; i < kad_all.length; i++) kad_all[i].primary = i === keepIdx;

  // Primary first, then by code — stable order so the dialog doesn't reshuffle between reads.
  kad_all.sort((a, b) => (Number(b.primary) - Number(a.primary)) || a.code.localeCompare(b.code));

  return { kad_all, kad_codes: kad_all.map((e) => e.code) };
}
