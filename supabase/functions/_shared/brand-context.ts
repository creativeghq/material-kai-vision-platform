/** The workspace's positioning and voice, read at the moment an agent writes. The ONE loader. */
import type { DbClient } from './supabase-client.ts';
import { loadPrompt, renderPromptTemplate } from './prompt-utils.ts';

export interface BrandProfileRow {
  id: string;
  workspace_id: string;
  website_id: string | null;
  tone_attributes: string[] | null;
  personality_traits: string[] | null;
  writing_style: string | null;
  terminology_preferences: string[] | null;
  avoid_list: string[] | null;
  icp: string | null;
  positioning: string | null;
  messaging_pillars: string[] | null;
  active_hypotheses: string[] | null;
  // deno-lint-ignore no-explicit-any
  [column: string]: any;
}

export interface BrandContext {
  status: 'ok' | 'none' | 'unavailable';
  profile: BrandProfileRow | null;
  competitors: string[];
  error?: string;
}

export type BrandAudience = 'internal' | 'customer' | 'strategy';

export function pickBrandProfile<R extends { website_id: string | null }>(rows: R[], websiteId: string | null): R | null {
  return rows.find((r) => websiteId && r.website_id === websiteId) ?? rows.find((r) => r.website_id === null) ?? null;
}

const list = (a: string[] | null | undefined): string[] => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []);
const text = (s: string | null | undefined): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

export async function loadBrandContext(
  db: DbClient,
  workspaceId: string,
  websiteId: string | null = null,
): Promise<BrandContext> {
  const { data: rows, error } = await db.from('workspace_brand_profile').select('*').eq('workspace_id', workspaceId);
  if (error) return { status: 'unavailable', profile: null, competitors: [], error: error.message };
  const profile = pickBrandProfile((rows ?? []) as BrandProfileRow[], websiteId);

  let q = db.from('seo_competitors').select('competitor_domain, display_label')
    .eq('workspace_id', workspaceId).eq('is_active', true).order('competitor_domain').limit(30);
  if (websiteId) q = q.eq('website_id', websiteId);
  const { data: comps } = await q;
  const competitors = [...new Set(((comps ?? []) as Array<{ competitor_domain: string; display_label: string | null }>)
    .map((c) => text(c.display_label) ? `${text(c.display_label)} (${c.competitor_domain})` : c.competitor_domain))];

  return { status: profile ? 'ok' : 'none', profile, competitors };
}

export function brandContextLines(ctx: BrandContext, audience: BrandAudience): string[] {
  const p = ctx.profile;
  const lines: string[] = [];
  const push = (label: string, value: string | null) => { if (value) lines.push(`${label}: ${value}`); };
  const pushList = (label: string, values: string[]) => { if (values.length) lines.push(`${label}: ${values.join('; ')}`); };
  if (audience !== 'customer') {
    push('Positioning', text(p?.positioning));
    push('Ideal customer', text(p?.icp));
    pushList('Messaging pillars', list(p?.messaging_pillars));
    pushList('Competitors', ctx.competitors);
    pushList('Active hypotheses', list(p?.active_hypotheses));
  }
  if (audience === 'strategy') return lines;
  pushList('Tone', list(p?.tone_attributes));
  pushList('Personality', list(p?.personality_traits));
  push('Writing style', text(p?.writing_style));
  pushList('Preferred terminology', list(p?.terminology_preferences));
  pushList('Never use', list(p?.avoid_list));
  return lines;
}

export async function formatBrandContextForPrompt(db: DbClient, ctx: BrandContext, audience: BrandAudience): Promise<string> {
  const lines = brandContextLines(ctx, audience);
  if (!lines.length) return '';
  const frame = await loadPrompt(db, 'tool', audience === 'customer' ? 'brand_context_customer' : 'brand_context');
  return `\n\n${renderPromptTemplate(frame, { brand_context: lines.join('\n') })}`;
}

const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Accent-, case- and final-sigma-insensitive whole-word match. Returns each avoid term the text uses, as the operator wrote it. */
export function avoidListHits(draft: string, avoidList: string[] | null | undefined): string[] {
  const body = fold(draft ?? '');
  if (!body) return [];
  return list(avoidList).filter((term) => {
    const words = fold(term).split(/\s+/).filter(Boolean).map(escapeRe);
    if (!words.length) return false;
    return new RegExp(`(?<![\\p{L}\\p{N}])${words.join('\\s+')}(?![\\p{L}\\p{N}])`, 'u').test(body);
  });
}

export interface BrandDraftCheck {
  checked: boolean;
  avoid_hits: string[];
}

/** An avoid list we could not read is reported as unchecked, never as clean. */
export function brandDraftCheck(ctx: BrandContext, draft: string): BrandDraftCheck {
  if (ctx.status === 'unavailable') return { checked: false, avoid_hits: [] };
  return { checked: true, avoid_hits: avoidListHits(draft, ctx.profile?.avoid_list) };
}
