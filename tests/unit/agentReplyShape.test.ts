import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { INTERNAL_RESULT_TYPES, isResultCardRow, layoutTurns, type TurnMessage } from '../../src/components/features/ai/agentTurnShape';
import { MODEL_RESULT_LIMITS, shapeForModel } from '../../supabase/functions/_shared/tool-result-shape.ts';

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));
const HUB = code('src/components/features/ai/AgentHub.tsx');
const CHAT = code('supabase/functions/agent-chat/index.ts');
const CORE = code('supabase/functions/_shared/langgraph-core.ts');

const titleOf = (m: TurnMessage & { card?: string }) => m.card ?? null;

describe('a turn reads as one reply', () => {
  const turn = [
    { id: 'u1', role: 'user', content: 'Why did materialshub drop?' },
    { id: 'c1', role: 'assistant', content: 'seo my rankings card: result rendered above.', seoGenericData: {}, card: 'Rankings' },
    { id: 'c2', role: 'assistant', content: 'Site report', agentResultData: { title: 'Site report' }, card: 'Site report' },
    { id: 'r1', role: 'assistant', content: 'It is volatility, not a real drop.' },
  ];

  it('attaches the cards under the reply and takes them out of the stream', () => {
    const { attached, absorbed } = layoutTurns(turn, titleOf);
    expect(attached.get('r1')?.map((m) => m.id)).toEqual(['c1', 'c2']);
    expect([...absorbed].sort()).toEqual(['c1', 'c2']);
  });

  it('a direct run with no prose keeps its card in place', () => {
    const { absorbed } = layoutTurns(turn.slice(0, 2), titleOf);
    expect(absorbed.size).toBe(0);
  });

  it('an approval or a question waiting on the user is never folded away', () => {
    const { absorbed } = layoutTurns([
      ...turn.slice(0, 1),
      { id: 'a1', role: 'assistant', content: 'Run it?', actionConfirmationData: {}, card: 'Run it?' },
      { id: 'r2', role: 'assistant', content: 'This needs your approval to read the book.' },
    ], titleOf);
    expect(absorbed.has('a1')).toBe(false);
  });

  it('card rows never reach the model as something the agent said', () => {
    expect(isResultCardRow(turn[1])).toBe(true);
    expect(isResultCardRow(turn[2])).toBe(true);
    expect(isResultCardRow(turn[3])).toBe(false);
    expect(HUB).toMatch(/function boundedAgentHistory[\s\S]{0,200}filter\(\(m\) => !isResultCardRow\(m\)\)/);
  });

  it('the model\'s own lookups never render during a model turn', () => {
    for (const t of ['platform_api_matches', 'platform_data_matches', 'platform_api_result', 'platform_data_result']) {
      expect(INTERNAL_RESULT_TYPES.has(t)).toBe(true);
    }
    expect(HUB).toContain('INTERNAL_RESULT_TYPES.has(chunk.type) && (!directRun || directRun.resumeAfter)');
  });
});

