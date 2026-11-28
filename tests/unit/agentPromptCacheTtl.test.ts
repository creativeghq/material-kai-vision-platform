/** agent-chat's cached prefix: what lives an hour, what is billed for it, and what stays out of it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { TOOLKITS } from '@/components/features/ai/agentToolsCatalog';

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

describe('a lean specialist binds its home clusters and names the rest', () => {
  it('every curated specialist binds only its home clusters, and every home cluster exists', () => {
    expect(agentChat).toMatch(/CURATED_SPECIALISTS\.has\(agentId\) && !homeClusters/);
    const curated = [...agentChat.match(/const CURATED_SPECIALISTS = new Set\(\[([^\]]*)\]\)/)![1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    const body = agentChat.match(/const SPECIALIST_HOME_CLUSTERS[^=]*= \{([\s\S]*?)\n {2}\};/)![1];
    const home = new Map([...body.matchAll(/'?([a-z0-9-]+)'?: \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1])]));
    for (const id of curated) expect(home.has(id), `${id} has no home clusters, so it binds its whole kit`).toBe(true);
    const known = new Set(TOOLKITS.map((t) => t.id));
    for (const [agent, ids] of home) for (const c of ids) expect(known.has(c), `${agent}: unknown cluster "${c}" binds nothing`).toBe(true);
  });

  it('the unbound clusters are listed with their tools, inside the cached prefix', () => {
    const hint = agentChat.indexOf('[TOOLKITS ON DEMAND]');
    expect(hint).toBeGreaterThan(-1);
    expect(hint).toBeLessThan(agentChat.indexOf('const systemCachePrefix = systemPrompt;'));
  });
});
