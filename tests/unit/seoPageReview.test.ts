import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';
import { clampAtWord, keepKnownLinks } from '../../supabase/functions/seo-api/handlers/page-review-rules';
import { VOCABULARIES } from '../../scripts/gen-vocabularies.mjs';
import {
  PAGE_LIST_FILTERS, PAGE_RECOMMENDATION_KINDS, PAGE_RECOMMENDATION_STATUSES, PAGE_REVIEW_VERDICTS,
} from '@/services/seo/pageReviewVocabulary';

const CRAWLER = 'supabase/functions/crawl-user-website/index.ts';
const REVIEW = 'supabase/functions/seo-api/handlers/page-review.ts';
const TOOL = 'supabase/functions/_shared/tools/seo-tools.ts';

describe('page review (#399)', () => {
  it('the vocabulary is mirrored to Deno, as is the check catalogue the review reads', () => {
    const sources = (VOCABULARIES as [string, string][]).map(([src]) => src);
    expect(sources).toContain('src/services/seo/pageReviewVocabulary.ts');
    expect(sources).toContain('src/components/core/Profile/seo/onPageChecks.ts');
    expect(PAGE_REVIEW_VERDICTS).toEqual(['fine', 'improve', 'rewrite']);
    expect(PAGE_RECOMMENDATION_KINDS).toEqual(['title', 'description', 'h1', 'content_gap', 'internal_link']);
    expect(PAGE_RECOMMENDATION_STATUSES).toEqual(['open', 'applied', 'dismissed', 'stale']);
    expect(PAGE_LIST_FILTERS.length).toBeGreaterThan(0);
  });

  it('the crawler closes the lifecycle AFTER the page row is written, from the row it wrote', () => {
    const src = strippedSource(CRAWLER);
    const upsert = src.indexOf("const { data: written, error } = await supabase.from('user_website_pages').upsert(");
    const outcomes = src.indexOf("supabase.rpc('apply_page_recommendation_outcomes', { p_page_id: written.id })");
    expect(upsert).toBeGreaterThan(-1);
    expect(outcomes).toBeGreaterThan(upsert);
  });

  it('the review prompt comes from the database, and the debit comes before the model call', () => {
    const src = strippedSource(REVIEW);
    expect(src).toContain("getToolPrompt(supabase, 'seo_page_reviewer')");
    expect(src).not.toMatch(/system:\s*['"`]/);
    const reserve = src.indexOf('await reserveStage(');
    const call = src.indexOf('await callClaudeMessages(');
    expect(reserve).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(reserve);
    expect(src).toContain('<page_content>');
    expect(src.indexOf('keepKnownLinks(')).toBeGreaterThan(call);
  });

  it('the agent tool asks the module gate before it spends anything', () => {
    const src = strippedSource(TOOL);
    const body = src.slice(src.indexOf('export const createSEOPageReviewTool'));
    const gate = body.indexOf("moduleGate(workspaceId, 'seo-toolkit')");
    const call = body.indexOf("callSEOFunction('seo-page-review'");
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
  });

  it('a link the model invents, or one the page already has, is dropped', () => {
    const siblings = [{ url: 'https://ex.gr/a/' }, { url: 'https://ex.gr/b' }];
    const kept = keepKnownLinks(
      [{ to_url: 'https://ex.gr/a' }, { to_url: 'https://ex.gr/made-up' }, { to_url: 'https://ex.gr/b/' }, { to_url: 'https://ex.gr/a/' }],
      siblings,
      ['https://ex.gr/b'],
    );
    expect(kept.map((l) => l.to_url)).toEqual(['https://ex.gr/a']);
  });

  it('a proposed title is cut on a word, never mid-word', () => {
    expect(clampAtWord('Short title', 60)).toBe('Short title');
    const long = 'Πλακάκια μπάνιου πορσελάνης σε μεγάλες διαστάσεις για κάθε στυλ και προϋπολογισμό';
    const cut = clampAtWord(long, 60);
    expect(cut.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(cut)).toBe(true);
    expect(long[cut.length]).toBe(' ');
  });
});