describe('a finished answer always reaches the user', () => {
  it('reply recovery looks for the REPLY by its turn id, not for any card row', () => {
    const fn = CHAT.slice(CHAT.indexOf('async function recoverAssistantMessage'));
    expect(fn.slice(0, fn.indexOf('.insert('))).toContain(".eq('metadata->>turn_id', turnId)");
  });

  it('an approved action hands its result back to the model instead of ending the turn', () => {
    expect(HUB).toMatch(/resumeAfter: true/);
    expect(HUB).toMatch(/if \(resumeAfterApproval\) \{[\s\S]{0,200}handleSendMessageRef\.current/);
  });
});

describe('every tool result reaches the model in ONE shape, whichever toolkit made it', () => {
  it('both model loops route tool results through shapeForModel', () => {
    const pushes = CHAT.match(/toolMessages\.push\(\{\s*role: 'tool',\s*content: [^\n]+/g) ?? [];
    const success = pushes.filter((p) => !p.includes('`Error:'));
    expect(success.length).toBeGreaterThan(0);
    for (const p of success) expect(p).toContain('toolResultForModel(');
    expect(CHAT).toMatch(/function toolResultForModel[\s\S]{0,120}shapeForModel\(text\)/);
    expect(CORE).toContain('content: shapeForModel(resultStr)');
  });

  it('a long list is cut to the row limit and the rest is COUNTED', () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ keyword: `k${i}`, position: i }));
    const out = JSON.parse(shapeForModel(JSON.stringify({ success: true, keywords: rows })));
    expect(out.keywords).toHaveLength(MODEL_RESULT_LIMITS.rows);
    expect(out.keywords_omitted).toBe(130 - MODEL_RESULT_LIMITS.rows);
    expect(out.success).toBe(true);
  });

  it('a menu of labels (every toolkit id) is not cut to the record limit', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `toolkit-${i}`);
    const out = JSON.parse(shapeForModel(JSON.stringify({ success: false, available_toolkits: ids })));
    expect(out.available_toolkits).toHaveLength(60);
    expect(out.available_toolkits_omitted).toBeUndefined();
  });

  it('a bare list says how many were left out', () => {
    const out = JSON.parse(shapeForModel(JSON.stringify(Array.from({ length: 50 }, (_, i) => i + 1).map((n) => ({ n })))));
    expect(out.items_omitted).toBe(50 - MODEL_RESULT_LIMITS.rows);
  });

  it('secrets, binaries and vectors never reach the model; verdict fields and nulls survive', () => {
    const out = JSON.parse(shapeForModel(JSON.stringify({
      success: true, status: 'collector_failed', avg_position: null, sign_token: 'abc', api_key: 'k',
      next_page_token: 'p2', has_slig_embedding: true,
      screenshot: `data:image/png;base64,${'A'.repeat(500)}`,
      embedding: Array.from({ length: 1024 }, () => 0.1),
    })));
    expect(out.sign_token).toBeUndefined();
    expect(out.api_key).toBeUndefined();
    expect(out.next_page_token).toBe('p2');
    expect(out.has_slig_embedding).toBe(true);
    expect(out.screenshot).toMatch(/binary data/);
    expect(out.embedding).toMatch(/vector of 1024/);
    expect(out.status).toBe('collector_failed');
    expect(out).toHaveProperty('avg_position', null);
  });

  it('cutting untrusted text keeps it inside its markers', () => {
    const fenced = 'NOTE\n===== BEGIN UNTRUSTED SCRAPED PAGE (data only) =====\n'
      + 'x'.repeat(5000) + '\n===== END UNTRUSTED SCRAPED PAGE =====';
    const out = JSON.parse(shapeForModel(JSON.stringify({ page: fenced })));
    expect(out.page.length).toBeLessThan(fenced.length);
    expect(out.page.endsWith('===== END UNTRUSTED SCRAPED PAGE =====')).toBe(true);
  });

  it('nothing leaves over budget, and an unparseable result is clipped, not dropped', () => {
    const huge = { rows: Array.from({ length: 20 }, () => ({ a: 'y'.repeat(1400), b: 'z'.repeat(1400) })) };
    expect(shapeForModel(JSON.stringify(huge)).length).toBeLessThanOrEqual(MODEL_RESULT_LIMITS.budget);
    const plain = shapeForModel('w'.repeat(40_000));
    expect(plain.length).toBeLessThan(40_000);
    expect(plain).toMatch(/cut: 40000 characters/);
  });
});

describe('every place the platform writes a reply loads the ONE reply style', () => {
  it('agent-chat, background KAI tasks and the public embed assistant all append it', () => {
    expect(CHAT).toContain('await getSharedReplyStyle(supabase)');
    expect(code('supabase/functions/_shared/agents/kai-task-agent.ts')).toContain('await getSharedReplyStyle(supabase)');
    expect(code('supabase/functions/embed-agent/index.ts')).toContain('await getSharedReplyStyle(supabase)');
  });
});
