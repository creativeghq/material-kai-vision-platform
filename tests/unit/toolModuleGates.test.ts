/**
 * A paid module is enforced where the tool runs, not where the nav tile is drawn (#395).
 *
 * `_shared/entitlement.ts` states the doctrine in its own header: *module entitlement enforcement
 * at the API boundary is the real security line; nav and route guards are UX only.* An agent tool
 * IS an API boundary — it reaches the same tables the page does without passing the page's
 * `EntitlementGuard` — and half of them were not asking.
 *
 * MEASURED 2026-08-29: of the 19 tool files whose catalog entry declares a `moduleSlug`, 9 checked
 * entitlement and 10 did not. Five of the ten asked `modules.enabled` — the PLATFORM-WIDE publish
 * flag, true for everyone — which reads like a gate and refuses nobody. At that moment three of
 * the four non-root workspaces were not entitled to Catalogs, Deals, Expenses, Job Research,
 * Mention Monitoring or Price Monitoring, and could use all six by asking the agent. The nav tile
 * was hidden the whole time, which is precisely why nothing looked wrong.
 *
 * The same read found the mirror defect: the Expenses toolkit declared `moduleSlug: 'finance'`,
 * and there is no `finance` row in `public.modules` — the slug is `sales-finance` everywhere else
 * in the repo. `enabledModules.includes('finance')` is therefore false in every workspace, so the
 * toolkit was hidden from EVERYONE including the operator root, and none of its four tools has an
 * `AgentToolEntry`, so the command palette did not list them individually either. A whole feature
 * unreachable from both browse surfaces, by one wrong word.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const catalogSrc = read('src/components/features/ai/agentToolsCatalog.ts');
const manifestSrc = read('src/components/features/ai/toolManifest.generated.ts');

/** Every `moduleSlug: '…'` in a file. */
const slugsIn = (src: string) =>
  new Set([...src.matchAll(/moduleSlug: '([a-z0-9-]+)'/g)].map((m) => m[1]));

/**
 * Slugs the PAGE-gating surfaces use. The agent catalog may not invent a module: a slug no page
 * knows is either a typo or a feature with no home, and both render as "permanently unavailable".
 */
const pageSlugs = new Set<string>([
  ...slugsIn(read('src/config/nav-items.ts')),
  ...slugsIn(read('src/config/capabilities.ts')),
  ...slugsIn(read('src/config/launcher-sections.ts')),
]);

/**
 * Modules that legitimately have no page — the agent is their only surface. Each entry is a real
 * `public.modules` row; the list is meant to shrink, and adding to it should feel deliberate.
 */
const AGENT_ONLY_SLUGS = new Set(['job-research', 'deals', 'projects', 'real-estate']);

/** tool id → declared moduleSlug, from entries AND from the toolkit that contains them. */
function declaredModules(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of catalogSrc.matchAll(/\{\s*\n?\s*id: '([a-z0-9_]+)',([\s\S]{0,1200}?)\n {2}\},/g)) {
    const slug = /moduleSlug: '([a-z0-9-]+)'/.exec(m[2]);
    if (slug && !out.has(m[1])) out.set(m[1], slug[1]);
  }
  const toolkits = catalogSrc.slice(catalogSrc.indexOf('export const TOOLKITS'));
  for (const m of toolkits.matchAll(/\n {2}\{\n {4}id: '([a-z0-9-]+)',([\s\S]*?)\n {2}\},/g)) {
    const slug = /moduleSlug: '([a-z0-9-]+)'/.exec(m[2]);
    if (!slug) continue;
    const ids = m[2].slice(m[2].indexOf('tool_ids'));
    for (const t of ids.matchAll(/'([a-z0-9_]+)'/g)) if (!out.has(t[1])) out.set(t[1], slug[1]);
  }
  return out;
}

/** tool id → the file that defines it, from the AST projection. */
function toolFiles(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of manifestSrc.matchAll(/name: '([a-z0-9_]+)',\n\s*file: '([^']*)',/g)) out.set(m[1], m[2]);
  return out;
}

/**
 * Tool files that do NOT gate, because the API they call does. Each entry names the enforcing
 * file, and that file is read — an exemption whose justification has been deleted fails here
 * rather than quietly becoming a hole.
 */
const ENFORCED_UPSTREAM: Record<string, string> = {
  'supabase/functions/_shared/tools/real-estate-tools.ts': 'supabase/functions/real-estate-api/index.ts',
  'supabase/functions/_shared/tools/social-tools.ts': 'supabase/functions/zernio-api/handlers/publish.ts',
};

