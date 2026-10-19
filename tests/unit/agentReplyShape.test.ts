import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { INTERNAL_RESULT_TYPES, isResultCardRow, layoutTurns, type TurnMessage } from '../../src/components/features/ai/agentTurnShape';

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));
const HUB = code('src/components/features/ai/AgentHub.tsx');
const CHAT = code('supabase/functions/agent-chat/index.ts');

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

describe('a tool result cannot flood the model', () => {
  it('every tool message goes through the cap', () => {
    expect(CHAT).toContain('function capToolResultForModel');
    const pushes = CHAT.match(/toolMessages\.push\(\{\s*role: 'tool',\s*content: [^\n]+/g) ?? [];
    const success = pushes.filter((p) => !p.includes('`Error:'));
    expect(success.length).toBeGreaterThan(0);
    for (const p of success) expect(p).toContain('capToolResultForModel(');
  });
});
