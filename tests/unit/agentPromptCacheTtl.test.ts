/** agent-chat's cached prefix: what lives an hour, what is billed for it, and what stays out of it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
const agentChat = read('supabase/functions/agent-chat/index.ts');
const loadToolkit = read('supabase/functions/_shared/tools/toolkit-tools.ts');
const shape = read('supabase/functions/_shared/tool-result-shape.ts');

describe('the stable system block is cached for an hour', () => {
  it('only the stable half carries the 1h TTL; the per-turn half stays at 5 minutes', () => {
    expect(agentChat).toMatch(
      /text: systemText\.slice\(0, splitAt\), cache_control: \{ type: 'ephemeral', ttl: '1h' \}/,
    );
    expect(agentChat).toMatch(/text: systemText\.slice\(splitAt\), cache_control: \{ type: 'ephemeral' \}/);
  });

  it('1h writes are read off the usage and billed separately', () => {
    expect(agentChat).toMatch(/cache_creation\?\.ephemeral_1h_input_tokens/);
    expect(agentChat).toMatch(/p_cache_write_1h_tokens: usage\.cacheWrite1hTokens \?\? 0/);
  });
});

describe('a toolkit guide travels with its toolkit', () => {
  it('is read from the prompt store for bound, non-always-on toolkits, inside the cached prefix', () => {
    const guides = agentChat.indexOf("tryLoadPrompt(supabase, 'tool', 'toolkit_guide', `${agentId}.${toolkitId}`)");
    expect(guides).toBeGreaterThan(-1);
    expect(agentChat).toMatch(/activeToolkitIds\.filter\(\(id\) => !TOOLKIT_CLUSTERS\[id\]\?\.alwaysOn\)\.map\(toolkitGuide\)/);
    expect(guides).toBeLessThan(agentChat.indexOf('const systemCachePrefix = systemPrompt;'));
  });

  it('a mid-turn load returns the guide under a key the result shaper never clips', () => {
    expect(agentChat).toMatch(/const guide = await toolkitGuide\(toolkitId\);/);
    expect(loadToolkit).toMatch(/res\.guide \? \{ guidance: res\.guide \}/);
    expect(shape).toMatch(/NEVER_SHAPED = new Set\(\[[\s\S]*'guidance'/);
  });
});
