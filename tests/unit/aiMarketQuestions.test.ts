import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blankComments } from '../helpers/stripComments';

const MENTIONS = join(process.cwd(), 'supabase/functions/seo-api/handlers/llm-mentions.ts');

describe('market questions come from a topic search of the corpus (#501)', () => {
  it('folds a question found by two topics into one row and splits our sources from rivals', async () => {
    const { mergeMarketQuestions } = await import('../../supabase/functions/seo-api/handlers/market-questions.ts');
    const item = {
      question: 'πλακάκια μεγάλων διαστάσεων',
      ai_search_volume: 260,
      sources: [
        { domain: 'www.materialshub.gr', url: 'https://www.materialshub.gr/p', title: 'Ours', position: 2 },
        { domain: 'www.youbath.gr', url: 'https://www.youbath.gr/x', position: 1 },
      ],
    };
    const rows = mergeMarketQuestions(
      [{ topic: 'πλακάκια', items: [item] }, { topic: 'πλακάκια μπάνιου', items: [{ ...item, question: ' Πλακάκια μεγάλων διαστάσεων ' }] }],
      'materialshub.gr', 'google',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].topics).toEqual(['πλακάκια', 'πλακάκια μπάνιου']);
    expect(rows[0].our_sources).toEqual([{ url: 'https://www.materialshub.gr/p', title: 'Ours', position: 2 }]);
    expect(rows[0].rival_sources.map((s) => s.domain)).toEqual(['youbath.gr']);
    expect(rows[0].source_count).toBe(2);
  });

  it('names a rival once however often the answer cites it', async () => {
    const { mergeMarketQuestions } = await import('../../supabase/functions/seo-api/handlers/market-questions.ts');
    const [row] = mergeMarketQuestions([{ topic: 't', items: [{
      question: 'q', sources: [{ domain: 'www.a.gr', url: '1' }, { domain: 'a.gr', url: '2' }, { domain: 'b.gr', url: '3' }],
    }] }], 'ours.gr', 'google');
    expect(row.rival_sources.map((s) => s.domain)).toEqual(['a.gr', 'b.gr']);
  });

  it('drops an item with no question rather than storing an empty row', async () => {
    const { mergeMarketQuestions } = await import('../../supabase/functions/seo-api/handlers/market-questions.ts');
    expect(mergeMarketQuestions([{ topic: 't', items: [{ answer: 'x' }, { question: '  ' }] }], 'a.gr', 'google')).toEqual([]);
  });

  it('searches the QUESTION text, and a failed or unreadable search is never no_data', () => {
    const code = blankComments(readFileSync(MENTIONS, 'utf8'));
    expect(code).toContain("keyword: topic, keyword_scope: ['question']");
    expect(code).toContain("status: 'collector_failed', note: `Every topic search failed");
    expect(code).toMatch(/shape \? 'collector_failed' : 'no_data'/);
    expect(code).toContain("db.from('website_ai_market_questions').upsert");
    expect(code).toContain("db.rpc('website_ai_question_topics'");
  });
});
