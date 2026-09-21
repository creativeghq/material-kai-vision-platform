import { describe, expect, it } from 'vitest';
import { join } from 'path';

import { answerVerdict, displayHost, modelLabel, VERDICT_BADGE, VERDICT_LABEL } from '@/components/core/Profile/seo/aiCitations';
import { statusPresentation } from '@/components/core/Profile/seo/seoMetrics';
import { blankedSource } from '../helpers/sourceIndex';

const ROOT = join(__dirname, '..', '..');
const CARD = join(ROOT, 'src/components/core/Profile/seo/AiEngineCard.tsx');
const PANEL = join(ROOT, 'src/components/core/Profile/WebsiteAiVisibilityPanel.tsx');

describe('answerVerdict', () => {
  it('a failed call is failed, never "left you out"', () => {
    expect(answerVerdict({ error: 'HTTP 429 credit_balance_exhausted', mentioned: null })).toBe('failed');
    expect(answerVerdict({ error: 'HTTP 401', mentioned: false, brand_cited: false })).toBe('failed');
  });

  it('an assistant that never ran is not an assistant that left you out', () => {
    expect(answerVerdict(undefined)).toBe('not_run');
    expect(answerVerdict(null)).toBe('not_run');
  });

  it('cited outranks named — a link is the stronger fact', () => {
    expect(answerVerdict({ error: null, mentioned: true, brand_cited: true })).toBe('cited');
    expect(answerVerdict({ error: null, mentioned: false, brand_cited: true })).toBe('cited');
    expect(answerVerdict({ error: null, mentioned: true, brand_cited: false })).toBe('named');
  });

  it('an answered call that left us out says so', () => {
    expect(answerVerdict({ error: null, mentioned: false, brand_cited: false })).toBe('absent');
  });

  it('every verdict has a label and a badge tone', () => {
    for (const v of ['cited', 'named', 'absent', 'failed', 'not_run'] as const) {
      expect(VERDICT_LABEL[v]).toBeTruthy();
      expect(VERDICT_BADGE[v]).toBeTruthy();
    }
  });

  it('a failed verdict is never rendered with the tone of a normal absence', () => {
    expect(VERDICT_BADGE.failed).toBe('warning');
    expect(VERDICT_BADGE.absent).toBe('neutral');
  });
});

describe('a rate with no denominator is not zero', () => {
  it('the statuses the RPC emits all resolve to a stated placeholder, not a number', () => {
    for (const status of ['collector_failed', 'not_collected']) {
      const p = statusPresentation(status);
      expect(p.placeholder).toBeTruthy();
      expect(p.placeholder).not.toBe('0');
      expect(p.placeholder).not.toBe('0%');
    }
  });

  it('an unrecognised status fails closed rather than showing the raw number', () => {
    expect(statusPresentation('something_new_from_a_later_rpc').placeholder).toBe('Unknown');
  });

  it('the engine card gates every rate on its status before printing a percentage', () => {
    const src = blankedSource(CARD);
    expect(src).toMatch(/const present = rate\.status === 'ok' && rate\.value != null/);
    const reads = src.split('\n').filter((l) => l.includes('rate.value'));
    expect(reads.length).toBeGreaterThan(1);
    for (const line of reads) expect(line).toContain('present');
    expect(src).toContain('statusPresentation');
  });

  it('the verdict bar measures against probes, so a failed call keeps its width', () => {
    const src = blankedSource(CARD);
    expect(src).toMatch(/const total = Math\.max\(engine\.probes, 1\)/);
    expect(src).not.toMatch(/const total = Math\.max\(engine\.answered/);
  });

  it('the panel says once, at the top, when nothing browsed', () => {
    const src = blankedSource(PANEL);
    expect(src).toContain("report?.status === 'no_sources'");
    expect(src).toContain('noSources');
  });
});

describe('formatting', () => {
  it('names an assistant by its vendor, not its model string', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Claude');
    expect(modelLabel('gpt-5-mini')).toBe('ChatGPT');
    expect(modelLabel('sonar')).toBe('Perplexity');
    expect(modelLabel('gemini-2.0-flash')).toBe('Gemini');
  });

  it('an unknown model keeps its own id rather than being given a vendor we cannot verify', () => {
    expect(modelLabel('llama-4-maverick')).toBe('llama-4-maverick');
  });

  it('the same engine reached two ways reads as two surfaces, never one rate', () => {
    expect(modelLabel('dfs:chat_gpt')).toBe('ChatGPT · via DataForSEO');
    expect(modelLabel('dfs:gemini')).toBe('Gemini · via DataForSEO');
    expect(modelLabel('dfs:chat_gpt')).not.toBe(modelLabel('gpt-5-mini'));
  });

  it('a source reads as its host', () => {
    expect(displayHost('https://www.peptidesciences.com/tesamorelin?x=1')).toBe('peptidesciences.com');
    expect(displayHost('not a url')).toBe('not a url');
  });
});

