import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => '' } };
  return {
    answers: {} as Record<string, () => Promise<unknown>>,
    cost: {} as Record<string, number>,
    calls: [] as { method: string; args: unknown[] }[],
    reserveFails: new Set<string>(),
    reserves: [] as string[],
    settles: [] as { reserved: number; actual: number | null; meta: Record<string, unknown> }[],
    coverage: vi.fn(),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../../supabase/functions/_shared/http.ts', () => ({ jsonResponse: vi.fn() }));
vi.mock('../../supabase/functions/_shared/cors.ts', () => ({ corsHeaders: {} }));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ authenticate: vi.fn() }));
vi.mock('../../supabase/functions/_shared/secrets.ts', () => ({ resolveSecret: vi.fn(async () => ({ value: 'x' })) }));
vi.mock('../../supabase/functions/_shared/tools/dataforseo-spend-gate.ts', () => ({ DATAFORSEO_SERVICE: 'dataforseo' }));
vi.mock('../../supabase/functions/seo-api/handlers/article-access.ts', () => ({ loadOwnedArticle: vi.fn() }));
vi.mock('../../supabase/functions/seo-api/handlers/lessons.ts', () => ({ extractLessons: vi.fn() }));
vi.mock('../../supabase/functions/seo-api/handlers/coverage.ts', () => ({ checkCoverage: h.coverage }));
vi.mock('../../supabase/functions/seo-api/handlers/stage-billing.ts', () => ({
  serviceCredits: vi.fn(async (_s: unknown, _svc: string, units: number) => Math.round(units) / 10),
  reserveStage: vi.fn(async (_s: unknown, _w: unknown, _c: number, description: string) => {
    h.reserves.push(description);
    const blocked = [...h.reserveFails].some((label) => description.includes(label));
    return blocked ? { ok: false, error: 'Insufficient credits' } : { ok: true };
  }),
  settleStage: vi.fn(async (_s: unknown, _w: unknown, reserved: number, actual: number | null, meta: Record<string, unknown>) => {
    h.settles.push({ reserved, actual, meta });
    return actual ?? reserved;
  }),
}));
vi.mock('../../supabase/functions/_shared/dataforseo-client.ts', () => {
  class DataForSEOClient {
    spentUsd = 0;
    unpricedCalls = 0;
    private async run(method: string, args: unknown[]) {
      h.calls.push({ method, args });
      this.spentUsd += h.cost[method] ?? 0;
      return h.answers[method]();
    }
    aiModeAnswer(...args: unknown[]) { return this.run('aiModeAnswer', args); }
    chatGptAnswer(...args: unknown[]) { return this.run('chatGptAnswer', args); }
    perplexityAnswer(...args: unknown[]) { return this.run('perplexityAnswer', args); }
  }
  return { DataForSEOClient };
});

import { checkArticle, unionAnswer, rowRank, citesSite, ARTICLE_COLUMNS } from '../../supabase/functions/seo-api/handlers/answer-check.ts';

const PAGE = { url: 'https://www.materialshub.gr/el/ideas/plakakia-mpaniou', content_text: 'page text', fetched_at: '2026-10-01' };

function fakeDb() {
  const inserted: Record<string, unknown>[] = [];
  const pageFilters: { method: string; args: unknown[] }[] = [];
  const researchIds: unknown[] = [];
  const chain = (table: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'not', 'order', 'in']) {
      b[m] = (...args: unknown[]) => {
        if (table === 'user_website_pages' && (m === 'in' || m === 'or')) pageFilters.push({ method: m, args });
        if (table === 'seo_keyword_research' && m === 'eq') researchIds.push(args[1]);
        return b;
      };
    }
    b.limit = async () => ({ data: table === 'user_website_pages' ? [PAGE] : [] });
    b.maybeSingle = async () => ({ data: { research_data: { readerQuestions: ['πόσα πλακάκια χρειάζομαι'] } } });
    b.insert = async (row: Record<string, unknown>) => {
      inserted.push(row);
      return { error: null };
    };
    return b;
  };
  return { db: { from: chain } as never, inserted, pageFilters, researchIds };
}

const ARTICLE = {
  id: 'a1', user_id: 'u1', workspace_id: 'w1', website_id: 's1', slug: 'plakakia-mpaniou', published_url: null,
  target_keyword: 'πλακάκια μπάνιου', markdown_content: '# x',
  stages_data: { extra: { lessons: [], language_code: 'el', location_code: 2300, keyword_research_id: 'r1' } },
};

