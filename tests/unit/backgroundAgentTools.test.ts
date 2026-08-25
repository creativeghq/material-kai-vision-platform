/**
 * A background agent's `defaultTools` must name only tools it actually BUILDS.
 *
 * `toolkitCoverage.test.ts` enforces exactly this for the chat surface — a tool in no cluster, or
 * with no factory, or listed by no agent, fails the build. The background agents in
 * `_shared/agents/` were outside all of it: they hand-roll their own tool objects and declare
 * their own `defaultTools`, with nothing comparing the two.
 *
 * What that cost, on 2026-08-25: `kai-task-agent` had listed `web_search` in `defaultTools` and in
 * its file header since it was written, and no factory for it existed. So every research task
 * dispatched from chat ran with workspace search only — and when both of those errored, the agent
 * did not stop. It wrote a confident 4,300-token report out of training data, headed
 * "Research date: 2025", for a question about which brands already have a Greek distributor.
 *
 * A declaration with no factory behind it is not a missing feature; it is a fabricated one.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const AGENT_DIR = join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'agents');

/** Files in `_shared/agents/` that are not themselves an AgentRunner. */
const NOT_RUNNERS = new Set(['base-agent.ts', 'types.ts', 'registry.ts', 'index.ts']);

interface AgentFile {
  file: string;
  src: string;
  declared: string[];
  /** Tool names the file constructs, read off the `name: '...'` of its inline tool objects. */
  built: Set<string>;
  /** True when the runLangGraphAgent call passes a literal empty tools array. */
  passesNoTools: boolean;
}

function collect(): AgentFile[] {
  const out: AgentFile[] = [];
  for (const entry of readdirSync(AGENT_DIR)) {
    if (!entry.endsWith('.ts') || NOT_RUNNERS.has(entry)) continue;
    const src = stripComments(readFileSync(join(AGENT_DIR, entry), 'utf8'));
    if (!src.includes('defaultTools')) continue;

    const m = src.match(/defaultTools[^=]*=\s*\[([^\]]*)\]/);
    if (!m) continue;
    const declared = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);

    // Inline tool objects in these files are `{ name: 'x', description, schema, invoke }`.
    const built = new Set([...src.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((x) => x[1]));

    out.push({
      file: entry,
      src,
      declared,
      built,
      passesNoTools: /tools:\s*\[\s*\]/.test(src),
    });
  }
  return out;
}

const agents = collect();

describe('background agent tool declarations', () => {
  it('finds the agent runners to check', () => {
    // A parser that matches nothing is a test that passes forever.
    expect(agents.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Only agents that run a LangGraph TOOL LOOP are checked.
   *
   * For those, the `tools` array handed to `runLangGraphAgent` IS the binding, so a name in
   * `defaultTools` that is not in that array is unreachable — the kai-task defect exactly.
   *
   * `tech-radar-agent` is the other shape and legitimately so: it never calls
   * runLangGraphAgent, it delegates to `runRadarForSubject`, which uses Anthropic's server-side
   * web_search inside itself. Nothing binds a tool array there, so `defaultTools` is descriptive
   * rather than load-bearing and there is no gap to open. Scoping the rule to where a binding
   * exists is the point; widening it to every file would just teach people to delete the check.
   */
  const loopAgents = agents.filter((a) => a.src.includes('runLangGraphAgent'));

  it('checks every agent that runs a tool loop', () => {
    expect(loopAgents.length).toBeGreaterThanOrEqual(3);
  });

  it('declares only tools the file actually constructs', () => {
    const offenders: string[] = [];
    for (const a of loopAgents) {
      for (const tool of a.declared) {
        if (!a.built.has(tool)) {
          offenders.push(`${a.file}: declares "${tool}" in defaultTools but builds no factory for it`);
        }
      }
    }
    expect(
      offenders,
      'A declared tool with no factory is unreachable, and the agent is told it HAS it — which is '
      + 'how a research task with no working tools produced a report from training data instead of '
      + 'stopping. Either build the tool or remove it from defaultTools.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('declares nothing when it passes an empty tools array', () => {
    const offenders = loopAgents
      .filter((a) => a.passesNoTools && a.declared.length > 0)
      .map((a) => `${a.file}: passes tools: [] but declares ${a.declared.join(', ')}`);
    expect(
      offenders,
      'This agent hands runLangGraphAgent an empty tool array, so nothing it declares can ever be '
      + 'called.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('kai-task-agent, specifically', () => {
  const src = stripComments(readFileSync(join(AGENT_DIR, 'kai-task-agent.ts'), 'utf8'));

  it('builds the web tools, because a research handoff without them is fiction', () => {
    // Pinned by name rather than by count: this is the agent `dispatch_background_task` sends
    // every over-large research task to, and web reach is the whole reason that handoff exists.
    for (const tool of ['web_search', 'web_fetch']) {
      expect(src, `kai-task must construct ${tool}`).toMatch(new RegExp(`name:\\s*'${tool}'`));
    }
    expect(src).toMatch(/makeWebSearchTool\(/);
    expect(src).toMatch(/makeWebFetchTool\(/);
  });

  it('tells the model not to answer a lookup from memory', () => {
    // The prompt rule is the backstop for the day a tool breaks again. Without it the agent
    // silently substitutes what it remembers, which is worse than returning nothing.
    expect(src).toMatch(/Never answer a lookup from memory/i);
    expect(src).toMatch(/STOP and report/i);
  });
});
