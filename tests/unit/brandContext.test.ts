/** #484 — one brand context, read by every content producer, and an avoid list checked by the server. */
import { describe, expect, it } from 'vitest';

import { posix, sourceIndex, strippedSource } from '../helpers/sourceIndex';
import {
  avoidListHits, brandContextLines, brandDraftCheck, type BrandContext,
} from '../../supabase/functions/_shared/brand-context.ts';
import { brandOpAllowed, BRAND_PROPOSABLE_FIELDS } from '../../src/config/brandProfileFields';

const LOADER = /['"](?:\.\.\/)+(?:_shared\/)?brand-context\.ts['"]/;

const PRODUCERS: Record<string, { reads: boolean; checks: boolean; why: string }> = {
  'supabase/functions/agent-chat/index.ts': { reads: true, checks: false, why: 'injects it for every agent turn: inbox drafts, campaign copy, Edith, Hermes all run here' },
  'supabase/functions/generate-social-content/index.ts': { reads: true, checks: true, why: 'social captions' },
  'supabase/functions/_shared/tools/social-tools.ts': { reads: true, checks: true, why: 'the caption an agent publishes' },
  'supabase/functions/_shared/tools/email-marketing-tools.ts': { reads: true, checks: true, why: 'a draft campaign\'s name and subject line' },
  'supabase/functions/inbox-api/index.ts': { reads: true, checks: true, why: 'auto-reply, suggest_reply, the cron draft, assist rewrites' },
  'supabase/functions/gmail-api/index.ts': { reads: true, checks: true, why: 'Gmail reply drafts and rewrites' },
  'supabase/functions/seo-api/handlers/content-brief.ts': { reads: true, checks: false, why: 'the SEO writer\'s brief' },
  'supabase/functions/seo-api/handlers/pipeline.ts': { reads: true, checks: true, why: 'the finished article' },
};

const NOT_PRODUCERS: Record<string, string> = {
  'supabase/functions/zernio-api/handlers/analytics.ts': 'imports posts already published on the network; nothing is generated',
};

const WRITES_GENERATED = [
  /from\(\s*'social_posts'\s*\)\s*\.(?:insert|update|upsert)\([\s\S]{0,500}?\bcaption\s*:/,
  /\bagent_draft\s*:\s*(?!null\b)/,
  /from\(\s*'campaigns'\s*\)\s*\.(?:insert|update)\([\s\S]{0,500}?\bsubject_line\s*:/,
];

const EDGE = sourceIndex({ roots: ['supabase/functions'], exclude: ['_generated'] });

const ctx = (profile: Partial<NonNullable<BrandContext['profile']>> | null, status: BrandContext['status'] = 'ok'): BrandContext => ({
  status,
  profile: profile ? { id: 'p', workspace_id: 'w', website_id: null, ...profile } as BrandContext['profile'] : null,
  competitors: ['Rival (rival.gr)'],
});

describe('the avoid list is checked by the server, literally', () => {
  it('matches whole words, ignoring case, accents and the Greek final sigma', () => {
    expect(avoidListHits('Our tiles are CHEAP and revolutionary.', ['cheap', 'Revolutionary'])).toEqual(['cheap', 'Revolutionary']);
    expect(avoidListHits('Τα πλακάκια είναι φθηνά', ['φθηνα'])).toEqual(['φθηνα']);
    expect(avoidListHits('Η καλύτερη τιμής', ['τιμης'])).toEqual(['τιμης']);
  });

  it('a word inside another word is not a hit, and a phrase matches across whitespace', () => {
    expect(avoidListHits('a cheaper option', ['cheap'])).toEqual([]);
    expect(avoidListHits('the best\n price in town', ['best price'])).toEqual(['best price']);
    expect(avoidListHits('anything', ['', '  '])).toEqual([]);
  });

  it('an avoid list we could not read is UNCHECKED, never clean', () => {
    expect(brandDraftCheck(ctx(null, 'unavailable'), 'cheap')).toEqual({ checked: false, avoid_hits: [] });
    expect(brandDraftCheck(ctx(null, 'none'), 'cheap')).toEqual({ checked: true, avoid_hits: [] });
    expect(brandDraftCheck(ctx({ avoid_list: ['cheap'] }), 'so cheap')).toEqual({ checked: true, avoid_hits: ['cheap'] });
  });
});

describe('what each audience sees', () => {
  const full = ctx({
    positioning: 'Large-format specialist', icp: 'Architects', messaging_pillars: ['stock'],
    active_hypotheses: ['case studies'], tone_attributes: ['direct'], avoid_list: ['cheap'],
  });

  it('a customer turn gets the voice only — never positioning, competitors or hypotheses', () => {
    const lines = brandContextLines(full, 'customer').join('\n');
    expect(lines).toContain('direct');
    expect(lines).toContain('cheap');
    for (const internal of ['Large-format', 'Architects', 'Rival', 'case studies']) expect(lines).not.toContain(internal);
  });

  it('the SEO brief gets the strategy only — its voice already arrives through brandVoice', () => {
    const lines = brandContextLines(full, 'strategy').join('\n');
    expect(lines).toContain('Rival');
    expect(lines).not.toContain('direct');
  });

  it('an empty profile emits no lines, so no block is injected', () => {
    expect(brandContextLines({ status: 'none', profile: null, competitors: [] }, 'internal')).toEqual([]);
  });

  it('the framing comes from the prompts table, not from code', () => {
    const src = strippedSource('supabase/functions/_shared/brand-context.ts');
    expect(src).toMatch(/loadPrompt\(db, 'tool', audience === 'customer' \? 'brand_context_customer' : 'brand_context'\)/);
  });
});

describe('every content producer reads it', () => {
  it('each producer imports the one loader, reads, and checks its draft', () => {
    const bad: string[] = [];
    for (const [file, need] of Object.entries(PRODUCERS)) {
      const src = strippedSource(file);
      if (!LOADER.test(src)) bad.push(`${file}: does not import _shared/brand-context.ts`);
      if (need.reads && !/loadBrandContext\(/.test(src)) bad.push(`${file}: never calls loadBrandContext (${need.why})`);
      if (need.checks && !/(brandDraftCheck|avoidListHits)\(/.test(src)) bad.push(`${file}: generates a draft and never checks it against the avoid list`);
    }
    expect(bad).toEqual([]);
  });

  it('a file that writes generated content is a listed producer, or says why it is not', () => {
    const missing: string[] = [];
    for (const [abs, src] of EDGE.stripped()) {
      const file = posix(abs);
      if (!WRITES_GENERATED.some((re) => re.test(src))) continue;
      if (!PRODUCERS[file] && !NOT_PRODUCERS[file]) missing.push(file);
    }
    expect(missing, 'Add it to PRODUCERS (and read + check the brand context), or to NOT_PRODUCERS with a reason').toEqual([]);
  });

  it('NOT_PRODUCERS stays honest — every entry still writes generated content', () => {
    for (const file of Object.keys(NOT_PRODUCERS)) {
      expect(WRITES_GENERATED.some((re) => re.test(strippedSource(file))), file).toBe(true);
    }
  });

  it('agent-chat injects it next to the business identity, per audience', () => {
    const src = strippedSource('supabase/functions/agent-chat/index.ts');
    const identity = src.indexOf('formatBusinessIdentityForPrompt(');
    const brand = src.indexOf('formatBrandContextForPrompt(');
    expect(identity).toBeGreaterThan(-1);
    expect(brand).toBeGreaterThan(identity);
    expect(src.slice(brand, brand + 200)).toContain("forCustomer ? 'customer' : 'internal'");
  });

  it('the SEO brief resolves through the loader, not its own read of the table', () => {
    const src = strippedSource('supabase/functions/seo-api/handlers/content-brief.ts');
    expect(src).not.toMatch(/from\('workspace_brand_profile'\)/);
    expect(src).toContain('loadBrandContext(supabase, workspaceId, websiteId)');
  });
});

describe('where nothing reviews the draft, a hit is REFUSED', () => {
  it('the inbox auto-reply checks before it posts, and holds on a hit or an unchecked list', () => {
    const src = strippedSource('supabase/functions/inbox-api/index.ts');
    const fn = src.slice(src.indexOf('async function maybeRunAgentReply'), src.indexOf('async function buildTranscript'));
    const check = fn.indexOf('brandDraftCheck(');
    const post = fn.indexOf('insertMessageAndNotify(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(post);
    expect(fn.slice(check, post)).toMatch(/if \(!brandCheck\.checked \|\| brandCheck\.avoid_hits\.length\) \{[\s\S]*?return;/);
  });

  it('the cron draft stores its hits on the thread for the member who reviews it', () => {
    const src = strippedSource('supabase/functions/inbox-api/index.ts');
    expect(src).toContain('agent_draft_avoid_hits: failure ? [] : avoidHits');
  });
});

describe('agents propose; only an admin applies', () => {
  const tool = strippedSource('supabase/functions/_shared/tools/brand-tools.ts');

  it('the proposal tool never writes the profile itself', () => {
    expect(tool).not.toMatch(/from\('workspace_brand_profile'\)\s*\.(insert|update|upsert|delete)/);
    expect(tool).toMatch(/from\('brand_profile_proposals'\)\.insert\(/);
  });

  it('it inserts as the caller, so RLS decides who may propose', () => {
    expect(tool).toMatch(/callerDbClient\(jwt, userId, workspaceId\)\.from\('brand_profile_proposals'\)/);
  });

  it('the panel decides through the RPC, never by updating the proposal row', () => {
    const panel = strippedSource('src/components/core/Profile/WebsiteBrandProfilePanel.tsx');
    expect(panel).toContain("rpc('decide_brand_profile_proposal'");
    expect(panel).not.toMatch(/from\('brand_profile_proposals'[^)]*\)\s*\.update/);
  });

  it('a list field takes add/remove and a text field takes set', () => {
    expect(brandOpAllowed('avoid_list', 'add')).toBe(true);
    expect(brandOpAllowed('avoid_list', 'set')).toBe(false);
    expect(brandOpAllowed('positioning', 'set')).toBe(true);
    expect(brandOpAllowed('positioning', 'add')).toBe(false);
    expect(brandOpAllowed('author_name', 'set')).toBe(false);
    expect(BRAND_PROPOSABLE_FIELDS).not.toContain('author_name');
  });
});