const answer = (text: string, urls: string[]) => async () => ({
  text, references: urls.map((url) => ({ url, domain: new URL(url).host.replace(/^www\./, ''), title: '' })),
});

beforeEach(() => {
  h.calls.length = 0;
  h.reserves.length = 0;
  h.settles.length = 0;
  h.reserveFails.clear();
  h.cost = { aiModeAnswer: 0.004, chatGptAnswer: 0.0306, perplexityAnswer: 0.006 };
  h.answers = {
    aiModeAnswer: answer('Google says grout matters.', ['https://materialshub.gr/el/ideas/plakakia-mpaniou']),
    chatGptAnswer: answer('ChatGPT says R10 for floors.', ['https://leroymerlin.gr/x?a=1']),
    perplexityAnswer: answer('Perplexity says 20×60 for walls.', ['https://www.materialshub.gr/el/other']),
  };
  h.coverage.mockReset();
  h.coverage.mockResolvedValue({ missing: [{ point: 'R10', source: 'ai_answer' }], checked: 2, credits: 5, checked_at: 'now' });
});

describe('answer check — every engine is asked and recorded on its own', () => {
  it('asks Google AI Mode, ChatGPT and Perplexity, each reserved and settled at its own reported cost', async () => {
    const { db, inserted } = fakeDb();
    const res = await checkArticle(db, ARTICLE);

    expect(h.calls.map((c) => c.method).sort()).toEqual(['aiModeAnswer', 'chatGptAnswer', 'perplexityAnswer']);
    expect(h.reserves).toHaveLength(3);
    expect(h.settles.map((s) => s.actual).sort()).toEqual([0.4, 0.6, 3.1].sort());
    expect(h.calls.find((c) => c.method === 'chatGptAnswer')?.args).toEqual(['πλακάκια μπάνιου', 'GR']);
    expect(h.calls.find((c) => c.method === 'aiModeAnswer')?.args).toEqual(['πλακάκια μπάνιου', 2300, 'el']);

    expect(inserted.map((r) => r.engine)).toHaveLength(3);
    expect(inserted.at(-1)?.engine).toBe('google_ai_mode');
    const byEngine = Object.fromEntries(inserted.map((r) => [r.engine, r]));
    expect(byEngine.google_ai_mode.our_domain_cited).toBe(true);
    expect(byEngine.chatgpt.our_domain_cited).toBe(false);
    expect(byEngine.perplexity.our_domain_cited).toBe(true);
    for (const r of inserted) expect(r.status).toBe('ok');
    expect(inserted.reduce((sum, r) => sum + Number(r.credits), 0)).toBeCloseTo(0.4 + 3.1 + 0.6 + 5);
    expect(res).toMatchObject({ status: 'ok', missing: 1 });
  });

  it('runs the coverage check once, on every answer together', async () => {
    const { db, inserted } = fakeDb();
    await checkArticle(db, ARTICLE);
    expect(h.coverage).toHaveBeenCalledTimes(1);
    const union = h.coverage.mock.calls[0][1].mustCover.aiAnswer as string;
    for (const part of ['[Google AI Mode]', 'grout', '[ChatGPT]', 'R10', '[Perplexity]', '20×60']) expect(union).toContain(part);
    for (const r of inserted) expect(r.missing).toEqual([{ point: 'R10', source: 'ai_answer' }]);
  });

  it('a failing engine records a failed row and the others still run', async () => {
    h.answers.chatGptAnswer = async () => { throw new Error('DataForSEO /ai_optimization/chat_gpt error (500)'); };
    const { db, inserted } = fakeDb();
    const res = await checkArticle(db, ARTICLE);
    const byEngine = Object.fromEntries(inserted.map((r) => [r.engine, r]));
    expect(byEngine.chatgpt).toMatchObject({ status: 'failed', error: expect.stringContaining('(500)') });
    expect(byEngine.google_ai_mode.status).toBe('ok');
    expect(byEngine.perplexity.status).toBe('ok');
    expect(h.coverage.mock.calls[0][1].mustCover.aiAnswer).not.toContain('[ChatGPT]');
    expect(h.settles).toHaveLength(3);
    expect(res.status).toBe('ok');
    expect(inserted[0].engine).toBe('chatgpt');
  });

  it('an engine whose reservation is refused is never called', async () => {
    h.reserveFails.add('Perplexity');
    const { db, inserted } = fakeDb();
    await checkArticle(db, ARTICLE);
    expect(h.calls.map((c) => c.method)).not.toContain('perplexityAnswer');
    const row = inserted.find((r) => r.engine === 'perplexity');
    expect(row).toMatchObject({ status: 'failed', error: 'not checked: Insufficient credits', credits: 0 });
  });

  it('no engine answered: no coverage call, every engine still gets a row', async () => {
    h.answers.aiModeAnswer = async () => null;
    h.answers.chatGptAnswer = async () => null;
    h.answers.perplexityAnswer = async () => { throw new Error('boom'); };
    const { db, inserted } = fakeDb();
    const res = await checkArticle(db, ARTICLE);
    expect(h.coverage).not.toHaveBeenCalled();
    expect(inserted.map((r) => [r.engine, r.status]).sort()).toEqual([
      ['chatgpt', 'no_answer'], ['google_ai_mode', 'no_answer'], ['perplexity', 'failed'],
    ]);
    expect(res.status).toBe('failed');
  });
});

