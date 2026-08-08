/**
 * Toolkit coverage guard — sourced from the generated tool manifest (issue #266).
 *
 * The agent's tools are defined ONCE, in the backend:
 *     tool(fn, { name, description, schema: z.object({...}) })   // _shared/tools/*.ts
 * and every surface that exposes them used to be a hand-maintained mirror:
 *   • agentToolsCatalog.TOOLKITS  → the ToolkitPickerModal (what a user can enable)
 *   • agent-chat SERVER_TOOLKITS  → what `load_toolkit` can bind mid-chat
 *   • each quick-start's `form`   → which of a tool's options a user can actually pick
 *
 * Nothing held those together, so the catalog drifted in FOUR dimensions. Each has a
 * check below:
 *
 *   1. COVERAGE      — a tool ships in no cluster: chat-only, invisible in the picker.
 *   2. REACHABILITY  — a tool is fully defined but its factory is never instantiated,
 *                      so no agent can call it at all (generate_video shipped like this).
 *   3. MIRROR        — SERVER_TOOLKITS ⇄ TOOLKITS disagree (bindable but un-enableable,
 *                      or offered in the picker and unbindable).
 *   4. OPTIONS       — a tool's `z.enum` choices never become form fields, or a
 *                      hand-written `select` drifts from the enum it mirrors.
 *
 * WHY THE MANIFEST. This file used to extract tools with /name: '([a-z][a-z0-9_]+)',/.
 * That regex was wrong in both directions and nothing could tell:
 *   • it MISSED 8 real camelCase tools (queryDatabase, checkJobStatus, getStageDetails,
 *     getRelationshipCounts, getDocumentEntities, getMetadataExtraction, querySentry,
 *     checkServerHealth) — the character class stops at the first capital;
 *   • it INVENTED two phantoms — `submit_findings` (an Anthropic structured-output
 *     schema) and `web_search` (Anthropic's SERVER-side tool block, `{ type:
 *     'web_search_20250305', name: 'web_search' }`) — neither is a tool of ours, and
 *     `web_search` sat in the coverage-debt list as a tool someone was expected to
 *     cluster one day.
 * scripts/gen-tool-manifest.mjs AST-parses the `tool(...)` CALL EXPRESSIONS, which is
 * immune to both. The manifest is committed, and the first test here fails if it is
 * stale — so a tool added in the backend cannot quietly skip every check below.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLKITS } from '@/components/features/ai/agentToolsCatalog';
import { deriveAutoFields } from '@/components/features/ai/toolAutoFields';
import { TOOL_MANIFEST } from '@/components/features/ai/toolManifest.generated';
// @ts-expect-error — plain ESM script, no types; tests/ is outside tsconfig anyway.
import { generate } from '../../scripts/gen-tool-manifest.mjs';

const ROOT = process.cwd();
const AGENT_CHAT = join(ROOT, 'supabase/functions/agent-chat/index.ts');
const MANIFEST_FILE = join(ROOT, 'src/components/features/ai/toolManifest.generated.ts');
const QUOTED_RE = /'([A-Za-z][A-Za-z0-9_]*)'/g;

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Genuinely not user-facing: runtime meta-tools the agent drives itself.
// `submit_findings` used to be listed here purely to silence the old regex's
// phantom; the AST parser never emits it, so it is gone.
const INTERNAL_TOOLS = new Set([
  'load_toolkit', 'load_skill', 'check_generation_status',
  // Ops/diagnostic tools bound only by an explicit agent config (`config.tools`),
  // never by a toolkit. Not picker material — they read raw DB/Sentry/infra state.
  'queryDatabase', 'querySentry', 'checkServerHealth',
]);

// Implemented + agent-bound tools that DON'T yet belong to a toolkit cluster — reachable
// only by typing in chat, invisible in the toolkit picker. Tracked tech-debt: SHRINK by
// giving each a cluster; never grow it (a new orphan should fail the build instead).
const KNOWN_UNCLUSTERED = new Set([
  // Generation extras (belong in the Interior Design cluster). generate_gemini and
  // virtual_staging ARE bound — they piggyback on the generate_3d branch — they just
  // have no cluster of their own.
  'generate_gemini', 'virtual_staging',
  // HVAC / energy calculators
  'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
  // Bound only through `config.tools.includes('estimate_cost')` and listed by no
  // AGENT_CONFIGS entry, so today it is doubly invisible: no cluster AND no agent.
  'estimate_cost',
]);

// Defined but NEVER INSTANTIATED — the factory is exported and nothing calls it, so
// no agent can reach the tool no matter what the picker says. This is the failure
// `generate_video` had (defined, clustered later, callable by nobody). SHRINK by
// wiring the factory into agent-chat's registerTools, or by deleting the dead tool.
const KNOWN_UNBOUND = new Set([
  // database-tools.ts exports 6 factories; only createQueryDatabaseTool is ever
  // called. These 5 have been unreachable since they were written — the old
  // name-only guard could not express the question, and the camelCase regex could
  // not even see them.
  'checkJobStatus', 'getStageDetails', 'getRelationshipCounts',
  'getDocumentEntities', 'getMetadataExtraction',
]);

// Tools whose z.enum options reach NO form field anywhere — the choices exist only in
// the schema, so a user can pick one solely by naming it in prose. SHRINK by adding a
// quick-start (with `autoFields`, the selects come free). Never grow: a NEW
// option-bearing tool must be surfaced when it ships.
const OPTIONS_EXEMPT = new Set([
  // Needs an id only a PRIOR RESULT can supply — a findings card, a finished crawl, a
  // product row, a sourcing option set. A quick-start would have to ask for a UUID.
  'update_finding', 'seo_onpage_issues', 'track_product_mentions', 'track_product_prices',
  'create_purchase_order', 'read_document_section',
  // Driven by an attached image or a guided wizard, not by a field form.
  'visual_search', 'generate_presentation_sheet',
  // 20+ params including arrays and per-source object toggles — collected
  // conversationally by their agent, not by one modal.
  'track_job_search', 'add_purchase_item',
  // Its `priceDocType` enum only applies when the query is aimed at pricing documents;
  // the KB quick-start is deliberately a plain question box, and deriving the other
  // four params to reach it would bury the one field that matters.
  'knowledge_base_search',
  // Router tools whose clusters have no action-pinned quick-start yet, so their
  // `action` enum has no surface. Debt, not design — each shrinks off this list the
  // day its cluster gains one (manage_stock / manage_hr / manage_my_hr already have).
  'manage_crm', 'manage_docs', 'manage_finance', 'manage_inbox', 'manage_messaging',
  'manage_reviews', 'manage_real_estate', 'manage_appointments', 'manage_contracts',
  'manage_email_campaign', 'manage_company_assets',
  // INTERNAL_TOOLS — ops-only, not picker material.
  'checkServerHealth', 'queryDatabase',
  // KNOWN_UNCLUSTERED — no cluster yet, so nowhere to put a quick-start. These leave
  // this list at the same time they leave that one.
  'generate_gemini', 'virtual_staging',
  'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
]);

// ── Manifest-derived facts ───────────────────────────────────────────
const implemented = new Set(TOOL_MANIFEST.map((t) => t.name));
const byName = new Map(TOOL_MANIFEST.map((t) => [t.name, t]));
const clustered = new Set(TOOLKITS.flatMap((t) => t.tool_ids));

/** Enum-bearing params of a tool, keyed by param name. */
const enumParams = (name: string) =>
  (byName.get(name)?.params ?? []).filter((p) => Array.isArray(p.enum) && p.enum.length > 0);

