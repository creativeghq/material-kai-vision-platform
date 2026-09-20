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
