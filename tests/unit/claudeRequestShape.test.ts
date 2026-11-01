/** Every edge Claude request is rewritten into the form its model accepts. Twin of mivaa's test. */
import { describe, it, expect } from 'vitest';

import {
  CLAUDE_HAIKU, CLAUDE_OPUS, CLAUDE_SONNET, acceptsSamplingParams, langchainToolChoice, shapeClaudeRequest,
} from '../../supabase/functions/_shared/claude-models';

const forced = (model: string, extra: Record<string, unknown> = {}) => ({
  model, max_tokens: 300, messages: [], tools: [{ name: 'record' }],
  tool_choice: { type: 'tool', name: 'record' }, ...extra,
});

describe('shapeClaudeRequest', () => {
  it.each([CLAUDE_OPUS, CLAUDE_SONNET])('turns a forced tool into auto plus an instruction on %s', (model) => {
    const out = shapeClaudeRequest(forced(model, { system: 'Extract.' }));
    expect(out.tool_choice).toEqual({ type: 'auto' });
    expect(String(out.system)).toContain('`record` tool');
  });

  it('keeps Haiku forced and without thinking', () => {
    const out = shapeClaudeRequest(forced(CLAUDE_HAIKU));
    expect(out.tool_choice).toEqual({ type: 'tool', name: 'record' });
    expect(out.thinking).toEqual({ type: 'disabled' });
  });

  it('does not let a converted forced call spend a small budget thinking', () => {
    expect(shapeClaudeRequest(forced(CLAUDE_SONNET)).thinking).toEqual({ type: 'between_tools' });
    expect(shapeClaudeRequest(forced(CLAUDE_OPUS)).output_config).toEqual({ effort: 'low' });
  });

  it('maps disabled thinking to what each model accepts', () => {
    const off = { type: 'disabled' };
    const opus = shapeClaudeRequest({ model: CLAUDE_OPUS, thinking: off });
    expect(opus.thinking).toBeUndefined();
    expect(opus.output_config).toEqual({ effort: 'low' });
    expect(shapeClaudeRequest({ model: CLAUDE_SONNET, thinking: off }).thinking).toEqual({ type: 'between_tools' });
  });

  it('drops sampling parameters for every current model', () => {
    for (const model of [CLAUDE_OPUS, CLAUDE_SONNET, CLAUDE_HAIKU]) {
      expect(acceptsSamplingParams(model)).toBe(false);
      expect(shapeClaudeRequest({ model, temperature: 0.2, top_p: 0.9 })).not.toHaveProperty('temperature');
    }
  });

  it('appends the instruction as a block to a cached system prompt', () => {
    const system = [{ type: 'text', text: 'cached', cache_control: { type: 'ephemeral' } }];
    const out = shapeClaudeRequest(forced(CLAUDE_OPUS, { system }));
    expect(out.system).toHaveLength(2);
    expect((out.system as unknown[])[0]).toEqual(system[0]);
  });

  it('forces through LangChain only where the model allows it', () => {
    expect(langchainToolChoice(CLAUDE_OPUS, 'record').tool_choice).toBe('auto');
    expect(langchainToolChoice(CLAUDE_HAIKU, 'record').tool_choice).toEqual({ type: 'tool', name: 'record' });
  });
});
