/**
 * What the picker OFFERS equals what the binder BINDS — on the admin axis (#395).
 *
 * `agentToolsCatalog` is a browse surface: `getAccessibleAgents(role)` drops any tool marked
 * `adminOnly` for a non-admin, `getAccessibleToolkits(role)` drops any toolkit marked the same,
 * and `CommandPalette` renders the survivors as clickable entries with their example prompts.
 * `agent-chat` is the enforcer: a tool pushed inside `if (isAdmin) { … }` is simply absent from a
 * member's bound set.
 *
 * When the two disagree in the direction "offered but not bound", nothing errors. The member
 * clicks *Keyword Difficulty*, a prompt is sent, the model has no such tool, and it answers with
 * prose — or apologises for a capability the screen just advertised. **36 SEO tools and 6 SEO
 * toolkits were in exactly that state**: the binder's own comment says *"SEO toolkit (admin-only —
 * each call spends real DataForSEO credits on the platform's tab)"*, and five of the family were
 * marked in the catalog while the other 36 were not.
 *
 * `load_toolkit` had the same hole on the same axis, and the comment beside it had already named
 * the rule: *"an unfiltered list is a menu handed to the model with entries it can only ever be
 * refused on."* It filtered by the agent's own tool set and not by role, so six SEO clusters sat
 * in every member's menu — refused correctly by `applyToolkitInRun`, which is why it never
 * surfaced as a failure: the cost is a wasted turn, not an error.
 *
 * This reads the binder's source rather than a second list of admin tools, because a second list
 * is the thing that drifted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const catalogSrc = read('src/components/features/ai/agentToolsCatalog.ts');
const manifestSrc = read('src/components/features/ai/toolManifest.generated.ts');
const binderSrc = read('supabase/functions/agent-chat/index.ts');
const clustersSrc = read('supabase/functions/_shared/toolkitClusters.generated.ts');

/** tool id → is it marked adminOnly in the catalog? */
function catalogTools(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const m of catalogSrc.matchAll(/\{\s*\n?\s*id: '([a-z0-9_]+)',([\s\S]{0,1200}?)\n {2}\},/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].includes('adminOnly: true'));
  }
  return out;
}

/** tool name → factory name, from the AST projection. */
function factories(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of manifestSrc.matchAll(/name: '([a-z0-9_]+)',\n\s*file: '[^']*',\n\s*factory: '(\w+)'/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

const binderLines = binderSrc.split('\n');

/** Line ranges enclosed by an `if (isAdmin) {` block, by brace depth. */
const adminBlocks: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  binderLines.forEach((line, i) => {
    if (!/if \(isAdmin\)\s*\{/.test(line)) return;
    let depth = 0;
    for (let j = i; j < binderLines.length; j++) {
      depth += (binderLines[j].match(/\{/g) || []).length - (binderLines[j].match(/\}/g) || []).length;
      if (j > i && depth <= 0) { out.push([i, j]); return; }
    }
  });
  return out;
})();

/**
 * Is this tool bound only for admins?
 *
 * `isAdmin` passed as an ARGUMENT is not a gate — `createKnowledgeBaseSearchTool(workspaceId,
 * isAdmin, agentId)` binds for everyone and tells the tool who is asking. Only a condition counts.
 */
function boundAdminOnly(factory: string): boolean | null {
  const sites = binderLines
    .map((l, i) => [l, i] as const)
    .filter(([l]) => new RegExp(`\\b${factory}\\(`).test(l) && !l.includes('import'));
  if (sites.length === 0) return null;
  return sites.some(([line, i]) => {
    if (adminBlocks.some(([a, b]) => i >= a && i <= b)) return true;
    return line.split('&&').some((clause) => /\bisAdmin\b/.test(clause) && !clause.includes('tools.push'));
  });
}

describe('#395 — the admin axis, offered vs bound', () => {
  it('reads both sides', () => {
    // Without this the comparisons below are vacuous, which is how a parser bug passes as a clean bill.
    expect(catalogTools().size).toBeGreaterThan(100);
    expect(factories().size).toBeGreaterThan(150);
    expect(adminBlocks.length).toBeGreaterThan(0);
  });

  it('a tool the binder gates on isAdmin is marked adminOnly in the catalog', () => {
    const catalog = catalogTools();
    const factory = factories();
    const offenders: string[] = [];
    for (const [id, isMarked] of catalog) {
      const f = factory.get(id);
      if (!f) continue;
      if (boundAdminOnly(f) === true && !isMarked) offenders.push(id);
    }
    expect(offenders,
      'These are pushed only inside `if (isAdmin)` but the catalog offers them to every member. '
      + 'The palette lists them with an example prompt, the user sends it, and the tool is not in '
      + `the bound set:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('a toolkit whose tools are all admin-gated is marked adminOnly', () => {
    const factory = factories();
    const offenders: string[] = [];
    for (const m of clustersSrc.matchAll(/'([a-z0-9-]+)': \{\n([\s\S]*?)\n {2}\},/g)) {
      const [, id, body] = m;
      if (body.includes('adminOnly: true')) continue;
      const ids = [...body.matchAll(/'([a-z0-9_]+)'/g)].map((t) => t[1]);
      const verdicts = ids.map((t) => (factory.has(t) ? boundAdminOnly(factory.get(t)!) : null));
      const known = verdicts.filter((v) => v !== null);
      // "All of its tools are admin-only" — a mixed cluster is legitimately offered, because a
      // member gets the part they can use.
      if (known.length > 0 && known.every((v) => v === true)) offenders.push(id);
    }
    expect(offenders,
      'Every tool in these clusters is admin-gated by the binder, so a member who selects one gets '
      + `an empty toolkit:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it("load_toolkit's menu leaves out clusters the caller cannot load", () => {
    // The comment beside this list already stated the rule for the agent axis; the role axis was
    // missing, so `applyToolkitInRun` refused correctly and the turn was wasted anyway.
    const menu = binderSrc.slice(binderSrc.indexOf('const loadableToolkitIds'));
    const block = menu.slice(0, menu.indexOf(';'));
    expect(block).toMatch(/isAdmin \|\| !TOOLKIT_CLUSTERS\[id\]\.adminOnly/);
  });

  it('the cluster projection carries adminOnly', () => {
    // Without it the filter above silently matches nothing — `undefined` is falsy, so every
    // cluster would read as non-admin and the menu would be unfiltered again with the code intact.
    expect(clustersSrc).toMatch(/adminOnly\?: boolean;/);
    expect((clustersSrc.match(/adminOnly: true/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('load_toolkit does not take an isAdmin it never reads', () => {
    // The original signature took one and used it nowhere: a gate that stopped at the helper,
    // the same shape as `generate_video`'s push site.
    const tool = read('supabase/functions/_shared/tools/toolkit-tools.ts');
    const sig = tool.slice(tool.indexOf('export const createLoadToolkitTool'));
    expect(sig.slice(0, sig.indexOf('=> {'))).not.toMatch(/isAdmin/);
  });
});
