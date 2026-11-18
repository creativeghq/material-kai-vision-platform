import { describe, it, expect } from 'vitest';

import { normalizeUsage, tokenCostParts, usageCostUsd } from '../../supabase/functions/_shared/ai-logger';
import { CLAUDE_OPUS, markStablePrefix, shapeClaudeRequest } from '../../supabase/functions/_shared/claude-models';
import { sourceIndex } from '../helpers/sourceIndex';

const OPUS = { input: 4, output: 20, cacheRead: 0.05, cacheWrite: 1.25 };

describe('tokenCostParts prices cache terms like mivaa ai_pricing.calculate_cost', () => {
  it('bills reads and writes on the input side at their multipliers', () => {
    const { input, output } = tokenCostParts(OPUS, 1000, 100, { read: 2000, write: 500 });
    expect(input).toBeCloseTo((1000 + 2000 * 0.05 + 500 * 1.25) / 1e6 * 4, 12);
    expect(output).toBeCloseTo(100 / 1e6 * 20, 12);
  });

  it('falls back to 0.10 / 1.25 when the price row has no multipliers', () => {
    const { input } = tokenCostParts({ input: 4, output: 20 }, 0, 0, { read: 1000, write: 1000 });
    expect(input).toBeCloseTo((1000 * 0.10 + 1000 * 1.25) / 1e6 * 4, 12);
  });

  it('picks the long-context card from the WHOLE prompt, cache included', () => {
    const price = { input: 1, output: 1, longThreshold: 1000, longInput: 2, longOutput: 2 };
    expect(tokenCostParts(price, 600, 0, { read: 600 }).input).toBeCloseTo((600 + 60) / 1e6 * 2, 12);
  });
});

describe('normalizeUsage reads every usage shape', () => {
  it('raw Messages API: input_tokens already excludes the cache', () => {
    expect(normalizeUsage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 90 }))
      .toEqual({ inputTokens: 10, outputTokens: 5, cache: { read: 900, write: 90 } });
  });

  it('AIGenerateResult.usage: inputTokens is the whole prompt, uncachedInputTokens the rest', () => {
    expect(normalizeUsage({ inputTokens: 1000, outputTokens: 5, uncachedInputTokens: 10, cacheReadTokens: 900, cacheWriteTokens: 90 }))
      .toEqual({ inputTokens: 10, outputTokens: 5, cache: { read: 900, write: 90 } });
  });

  it('a hand-built or Gemini usage has no cache terms', () => {
    expect(normalizeUsage({ inputTokens: 1000, outputTokens: 5 })).toEqual({ inputTokens: 1000, outputTokens: 5, cache: { read: 0, write: 0 } });
    expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cache: { read: 0, write: 0 } });
  });

  it('usageCostUsd of a cached call is cheaper than the same prompt uncached', () => {
    const cached = usageCostUsd(OPUS, { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 9900 });
    const cold = usageCostUsd(OPUS, { input_tokens: 10000, output_tokens: 0 });
    expect(cached).toBeLessThan(cold / 5);
  });
});

describe('markStablePrefix', () => {
  it('ends the cached prefix at the system prompt', () => {
    const out = markStablePrefix({ model: CLAUDE_OPUS, system: 'Stable.', tools: [{ name: 't' }], messages: [] });
    expect(out.system).toEqual([{ type: 'text', text: 'Stable.', cache_control: { type: 'ephemeral' } }]);
    expect(out.tools).toEqual([{ name: 't' }]);
  });

  it('uses the last tool when there is no system prompt', () => {
    const out = markStablePrefix({ model: CLAUDE_OPUS, tools: [{ name: 'a' }, { name: 'b' }], messages: [] });
    expect(out.tools).toEqual([{ name: 'a' }, { name: 'b', cache_control: { type: 'ephemeral' } }]);
  });

  it('leaves a caller-placed breakpoint alone', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'p', cache_control: { type: 'ephemeral' } }] }];
    expect(markStablePrefix({ model: CLAUDE_OPUS, system: 'Stable.', messages }).system).toBe('Stable.');
  });

  it('is not part of shapeClaudeRequest, which raw-fetch callers price by input_tokens', () => {
    expect(shapeClaudeRequest({ model: CLAUDE_OPUS, system: 'Stable.', messages: [] }).system).toBe('Stable.');
  });
});

const INDEX = sourceIndex({ roots: ['supabase/functions'] });
const CACHED_CALL = /callClaudeMessages\(|generate(Structured)?WithClaude(Tools)?\(/;
const PRICED_BY_INPUT_ALONE = [
  /(tokenCostUsd|tokenCostParts|creditsForTokens)\([^)]*usage\??\.(input_tokens|inputTokens)/,
  /usage\??\.inputTokens\s*\/\s*1e6/,
  /tokenCredits\([^)]*\{\s*inputTokens:\s*Number\(\w+\.usage\?\.input_tokens/,
];

describe('a cached Claude call is never priced by its input count alone', () => {
  it('no caller of the shared Claude helpers hand-prices input_tokens', () => {
    const offenders: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      if (file.replace(/\\/g, '/').endsWith('_shared/ai-client.ts') || !CACHED_CALL.test(src)) continue;
      for (const re of PRICED_BY_INPUT_ALONE) if (re.test(src)) offenders.push(`${file}: ${re}`);
    }
    expect(offenders, 'price with usageCostUsd(price, usage) / tokenCredits(model, usage)').toEqual([]);
  });
});