describe('#395 — a paid module is enforced in the tool, not in the nav', () => {
  it('reads both sides', () => {
    expect(declaredModules().size).toBeGreaterThan(20);
    expect(toolFiles().size).toBeGreaterThan(150);
    expect(pageSlugs.size).toBeGreaterThan(10);
  });

  it('every module the agent catalog names is one a page-gating surface knows', () => {
    const offenders = [...slugsIn(catalogSrc)]
      .filter((s) => !pageSlugs.has(s) && !AGENT_ONLY_SLUGS.has(s));
    expect(offenders,
      'These slugs appear only in the agent catalog. `enabledModules` comes from `public.modules`, '
      + 'so a slug with no row is false in every workspace and the toolkit is hidden from everyone '
      + `— which is what \`finance\` did to Expenses:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('a tool whose catalog entry declares a module checks entitlement', () => {
    const declared = declaredModules();
    const files = toolFiles();
    const offenders = new Set<string>();
    for (const [id, slug] of declared) {
      const file = files.get(id);
      if (!file || !existsSync(join(ROOT, file))) continue;
      if (ENFORCED_UPSTREAM[file]) continue;
      const src = read(file);
      if (!/moduleGate\(/.test(src) && !/is_workspace_entitled/.test(src)) {
        offenders.add(`${file} (declares ${slug})`);
      }
    }
    expect([...offenders],
      'These define a tool the catalog says needs a paid module, and never ask whether the '
      + 'workspace has it. The page is guarded; the agent reaches the same tables without passing '
      + `that guard:\n${[...offenders].join('\n')}`,
    ).toEqual([]);
  });

  it('an upstream-enforced exemption names a file that really enforces', () => {
    for (const [tool, api] of Object.entries(ENFORCED_UPSTREAM)) {
      expect(existsSync(join(ROOT, tool)), `${tool} no longer exists`).toBe(true);
      expect(existsSync(join(ROOT, api)), `${api} no longer exists`).toBe(true);
      expect(read(api), `${api} no longer checks entitlement, so ${tool} is now unguarded`)
        .toMatch(/assertEntitled|isWorkspaceEntitled|is_workspace_entitled/);
    }
  });

  it('the shared gate asks BOTH questions', () => {
    // `modules.enabled` is the operator's kill switch for a feature nobody should be using yet;
    // `is_workspace_entitled` is whether THIS tenant bought it. Only the first is the defect this
    // whole test exists for — a check that reads like a gate and refuses nobody. Only the second
    // lets a workspace keep using a module the operator has pulled.
    const gate = read('supabase/functions/_shared/tools/module-gate.ts');
    expect(gate).toMatch(/\.eq\('slug', moduleSlug\)/);
    expect(gate).toMatch(/is_workspace_entitled/);
    // Fails closed: an error means we could not establish entitlement, and serving on a maybe is
    // how a paid module leaks.
    expect(gate).toMatch(/if \(error\) \{[\s\S]{0,220}return refuse\(/);
    expect(gate).toMatch(/if \(!workspaceId\) \{[\s\S]{0,220}return refuse\(/);
  });

  it('no tool file keeps a private copy of the global-flag-only check', () => {
    // Five files had one, and every one of them refused nobody. The nine that check entitlement
    // pre-date the shared gate and are correct; what must not come back is the half-gate.
    const offenders: string[] = [];
    for (const file of new Set(toolFiles().values())) {
      if (!existsSync(join(ROOT, file))) continue;
      const src = read(file);
      if (/async function isModuleEnabled\(\)/.test(src) && !/is_workspace_entitled/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders,
      'A local `isModuleEnabled()` that reads only `modules.enabled` is the platform publish flag, '
      + `true for every workspace. Use moduleGate():\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * The two halves of a paid module have to name each other.
 *
 * `moduleSlug` on the catalog cluster is what makes the PICKER hide a module this workspace has
 * not bought; `moduleGate(workspaceId, slug)` in the tool is what makes the REFUSAL real. The
 * checks above walk the declared slugs, which is exactly the wrong direction for the failure
 * that actually happened: the Quotes cluster declared NO slug, so `quotes` — `is_addon`,
 * `price_tier: 'pro'` — was absent from the checklist rather than failing it, and
 * `quote-tools.ts` asked nobody. A guard that derives what to check from the thing that is
 * missing reports clean by construction.
 *
 * So this reads the OTHER side: what the tool files actually gate on. A file that calls
 * `moduleGate(_, 'x')` says its feature is paid; the cluster holding its tools must say the same
 * slug, or the picker offers a paid cluster to a workspace the tool will then refuse — a starter
 * that exists only to return `not_entitled`.
 */
describe('a paid module is named on BOTH sides', () => {
  const EXEMPT: Record<string, string> = {
    // The seven SEO clusters gate on `seo-toolkit` inside dataforseo-spend-gate.ts and declare no
    // slug, so today they are offered to workspaces that cannot use them. Adding the slug flips
    // visibility for seven clusters at once and belongs in its own change with its own check of
    // who is entitled — recorded here so it cannot be forgotten, and so nothing NEW joins it.
    // SHRINK-ONLY: entries come off this list, they do not go on.
    'seo-toolkit': 'the seven seo-* clusters — see #395 follow-up',
  };

  it('every slug a tool gates on is declared by the cluster that offers it', () => {
    const gatedBy = new Map<string, Set<string>>(); // slug -> files
    for (const [tool, file] of toolFiles()) {
      void tool;
      if (!existsSync(join(ROOT, file))) continue;
      for (const m of read(file).matchAll(/moduleGate\(\s*[a-zA-Z_.]+\s*,\s*'([a-z0-9-]+)'/g)) {
        if (!gatedBy.has(m[1])) gatedBy.set(m[1], new Set());
        gatedBy.get(m[1])!.add(file);
      }
    }
    expect(gatedBy.size, 'found no moduleGate calls at all — this guard is reading the wrong files').toBeGreaterThan(3);

    const declared = new Set([...slugsIn(catalogSrc)]);
    const undeclared = [...gatedBy.keys()].filter((s) => !declared.has(s) && !(s in EXEMPT)).sort();
    expect(
      undeclared,
      'A tool refuses on these modules and no cluster declares them, so the picker offers a paid '
      + 'cluster the tool will refuse — and the checks above cannot see it, because they walk the '
      + 'declared slugs: ' + undeclared.join(', '),
    ).toEqual([]);
  });

  it('the exemption list only shrinks', () => {
    const declared = new Set([...slugsIn(catalogSrc)]);
    const stale = Object.keys(EXEMPT).filter((s) => declared.has(s));
    expect(
      stale,
      'These are now declared by a cluster, so their exemption is dead — delete it: ' + stale.join(', '),
    ).toEqual([]);
  });
});