// Every quick-start, paired with the fields the modal will ACTUALLY render —
// hand-written `form` for most, schema-derived for `autoFields` ones. Checking the
// declared `form` instead would leave every derived quick-start unverified.
const quickStarts = TOOLKITS.flatMap((tk) =>
  (tk.quick_starts ?? []).map((qs) => ({ toolkit: tk.id, cluster: tk, qs, fields: deriveAutoFields(qs) })),
);
const runQuickStarts = quickStarts.filter((x) => x.qs.run?.tool);

/**
 * The enum param a select field mirrors, or null when it mirrors none.
 *
 * For a `run` quick-start the target tool is known outright. For a prompt-driven one
 * (the interior generation flows, where the agent reads the rendered sentence) there
 * is no declared target, so the field key is matched against the enum params of the
 * tools in the SAME cluster. When two of them declare the same param name —
 * generate_video.model and generate_vr_world.model both do — the tie is broken by
 * which enum actually contains the offered values, and an unresolvable tie is SKIPPED
 * rather than guessed at.
 */
function mirroredEnumParam(
  toolIds: string[],
  runTool: string | undefined,
  argName: string,
  offered: string[] = [],
) {
  const hits = (runTool ? [runTool] : toolIds)
    .map((t) => {
      const p = (byName.get(t)?.params ?? []).find((x) => x.name === argName && x.enum?.length);
      return p ? { name: p.name, enum: p.enum as string[], owner: t } : null;
    })
    .filter((x): x is { name: string; enum: string[]; owner: string } => x !== null);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1 && offered.length) {
    const exact = hits.filter((h) => offered.every((v) => h.enum.includes(v)));
    if (exact.length === 1) return exact[0];
  }
  return null;
}

