import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { TOOLKIT_CLUSTERS } from '../../supabase/functions/_shared/toolkitClusters.generated';

/**
 * `load_toolkit` must only offer what the agent can actually load (#380).
 *
 * Measured over 90 days: `load_toolkit` was called 14 times and REFUSED 5 — a 36% failure
 * rate. Every refusal was a specialist reaching for a cluster its own `AGENT_CONFIGS` entry
 * does not list (`erp`→`stock`; `product-business`→`my-hr`, `hr`, `stock`,
 * `company-assets`). None was a discovery failure, which is why #380 declined Anthropic tool
 * search: a better search over the same menu would have fixed none of the five.
 *
 * The menu was simply wrong. `availableToolkitIds` was every non-`alwaysOn` cluster,
 * unfiltered by the agent's permitted set, and it goes into BOTH the tool description and the
 * schema's `.describe()` — so the model was handed entries it could only ever be refused on.
 * `kai` went 3 for 3 because it owns nearly everything, so its menu happened to be accurate.
 *
 * Then the refusal itself forbade the only true answer: `manage_stock`, `manage_hr`,
 * `manage_my_hr` and `manage_company_assets` are listed by the GENERALIST and by no
 * specialist, while the message ended "never suggest switching to a 'KAI' agent".
 */

const ROOT = join(__dirname, '..', '..');
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const src = read(AGENT_CHAT);

/** Per-agent `tools:` lists, parsed the same way `toolkitCoverage.test.ts` parses the union. */
function agentToolLists(): Map<string, Set<string>> {
  const start = src.indexOf('const AGENT_CONFIGS');
  expect(start, 'AGENT_CONFIGS not found — this guard is reading the wrong file').toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('\n};', start) + 3);

  const out = new Map<string, Set<string>>();
  // Each entry looks like `  kai: {\n    id: 'kai',\n ... tools: [ ... ],\n  },`
  for (const m of block.matchAll(/\n {2}'?([a-zA-Z0-9_-]+)'?:\s*\{([\s\S]*?)\n {2}\},/g)) {
    const [, key, body] = m;
    const toolsMatch = body.match(/tools:\s*\[([\s\S]*?)\]/);
    if (!toolsMatch) continue;
    const ids = new Set([...toolsMatch[1].matchAll(/'([a-zA-Z0-9_]+)'/g)].map((q) => q[1]));
    out.set(key, ids);
  }
  return out;
}

const agents = agentToolLists();

/** The rule the call site uses: a non-alwaysOn cluster with at least one permitted tool. */
const loadableFor = (tools: Set<string>) =>
  Object.keys(TOOLKIT_CLUSTERS)
    .filter((id) => !(TOOLKIT_CLUSTERS as any)[id].alwaysOn)
    .filter((id) => (TOOLKIT_CLUSTERS as any)[id].tool_ids.some((t: string) => tools.has(t)));

describe('#380 — the parse finds a real roster', () => {
  it('reads several agents, each with a plausible tool list', () => {
    // Every case below is derived from this parse. If the slice stops matching, the sets go
    // empty and the assertions would pass by comparing nothing to nothing.
    expect(agents.size).toBeGreaterThan(3);
    expect(agents.has('kai')).toBe(true);
    expect(agents.get('kai')!.size).toBeGreaterThan(50);
  });
});

describe('#380 — the menu is filtered to what the agent can load', () => {
  it('the call site intersects the advertised list with the permitted set', () => {
    // `availableToolkitIds` reaches the model twice — the description and the schema
    // `.describe()`. An unfiltered list is a menu with poisoned entries, and no amount of
    // prompt wording fixes a menu.
    const i = src.indexOf('const loadableToolkitIds');
    expect(i, 'loadableToolkitIds not found').toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('createLoadToolkitTool', i));
    expect(block).toContain('alwaysOn');
    expect(
      block,
      'loadableToolkitIds no longer intersects with agentFullToolIds — the agent is being '
        + 'offered clusters it cannot load, which is the 36% refusal rate of #380',
    ).toContain('agentFullToolIds');
  });

  it('an agent with nothing loadable gets no escape hatch at all', () => {
    // "Available toolkits: " with an empty list invites a guess, and every guess is a refusal.
    const i = src.indexOf('const loadableToolkitIds');
    const block = src.slice(i, src.indexOf('\n  }', src.indexOf('createLoadToolkitTool', i)));
    expect(block).toMatch(/loadableToolkitIds\.length\s*>\s*0/);
  });

  it('the five measured refusals are no longer reachable', () => {
    // Stable under either resolution #380 proposed: the pair is fixed whether the agent stops
    // being offered the cluster, or is widened to own it. What must never be true again is
    // "advertised but unloadable".
    const measured: Array<[string, string]> = [
      ['erp', 'stock'],
      ['product-business', 'my-hr'],
      ['product-business', 'hr'],
      ['product-business', 'stock'],
      ['product-business', 'company-assets'],
    ];
    for (const [agentId, toolkitId] of measured) {
      const tools = agents.get(agentId);
      if (!tools) continue; // agent removed — no longer a live pair
      if (!(toolkitId in TOOLKIT_CLUSTERS)) continue; // cluster renamed
      const advertised = loadableFor(tools).includes(toolkitId);
      const canLoad = (TOOLKIT_CLUSTERS as any)[toolkitId].tool_ids.some((t: string) => tools.has(t));
      expect(
        !advertised || canLoad,
        `${agentId} is offered the "${toolkitId}" toolkit but cannot load any of it`,
      ).toBe(true);
    }
  });
});

describe('#380 — the refusal can name the real owner', () => {
  it('it derives the owner from AGENT_CONFIGS instead of forbidding the answer', () => {
    const i = src.indexOf('const allowedIds = def.tool_ids.filter');
    expect(i).toBeGreaterThan(-1);
    // Comments stripped: the replacement's own explanation QUOTES the old phrase to say why
    // it went, and a naive scan would flag its own footnote. Same reason documentEvents.test.ts
    // strips before scanning for legacy counters.
    const block = stripComments(src.slice(i, i + 3000));
    expect(block).toContain('AGENT_CONFIGS');
    expect(
      block,
      'the refusal again forbids naming the generalist — on the measured refusals that '
        + 'leaves nothing true to say, because the generalist IS the owner',
    ).not.toMatch(/never suggest switching/);
  });

  it('every toolkit a refusal can mention has an owner to name', () => {
    // A cluster nobody lists cannot be loaded by anyone, so `load_toolkit` would now advertise
    // it to nobody — it is dead, not merely someone else's. Same unreachability shape the
    // toolkit coverage guard exists for, reached from the other side.
    const ownerless = Object.keys(TOOLKIT_CLUSTERS).filter((id) => {
      const ids: string[] = (TOOLKIT_CLUSTERS as any)[id].tool_ids ?? [];
      return ids.length > 0 && ![...agents.values()].some((t) => ids.some((x) => t.has(x)));
    });
    expect(
      ownerless,
      `toolkit cluster(s) no agent lists a single tool of — unreachable by every agent, so `
        + `nothing can ever load them: ${ownerless.join(', ')}`,
    ).toEqual([]);
  });
});