describe('the verdict bar partitions its track', () => {
  it('reads the segments SQL derived instead of inferring them from totals', () => {
    const src = blankedSource(CARD);
    expect(src).toContain('engine.named_not_cited');
    expect(src).toContain('engine.absent');
    expect(src).not.toMatch(/engine\.named\s*-\s*engine\.cited/);
    expect(src).not.toMatch(/engine\.answered\s*-\s*engine\.named/);
  });
});

describe('an engine that never ran still gets a card', () => {
  it('a rostered assistant with no probes is not_collected, not absent', async () => {
    const { withRosterEngines } = await import('@/components/core/Profile/seo/aiCitations');
    const out = withRosterEngines([], [
      { model: 'claude-haiku-4-5-20251001', enabled: true },
      { model: 'gemini-2.0-flash', enabled: false },
    ]);
    expect(out).toHaveLength(2);
    const gemini = out.find((e) => e.model === 'gemini-2.0-flash')!;
    expect(gemini.status).toBe('not_collected');
    expect(gemini.citation_rate.value).toBeNull();
    expect(gemini.note).toContain('No API key');
  });

  it('an engine that did run is left exactly as the RPC derived it', async () => {
    const { withRosterEngines } = await import('@/components/core/Profile/seo/aiCitations');
    const real = { model: 'sonar', probes: 5, answered: 0, failed: 5 } as any;
    const out = withRosterEngines([real], [{ model: 'sonar', enabled: true }]);
    expect(out).toEqual([real]);
  });
});

describe('the column count comes from the roster, not from who answered', () => {
  it('the panel augments with the roster BEFORE sizing the grid', () => {
    const src = blankedSource(PANEL);
    const augment = src.indexOf('withRosterEngines(report?.engines');
    const sizing = src.indexOf('engineGridCols(engines.length)');
    expect(augment).toBeGreaterThan(-1);
    expect(sizing).toBeGreaterThan(augment);
    // Sizing on the probed list turned a missing key into a layout decision.
    expect(src).not.toMatch(/engineGridCols\(\s*\(?report/);
  });

  it('four rostered assistants lay out as four columns, three as three', async () => {
    const { engineGridCols } = await import('@/components/core/Profile/seo/AiEngineCard');
    expect(engineGridCols(4)).toContain('xl:grid-cols-4');
    expect(engineGridCols(3)).toContain('lg:grid-cols-3');
    expect(engineGridCols(1)).toBe('grid-cols-1');
    expect(engineGridCols(9)).toContain('grid-cols-');
  });
});

describe('three surfaces, three labels', () => {
  it('a scraped answer is not the API answer and not the DataForSEO one', () => {
    expect(modelLabel('scrape:chat_gpt')).toBe('ChatGPT · as a buyer sees it');
    expect(modelLabel('scrape:gemini')).toBe('Gemini · as a buyer sees it');
    const surfaces = new Set([
      modelLabel('gpt-5-mini'), modelLabel('dfs:chat_gpt'), modelLabel('scrape:chat_gpt'),
    ]);
    expect(surfaces.size).toBe(3);
  });
});