/**
 * Tools with at least one enum param reachable from the picker — pinned by a
 * quick-start's fixedArgs, or rendered as a field. Tool-level rather than param-level
 * on purpose: a router tool's per-action enums (manage_hr.employment_type) only apply
 * to one branch, and demanding a field for every one of them would push half the
 * router tools onto the exempt list, which teaches nobody anything.
 */
const surfacedTools = (() => {
  const out = new Set<string>();
  for (const { cluster, qs, fields } of quickStarts) {
    const target = qs.run?.tool;
    if (target) {
      const enums = new Set(enumParams(target).map((p) => p.name));
      const touched = [
        ...Object.keys(qs.run!.fixedArgs ?? {}),
        ...fields.map((f) => qs.run!.argMap?.[f.key] ?? f.key),
      ];
      if (touched.some((a) => enums.has(a))) out.add(target);
      continue;
    }
    // Prompt-driven quick-start: a select whose key resolves to exactly one enum param
    // in the cluster surfaces that tool's options through the rendered prompt.
    for (const f of fields) {
      if (f.kind !== 'select') continue;
      const p = mirroredEnumParam(cluster.tool_ids, undefined, f.key, (f.options ?? []).map((o) => o.value));
      if (p) out.add(p.owner);
    }
  }
  return out;
})();

// ── SERVER_TOOLKITS parsing (a Deno module — cannot be imported here) ─
// Parsed by brace-matching the value AFTER the `=`: anchoring on the first `{`
// instead grabs the TYPE annotation (`Record<string, { ... }>`) and silently
// yields zero clusters, i.e. a green build that checks nothing.

function balanced(src: string, openIdx: number): string {
  const open = src[openIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(openIdx, i + 1);
  }
  throw new Error('unbalanced block');
}

/** The initializer block of `<anchor> ... = <{...}|[...]>`. */
function valueBlock(src: string, anchor: string): string {
  const a = src.indexOf(anchor);
  if (a < 0) throw new Error(`anchor missing: ${anchor}`);
  let i = src.indexOf('=', a) + 1;
  while (/\s/.test(src[i])) i++;
  return balanced(src, i);
}

/** Direct-child `{...}` literals of a block (depth-2 opens). */
function childObjects(body: string): Array<{ at: number; src: string }> {
  const out: Array<{ at: number; src: string }> = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[') {
      depth++;
      if (depth === 2 && c === '{') {
        const blk = balanced(body, i);
        out.push({ at: i, src: blk });
        i += blk.length - 1;
        depth--;
      }
    } else if (c === '}' || c === ']') depth--;
  }
  return out;
}