describe('answer check — which article and which page', () => {
  it('selects only real seo_articles columns (keyword_research_id lives in stages_data.extra)', () => {
    const real = new Set(('id,user_id,workspace_id,target_keyword,content_type,content_brief,status,progress_percentage,current_stage,'
      + 'pipeline_log,stages_data,markdown_content,title,meta_description,slug,seo_score,readability_score,word_count,'
      + 'interlinking_data,error_message,created_at,updated_at,completed_at,website_id,idempotency_key,last_reviewed_at,'
      + 'refresh_interval_days,refresh_snoozed_until,refresh_notified_at,previous_markdown,previous_markdown_at,'
      + 'previous_markdown_label,published_url,published_at').split(','));
    const selected = ARTICLE_COLUMNS.split(',').map((c) => c.trim());
    expect(selected.filter((c) => !real.has(c))).toEqual([]);
    expect(selected).toContain('published_url');
  });

  it('reads the research row named in stages_data.extra', async () => {
    const { db, researchIds } = fakeDb();
    await checkArticle(db, ARTICLE);
    expect(researchIds).toEqual(['r1']);
  });

  it('matches the page by published_url when it is set, never by slug', async () => {
    const { db, pageFilters } = fakeDb();
    await checkArticle(db, { ...ARTICLE, published_url: 'https://materialshub.gr/el/ideas/plakakia-mpaniou/ ' });
    expect(pageFilters).toEqual([{
      method: 'in',
      args: ['url', ['https://materialshub.gr/el/ideas/plakakia-mpaniou', 'https://materialshub.gr/el/ideas/plakakia-mpaniou/']],
    }]);
  });

  it('falls back to the slug when there is no published_url', async () => {
    const { db, pageFilters } = fakeDb();
    await checkArticle(db, ARTICLE);
    expect(pageFilters).toHaveLength(1);
    expect(pageFilters[0].method).toBe('or');
  });
});

describe('answer check — pure parts', () => {
  it('one answer keeps the whole budget; several share it', () => {
    expect(unionAnswer([{ label: 'A', text: 'x'.repeat(5000) }])).toHaveLength(3400);
    const u = unionAnswer([{ label: 'A', text: 'a'.repeat(5000) }, { label: 'B', text: 'b'.repeat(5000) }, { label: 'C', text: '' }])!;
    expect(u.length).toBeLessThanOrEqual(3400);
    expect(u).toContain('[A]');
    expect(u).toContain('[B]');
    expect(u).not.toContain('[C]');
    expect(unionAnswer([{ label: 'A', text: '  ' }])).toBeNull();
  });

  it('Google AI Mode answered is inserted last, so the newest row is still the one the panel reads', () => {
    const rows = [
      { engine: 'google_ai_mode', status: 'ok' }, { engine: 'chatgpt', status: 'ok' }, { engine: 'perplexity', status: 'failed' },
    ].sort((a, b) => rowRank(a) - rowRank(b));
    expect(rows.map((r) => r.engine)).toEqual(['perplexity', 'chatgpt', 'google_ai_mode']);
  });

  it('a citation counts by page host or by reported domain, ignoring www', () => {
    const a = { text: '', references: [{ url: 'https://x.com/p', domain: 'www.materialshub.gr/', title: '' }] };
    expect(citesSite(a, 'materialshub.gr')).toBe(true);
    expect(citesSite(a, null)).toBe(false);
    expect(citesSite({ text: '', references: [] }, 'materialshub.gr')).toBe(false);
  });
});