const idsOf = (blk: string): Set<string> => {
  const m = blk.match(/tool_ids:\s*\[([\s\S]*?)\]/);
  return new Set(m ? [...m[1].matchAll(QUOTED_RE)].map((x) => x[1]) : []);
};

/** SERVER_TOOLKITS — keyed object: `'<id>': { tool_ids: [...] }`. */
function serverToolkits(): Record<string, Set<string>> {
  const body = valueBlock(read(AGENT_CHAT), 'const SERVER_TOOLKITS');
  const out: Record<string, Set<string>> = {};
  for (const { at, src } of childObjects(body)) {
    const key = [...body.slice(0, at).matchAll(/'([a-z0-9-]+)'\s*:\s*$/g)].pop();
    if (key) out[key[1]] = idsOf(src);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────

describe('tool manifest', () => {
  const { tools, source, problems } = generate() as {
    tools: Array<{ name: string; params: unknown[] }>;
    source: string;
    problems: string[];
  };

  it('generates cleanly — every tool() call and zod schema is readable', () => {
    expect(problems, `gen-tool-manifest.mjs could not parse:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it('is NOT stale — regenerating produces the committed file', () => {
    expect(
      read(MANIFEST_FILE),
      'toolManifest.generated.ts is out of date with the backend tool definitions. ' +
        'Run: npm run tools:manifest',
    ).toBe(source.replace(/\r\n/g, '\n'));
  });

  it('agrees with the committed manifest (guards a half-applied regeneration)', () => {
    expect(TOOL_MANIFEST.length).toBe(tools.length);
    expect(TOOL_MANIFEST.length).toBeGreaterThan(100);
  });
});

describe('toolkit coverage', () => {
  it('every clustered tool_id is a real implemented tool (no dead / renamed refs)', () => {
    const dead = [...clustered].filter((t) => !implemented.has(t)).sort();
    expect(dead, `agentToolsCatalog clusters reference non-existent tools: ${dead.join(', ')}`).toEqual([]);
  });

  it('every implemented tool is clustered, internal, or tracked debt (no NEW orphans)', () => {
    const newOrphans = [...implemented]
      .filter((t) => !clustered.has(t) && !INTERNAL_TOOLS.has(t) && !KNOWN_UNCLUSTERED.has(t) && !KNOWN_UNBOUND.has(t))
      .sort();
    expect(
      newOrphans,
      `New tool(s) not surfaced in any toolkit cluster: ${newOrphans.join(', ')}. ` +
        `Add each to a cluster's tool_ids in agentToolsCatalog.ts, or (if truly internal) ` +
        `to INTERNAL_TOOLS / KNOWN_UNCLUSTERED in this test.`,
    ).toEqual([]);
  });

  it('every implemented tool is actually instantiated somewhere (no unreachable tools)', () => {
    // A tool is reachable if agent-chat mentions its factory (the normal path) or its
    // name (the `config.tools.includes('x')` path). Both spellings count.
    const binder = read(AGENT_CHAT);
    const unreachable = TOOL_MANIFEST
      .filter((t) => !binder.includes(t.factory) && !binder.includes(`'${t.name}'`))
      .map((t) => t.name)
      .filter((n) => !KNOWN_UNBOUND.has(n))
      .sort();
    expect(
      unreachable,
      `Tool(s) defined but never instantiated — no agent can call them: ${unreachable.join(', ')}. ` +
        `Wire the factory into registerTools in agent-chat/index.ts, delete the dead tool, ` +
        `or record it in KNOWN_UNBOUND.`,
    ).toEqual([]);
  });

  it('KNOWN_UNCLUSTERED stays honest — prune tools once they get a cluster', () => {
    const stale = [...KNOWN_UNCLUSTERED].filter((t) => !implemented.has(t) || clustered.has(t)).sort();
    expect(stale, `Prune from KNOWN_UNCLUSTERED (now clustered or removed): ${stale.join(', ')}`).toEqual([]);
  });

  it('KNOWN_UNBOUND stays honest — prune once the factory is wired up', () => {
    const binder = read(AGENT_CHAT);
    const stale = [...KNOWN_UNBOUND]
      .filter((n) => {
        const t = byName.get(n);
        return !t || binder.includes(t.factory) || binder.includes(`'${n}'`);
      })
      .sort();
    expect(stale, `Prune from KNOWN_UNBOUND (now bound or removed): ${stale.join(', ')}`).toEqual([]);
  });

  it('INTERNAL_TOOLS stays honest — only lists tools that still exist', () => {
    const stale = [...INTERNAL_TOOLS].filter((t) => !implemented.has(t)).sort();
    expect(stale, `Prune from INTERNAL_TOOLS (no longer implemented): ${stale.join(', ')}`).toEqual([]);
  });
});

describe('toolkit options coverage', () => {
  it('every run-based quick-start targets a real tool', () => {
    const bad = runQuickStarts
      .filter((x) => !implemented.has(x.qs.run!.tool))
      .map((x) => `${x.toolkit}/"${x.qs.label}" → ${x.qs.run!.tool}`)
      .sort();
    expect(bad, `Quick-start run.tool does not exist: ${bad.join(', ')}`).toEqual([]);
  });

  it('every run-based quick-start passes real tool params (argMap/fixedArgs typos)', () => {
    const bad: string[] = [];
    for (const { toolkit, qs, fields } of runQuickStarts) {
      const tool = byName.get(qs.run!.tool);
      if (!tool) continue;
      const known = new Set(tool.params.map((p) => p.name));
      if (known.size === 0) continue; // schema-less tool: nothing to check
      const sent = [
        ...Object.keys(qs.run!.fixedArgs ?? {}),
        ...Object.values(qs.run!.argMap ?? {}),
        // Un-mapped form keys land on the tool arg of the same name (identity).
        ...fields.map((f) => f.key).filter((k) => !(k in (qs.run!.argMap ?? {}))),
      ];
      for (const arg of sent) {
        if (!known.has(arg)) bad.push(`${toolkit}/"${qs.label}" → ${tool.name}.${arg}`);
      }
    }
    expect(
      bad.sort(),
      `Quick-start sends arg(s) the tool's schema does not declare — silently dropped ` +
        `by the agent runtime:\n  ${bad.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every run-based quick-start supplies the tool\'s REQUIRED params', () => {
    // Omitting a required param means zod rejects the call — the quick-start fails
    // 100% of the time, silently, from the user's point of view ("nothing happened").
    // `track_tech_radar` shipped this way: its `action` enum is required and the
    // "Track an entry" quick-start passed none.
    const bad: string[] = [];
    for (const { toolkit, qs, fields } of runQuickStarts) {
      const tool = byName.get(qs.run!.tool);
      if (!tool) continue;
      const supplied = new Set([
        ...Object.keys(qs.run!.fixedArgs ?? {}),
        ...fields.map((f) => qs.run!.argMap?.[f.key] ?? f.key),
      ]);
      for (const p of tool.params) {
        if (!p.optional && !supplied.has(p.name)) bad.push(`${toolkit}/"${qs.label}" → ${tool.name}.${p.name}`);
      }
    }
    expect(
      bad.sort(),
      `Quick-start omits a REQUIRED tool param — the call fails schema validation ` +
        `every time:\n  ${bad.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no form field overwrites a fixedArg', () => {
    // buildToolInput spreads fixedArgs FIRST, then form values — so a form key that
    // resolves onto a fixed arg silently replaces it. `manage_flows`'s "Create a flow"
    // collected a free-text field literally keyed `action`, which overwrote the pinned
    // `action: 'create'` router verb with the user's prose.
    const bad: string[] = [];
    for (const { toolkit, qs, fields } of runQuickStarts) {
      const fixed = new Set(Object.keys(qs.run!.fixedArgs ?? {}));
      if (fixed.size === 0) continue;
      for (const f of fields) {
        const arg = qs.run!.argMap?.[f.key] ?? f.key;
        if (fixed.has(arg)) bad.push(`${toolkit}/"${qs.label}" → ${qs.run!.tool}.${arg} (field "${f.key}")`);
      }
    }
    expect(
      bad.sort(),
      `Form field(s) overwrite a pinned fixedArg:\n  ${bad.join('\n  ')}\n` +
        `Rename the form key + argMap it to the real param.`,
    ).toEqual([]);
  });

  it('numeric tool params are collected as numbers, not strings', () => {
    // Form values are always strings. Without a 'number' coercion the tool gets "50"
    // where its schema says z.number(), and zod rejects the call. `autoFields`
    // quick-starts get theirs from deriveCoercions; a hand-written run must declare it.
    const bad: string[] = [];
    for (const { toolkit, qs, fields } of runQuickStarts) {
      const tool = byName.get(qs.run!.tool);
      if (!tool || qs.autoFields) continue;
      for (const f of fields) {
        const arg = qs.run!.argMap?.[f.key] ?? f.key;
        const param = tool.params.find((p) => p.name === arg);
        if (param?.type !== 'number') continue;
        if (qs.run!.coerce?.[arg] !== 'number') {
          bad.push(`${toolkit}/"${qs.label}" → ${tool.name}.${arg}`);
        }
      }
    }
    expect(
      bad.sort(),
      `Field(s) feeding a z.number() param with no \`coerce: { <arg>: 'number' }\` — ` +
        `the tool receives a string and zod rejects it:\n  ${bad.join('\n  ')}`,
    ).toEqual([]);
  });

  it('select options match the tool enum they mirror (no drift)', () => {
    // The failure this catches: a form `select` lists 4 choices, someone adds a 5th
    // to the z.enum, and the picker keeps offering 4 forever — or it offers a value
    // the enum never had, so the agent has to guess the mapping ("Showroom Spots" →
    // dramatic_spots) or the tool rejects it outright. Covers prompt-driven
    // quick-starts too: an unchecked prose translation layer rots exactly as fast.
    const drift: string[] = [];
    for (const { toolkit, cluster, qs, fields } of quickStarts) {
      for (const f of fields) {
        if (f.kind !== 'select' || !f.options?.length) continue;
        const offered = f.options.map((o) => o.value);
        const param = mirroredEnumParam(cluster.tool_ids, qs.run?.tool, qs.run?.argMap?.[f.key] ?? f.key, offered);
        if (!param) continue; // mirrors no enum param — free-form select, nothing to compare
        const allowed = new Set(param.enum);
        const invalid = offered.filter((v) => !allowed.has(v));
        const missing = param.enum.filter((v) => !offered.includes(v));
        if (invalid.length) drift.push(`${toolkit}/"${qs.label}" ${param.owner}.${param.name}: offers value(s) the enum rejects → ${invalid.join(', ')}`);
        if (missing.length) drift.push(`${toolkit}/"${qs.label}" ${param.owner}.${param.name}: hides option(s) → ${missing.join(', ')}`);
      }
    }
    expect(
      drift,
      `Quick-start select options have drifted from the tool's z.enum:\n  ${drift.join('\n  ')}\n` +
        `Fix by deleting the hand-written \`options\` and setting \`autoFields: true\` — ` +
        `deriveAutoFields fills them from the manifest.`,
    ).toEqual([]);
  });

  it('every option-bearing tool surfaces its options somewhere (or is exempt)', () => {
    const hidden = TOOL_MANIFEST
      .filter((t) => enumParams(t.name).length > 0)
      .map((t) => t.name)
      .filter((n) => !surfacedTools.has(n) && !OPTIONS_EXEMPT.has(n))
      .sort();
    expect(
      hidden,
      `Tool(s) with z.enum options that no quick-start surfaces — the choices are ` +
        `unreachable from the UI: ${hidden.join(', ')}. Add a quick-start with ` +
        `\`autoFields: true\` (the selects derive from the manifest), or record it in ` +
        `OPTIONS_EXEMPT with the reason.`,
    ).toEqual([]);
  });

  it('OPTIONS_EXEMPT stays honest — prune once the tool is surfaced', () => {
    const stale = [...OPTIONS_EXEMPT]
      .filter((n) => !implemented.has(n) || enumParams(n).length === 0 || surfacedTools.has(n))
      .sort();
    expect(
      stale,
      `Prune from OPTIONS_EXEMPT (now surfaced, has no enum params, or removed): ${stale.join(', ')}`,
    ).toEqual([]);
  });
});

describe('toolkit mirror parity (SERVER_TOOLKITS ⇄ TOOLKITS)', () => {
  const server = serverToolkits();
  const front: Record<string, Set<string>> = Object.fromEntries(
    TOOLKITS.map((t) => [t.id, new Set(t.tool_ids)]),
  );

  it('parses the server mirror (guards against a silently-empty parse)', () => {
    expect(Object.keys(server).length, 'SERVER_TOOLKITS parsed empty').toBeGreaterThan(15);
    expect(Object.keys(front).length, 'TOOLKITS parsed empty').toBeGreaterThan(15);
  });

  it('no picker cluster is missing from the server (would render an unbindable toolkit)', () => {
    const ghosts = Object.keys(front).filter((k) => !server[k]).sort();
    expect(
      ghosts,
      `Picker offers toolkit(s) the server cannot bind: ${ghosts.join(', ')}. ` +
        `Add each to SERVER_TOOLKITS in agent-chat/index.ts.`,
    ).toEqual([]);
  });

  it('no server cluster is missing from the picker', () => {
    const pickerless = Object.keys(server).filter((k) => !front[k]).sort();
    expect(
      pickerless,
      `Server binds toolkit(s) with no picker entry: ${pickerless.join(', ')}. ` +
        `Add a ToolkitDefinition to TOOLKITS in agentToolsCatalog.ts.`,
    ).toEqual([]);
  });

  it('clusters present in BOTH mirrors have identical tool_ids', () => {
    const drift: string[] = [];
    for (const id of Object.keys(server)) {
      if (!front[id]) continue;
      const serverOnly = [...server[id]].filter((t) => !front[id].has(t));
      const pickerOnly = [...front[id]].filter((t) => !server[id].has(t));
      if (serverOnly.length) drift.push(`${id}: server-only (not in picker) → ${serverOnly.join(', ')}`);
      if (pickerOnly.length) drift.push(`${id}: picker-only (NOT bindable) → ${pickerOnly.join(', ')}`);
    }
    expect(drift, `SERVER_TOOLKITS and TOOLKITS disagree:\n  ${drift.join('\n  ')}`).toEqual([]);
  });

  it('every icon referenced by TOOLKITS resolves in the picker ICON_MAP', () => {
    // ICON_MAP[toolkit.icon] || Wrench — an unknown name degrades silently to a
    // generic wrench instead of failing, so nothing surfaced 11 pre-existing
    // misses (incl. 'Plus' and 'Percent'). Assert coverage instead.
    const used = new Set(TOOLKITS.map((t) => t.icon));

    const pickerSrc = read(join(ROOT, 'src/components/features/ai/ToolkitPickerModal.tsx'));
    const mapStart = pickerSrc.indexOf('const ICON_MAP');
    const mapBody = pickerSrc.slice(mapStart, pickerSrc.indexOf('};', mapStart));
    const registered = new Set(mapBody.match(/[A-Z][A-Za-z0-9]+/g) ?? []);

    expect(used.size, 'no toolkit icons parsed — regex broke').toBeGreaterThan(20);
    const missing = [...used].filter((i) => !registered.has(i)).sort();
    expect(
      missing,
      `Icon(s) referenced by TOOLKITS but absent from ICON_MAP (they render as a ` +
        `generic Wrench): ${missing.join(', ')}. Import them in ToolkitPickerModal.tsx ` +
        `and add them to ICON_MAP.`,
    ).toEqual([]);
  });
});
