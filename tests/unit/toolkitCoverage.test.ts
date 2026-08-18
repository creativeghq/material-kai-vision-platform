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
 * Nothing held those together, so the catalog drifted in four dimensions:
 *
 *   1. COVERAGE      — a tool ships in no cluster: chat-only, invisible in the picker.
 *   2. REACHABILITY  — a tool is fully defined but its factory is never instantiated,
 *                      so no agent can call it at all (generate_video shipped like this).
 *   3. MIRROR        — SERVER_TOOLKITS ⇄ TOOLKITS disagree (bindable but un-enableable,
 *                      or offered in the picker and unbindable).
 *   4. OPTIONS       — a tool's `z.enum` choices never become form fields, or a
 *                      hand-written `select` drifts from the enum it mirrors.
 *   5. BINDING       — the factory IS instantiated behind `config.tools.includes('x')`,
 *                      and no agent config lists 'x'. Both binding paths read that list,
 *                      so the tool is as unreachable as in 2 — but 2's check passes,
 *                      because the binder does mention it. `price_my_spec` (#337) and
 *                      `generate_video` were both live in this state; generate_video's
 *                      own fix for 2 stopped at the push site and left it in 5.
 *
 * 1, 2, 4 and 5 are checked below. 3 no longer CAN drift: agent-chat's cluster map is
 * generated from TOOLKITS (`toolkitClusters.generated.ts`) rather than typed out a
 * second time, so the tests for it check that the projection is fresh and that no
 * second copy has reappeared — not that two copies happen to agree today.
 *
 * The escape hatches are gone. `KNOWN_UNCLUSTERED` and `KNOWN_UNBOUND` were emptied
 * and then DELETED, so 1 and 2 now fail outright rather than growing a list.
 * `OPTIONS_EXEMPT` survives because some tools genuinely have no form surface (an id
 * only a prior result can supply, a guided wizard) — every entry carries its reason,
 * and it is shrink-only.
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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TOOLKITS, renderPromptTemplate } from '@/components/features/ai/agentToolsCatalog';
import { CAPABILITIES } from '@/config/capabilities';
import { deriveAutoFields } from '@/components/features/ai/toolAutoFields';
import { TOOL_MANIFEST } from '@/components/features/ai/toolManifest.generated';
// @ts-expect-error — plain ESM script, no types; tests/ is outside tsconfig anyway.
import { generate, generateToolkitClusters } from '../../scripts/gen-tool-manifest.mjs';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const AGENT_CHAT = join(ROOT, 'supabase/functions/agent-chat/index.ts');
const MANIFEST_FILE = join(ROOT, 'src/components/features/ai/toolManifest.generated.ts');
const CLUSTERS_FILE = join(ROOT, 'supabase/functions/_shared/toolkitClusters.generated.ts');

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** The identifiers registered in a component's `const ICON_MAP = {...}`. */
function iconMapKeys(relPath: string): Set<string> {
  const src = read(join(ROOT, relPath));
  const start = src.indexOf('const ICON_MAP');
  if (start < 0) throw new Error(`no ICON_MAP in ${relPath}`);
  const body = src.slice(start, src.indexOf('};', start));
  return new Set(body.match(/[A-Z][A-Za-z0-9]+/g) ?? []);
}

// Genuinely not user-facing: runtime meta-tools the agent drives itself.
// `submit_findings` used to be listed here purely to silence the old regex's
// phantom; the AST parser never emits it, so it is gone.
const INTERNAL_TOOLS = new Set([
  'load_toolkit', 'load_skill', 'check_generation_status',
  // Ops/diagnostic tools bound only by an explicit agent config (`config.tools`),
  // never by a toolkit. Not picker material — they read raw DB/Sentry/infra state.
  'queryDatabase', 'querySentry', 'checkServerHealth',
]);

// COVERAGE DEBT: none. `KNOWN_UNCLUSTERED` and `KNOWN_UNBOUND` are gone — every
// implemented tool is now either in a cluster or in INTERNAL_TOOLS above, and every
// tool is instantiated somewhere. The escape hatches were deleted rather than left
// empty on purpose: an empty allowlist is an invitation to add one entry "just for
// now", and the two tests below now fail outright instead.
//
// What emptied them (issue #266, Phase 3/4):
//   • generate_gemini + virtual_staging → the `generation` cluster. They were always
//     instantiated by its `generate_3d` branch; only the listing was missing.
//   • the two HVAC calculators → the new alwaysOn `calculators` cluster, replacing
//     agent-chat's hardcoded CORE_ALWAYS_TOOLS re-add.
//   • estimate_cost → DELETED. Listed by no agent, and it multiplied
//     products.metadata.price by .quantity — a second derivation of a money quantity
//     that bypasses get_product_price_for_workspace.
//   • the 5 database-tools diagnostics → DELETED. Never instantiated since they were
//     written, service-role reads keyed by a caller-supplied id (invariant 1), and
//     getRelationshipCounts filtered a chunk id by a document id.

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
  // Same shape: its `room` / `furnitureStyle` enums are the VirtualStagingModal's two
  // picker steps. Not a promise — that wizard READS them from the manifest
  // (STAGING_ROOMS / STAGING_STYLES), so it cannot drift from the schema even though
  // this file cannot see inside it.
  'virtual_staging',
  // 20+ params including arrays and per-source object toggles — collected
  // conversationally by their agent, not by one modal.
  'track_job_search', 'add_purchase_item',
  // Its `priceDocType` enum only applies when the query is aimed at pricing documents;
  // the KB quick-start is deliberately a plain question box, and deriving the other
  // four params to reach it would bury the one field that matters.
  'knowledge_base_search',
  // INTERNAL_TOOLS — ops-only, not picker material.
  'checkServerHealth', 'queryDatabase',
]);

// ── Manifest-derived facts ───────────────────────────────────────────
const implemented = new Set(TOOL_MANIFEST.map((t) => t.name));
const byName = new Map(TOOL_MANIFEST.map((t) => [t.name, t]));
const clustered = new Set(TOOLKITS.flatMap((t) => t.tool_ids));

/** The tool whose `mode` enum a quick-start's `generation.mode` pins. */
const GEMINI_TOOL = 'generate_gemini';

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
    // An interior quick-start that pins `generation.mode` IS a surface for
    // generate_gemini's `mode` enum — one labelled button per mode ("Test on a room",
    // "Edit a photo", "Floor plan → 3D") instead of one select with ten options.
    if (qs.generation?.mode && cluster.tool_ids.includes(GEMINI_TOOL)) out.add(GEMINI_TOOL);

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

  it('every implemented tool is clustered or internal (no orphans at all)', () => {
    // No debt list to fall back on any more: a tool that ships into no cluster fails
    // the build. If it is genuinely runtime plumbing, add it to INTERNAL_TOOLS with
    // the reason; otherwise give it a cluster.
    const orphans = [...implemented]
      .filter((t) => !clustered.has(t) && !INTERNAL_TOOLS.has(t))
      .sort();
    expect(
      orphans,
      `Tool(s) not surfaced in any toolkit cluster — reachable only by typing in chat: ` +
        `${orphans.join(', ')}. Add each to a cluster's tool_ids in agentToolsCatalog.ts, ` +
        `or (if truly internal) to INTERNAL_TOOLS in this test.`,
    ).toEqual([]);
  });

  it('every implemented tool is actually instantiated somewhere (no unreachable tools)', () => {
    // A tool is reachable if agent-chat mentions its factory (the normal path) or its
    // name (the `config.tools.includes('x')` path). Both spellings count.
    const binder = read(AGENT_CHAT);
    const unreachable = TOOL_MANIFEST
      .filter((t) => !binder.includes(t.factory) && !binder.includes(`'${t.name}'`))
      .map((t) => t.name)
      .sort();
    expect(
      unreachable,
      `Tool(s) defined but never instantiated — no agent can call them: ${unreachable.join(', ')}. ` +
        `Wire the factory into registerTools in agent-chat/index.ts, or delete the dead tool.`,
    ).toEqual([]);
  });

  it('every clustered tool is listed by at least one agent (the binding list both paths read)', () => {
    // The test above accepts "the binder mentions the tool" as reachability. That proxy is too
    // weak, and two tools proved it: `price_my_spec` (#337) and `generate_video` — each had a
    // real `if (config.tools.includes('x')) tools.push(...)` line, so the binder mentioned them
    // and this file passed, while NEITHER could ever be called by anyone.
    //
    // Both binding paths gate on AGENT_CONFIGS[agentId].tools:
    //   • startup      — registerTools(new Set(config.tools))
    //   • load_toolkit — def.tool_ids.filter(t => agentFullToolIds.has(t)), and that set IS
    //                    AGENT_CONFIGS[agentId].tools
    // So a tool absent from every agent's list is unreachable no matter how correct its push
    // site, its cluster entry and its manifest row look. Nothing else in the build can see it:
    // the tool exists, typechecks, and simply never appears.
    const src = read(AGENT_CHAT);
    const start = src.indexOf('const AGENT_CONFIGS');
    expect(start, 'AGENT_CONFIGS not found in agent-chat — this guard is reading the wrong file').toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('\n};', start) + 3);
    const listed = new Set<string>();
    for (const m of block.matchAll(/tools:\s*\[([\s\S]*?)\]/g)) {
      for (const q of m[1].matchAll(/'([a-zA-Z0-9_]+)'/g)) listed.add(q[1]);
    }
    // A sanity floor: if the slice ever stops matching the real block, `listed` goes near-empty
    // and this test would "pass" by flagging everything — loud, but for the wrong reason.
    expect(listed.size, 'parsed suspiciously few tools from AGENT_CONFIGS — the slice is wrong').toBeGreaterThan(50);

    const unlisted = [...clustered]
      .filter((t) => implemented.has(t) && !listed.has(t))
      .sort();
    expect(
      unlisted,
      `Tool(s) in a toolkit cluster that NO agent config lists — bound by neither path, so they ` +
        `are unreachable however good the push site looks: ${unlisted.join(', ')}. Add each to ` +
        `the \`tools:\` array of every agent that should have it in AGENT_CONFIGS ` +
        `(supabase/functions/agent-chat/index.ts).`,
    ).toEqual([]);
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

  it('every quick-start `generation.mode` is a real generate_gemini mode', () => {
    // These pin the tool's `mode` enum from OUTSIDE the run/argMap machinery — the
    // interior flows force a pipeline rather than passing a tool arg — so nothing else
    // here would notice a typo, and the pin would silently select no mode at all.
    // Because a pinned mode COUNTS as surfacing generate_gemini's options above, an
    // unchecked one would also let the tool leave OPTIONS_EXEMPT on a value that
    // does not exist.
    const allowed = new Set(
      (byName.get(GEMINI_TOOL)?.params ?? []).find((p) => p.name === 'mode')?.enum ?? [],
    );
    expect(allowed.size, `${GEMINI_TOOL}.mode is no longer an enum — update this test`).toBeGreaterThan(3);

    const bad = quickStarts
      .filter((x) => x.qs.generation?.mode && !allowed.has(x.qs.generation.mode))
      .map((x) => `${x.toolkit}/"${x.qs.label}" → mode "${x.qs.generation!.mode}"`)
      .sort();
    expect(
      bad,
      `Quick-start pins a generation mode ${GEMINI_TOOL}.mode does not declare:\n  ${bad.join('\n  ')}`,
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

describe('toolkit cluster projection (agent-chat ← TOOLKITS)', () => {
  // agent-chat used to hold a SECOND, hand-written copy of cluster → tool_ids. The two
  // disagreed by four entire clusters (flows / knowledge-graph / social / tech-radar
  // were bindable by the agent and impossible to enable from the picker) and by two
  // tools inside `projects`. The old tests here DIFFED the two copies; these check
  // instead that there is only one copy left, because a projection cannot drift.
  const { source: clusterSource, problems } = generateToolkitClusters() as {
    source: string;
    problems: string[];
  };

  it('generates cleanly — every TOOLKITS entry is a readable literal', () => {
    expect(problems, `gen-tool-manifest.mjs could not parse TOOLKITS:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it('is NOT stale — regenerating produces the committed edge-function module', () => {
    expect(
      read(CLUSTERS_FILE),
      'toolkitClusters.generated.ts is out of date with agentToolsCatalog.TOOLKITS. ' +
        'Run: npm run tools:manifest',
    ).toBe(clusterSource.replace(/\r\n/g, '\n'));
  });

  it('agent-chat consumes the generated map and declares no cluster map of its own', () => {
    // The specific regression: someone re-adds `const SERVER_TOOLKITS = {...}` next to
    // the import "just for this one cluster", and both copies are live again.
    const binder = read(AGENT_CHAT);
    expect(
      binder.includes("import { TOOLKIT_CLUSTERS } from '../_shared/toolkitClusters.generated.ts'"),
      'agent-chat/index.ts no longer imports the generated TOOLKIT_CLUSTERS map.',
    ).toBe(true);
    expect(
      /const\s+SERVER_TOOLKITS\s*[:=]/.test(binder),
      'agent-chat/index.ts declares its own SERVER_TOOLKITS again — that is the ' +
        'hand-written mirror this projection replaced. Edit TOOLKITS in ' +
        'agentToolsCatalog.ts and re-run `npm run tools:manifest` instead.',
    ).toBe(false);
  });

  it('every cluster icon resolves in the picker ICON_MAP', () => {
    // ICON_MAP[toolkit.icon] || Wrench — an unknown name degrades silently to a
    // generic wrench instead of failing, so nothing surfaced 11 pre-existing
    // misses (incl. 'Plus' and 'Percent'). Assert coverage instead.
    const used = new Set(TOOLKITS.map((t) => t.icon));
    const registered = iconMapKeys('src/components/features/ai/ToolkitPickerModal.tsx');

    expect(used.size, 'no toolkit icons parsed — regex broke').toBeGreaterThan(20);
    const missing = [...used].filter((i) => !registered.has(i)).sort();
    expect(
      missing,
      `Icon(s) referenced by TOOLKITS but absent from ICON_MAP (they render as a ` +
        `generic Wrench): ${missing.join(', ')}. Import them in ToolkitPickerModal.tsx ` +
        `and add them to ICON_MAP.`,
    ).toEqual([]);
  });

  it('every QUICK-START icon resolves in the onboarding card ICON_MAP', () => {
    // Quick-start icons render in ToolkitOnboardingCard, against ITS map — a third
    // hand-kept list. The picker's map was the only one checked, so 'Video', 'Pencil',
    // 'Percent' and friends had been silently falling back to a generic Sparkles.
    const used = new Set(quickStarts.map((x) => x.qs.icon).filter((i): i is string => !!i));
    const registered = iconMapKeys('src/components/features/ai/workflows/ToolkitOnboardingCard.tsx');

    expect(used.size, 'no quick-start icons parsed — regex broke').toBeGreaterThan(20);
    const missing = [...used].filter((i) => !registered.has(i)).sort();
    expect(
      missing,
      `Icon(s) referenced by a quick-start but absent from ToolkitOnboardingCard's ` +
        `ICON_MAP (they render as a generic Sparkles): ${missing.join(', ')}.`,
    ).toEqual([]);
  });
});

/**
 * What the CHAT says when a quick-start fires, and whether a hand-written
 * deep-link still points at one.
 *
 * A `run` quick-start is deterministic: it invokes the tool directly, no LLM turn.
 * So its `prompt` is never sent anywhere — which is exactly why it rotted. The chat
 * bubble was built from `qs.label` instead, and a label is a BUTTON CAPTION sized to
 * sit under its toolkit ("This week" under Appointments, "My templates" under Email
 * Marketing). Alone in a conversation it says nothing: the user clicked "This week"
 * in the App menu and their own message read "▶ This week". Every quick-start already
 * carries the sentence — `prompt` / `promptTemplate`, authored, reviewed, and free to
 * show since a direct run spends no tokens on it.
 *
 * The deep-link check is the other half: `?quickstart=<toolkitId>:<label>` matches a
 * quick-start by its label STRING, and AgentHub's miss branch is a console.warn. So a
 * renamed label turns every hand-written launcher link into a click that opens the
 * agent and does nothing at all — no error, no toast, no clue.
 */
describe('quick-start → chat sentence', () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  /** Every .ts/.tsx under a directory. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) sourceFiles(p, out);
      else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
    }
    return out;
  }

  /** Comments describe the FORMAT ("?quickstart=<toolkit>:<label>"); they are not links. */
  const stripComments = (s: string) => sharedStripComments(s);

  it('every deterministic quick-start renders a sentence, not a button caption', () => {
    const bad: string[] = [];
    for (const { toolkit, qs, fields } of runQuickStarts) {
      const template = qs.promptTemplate || qs.prompt;
      // Fill each placeholder the way the form would, so the assertion is about the
      // sentence's shape rather than about having no fields.
      const values: Record<string, string> = {};
      for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) values[m[1]] = 'X';
      const sentence = renderPromptTemplate(template, values);

      if (sentence.includes('{{')) bad.push(`${toolkit}/"${qs.label}": unrendered placeholder → ${sentence}`);
      if (words(sentence) < 3) bad.push(`${toolkit}/"${qs.label}": too short to read as a request → "${sentence}"`);
      if (sentence.toLowerCase() === qs.label.toLowerCase()) {
        bad.push(`${toolkit}/"${qs.label}": prompt is just the label again`);
      }
      // A FORMLESS run has nothing to fill in, so its bubble is `prompt` rendered with
      // no values — that one has to stand on its own with every placeholder stripped.
      if (fields.length === 0) {
        const bare = renderPromptTemplate(qs.prompt, {});
        if (words(bare) < 3) bad.push(`${toolkit}/"${qs.label}": formless run, bubble collapses to "${bare}"`);
      }
    }
    expect(runQuickStarts.length, 'no run quick-starts parsed — the catalog moved').toBeGreaterThan(50);
    expect(
      bad,
      'A `run` quick-start puts its PROMPT in the user\'s chat bubble (the label is a ' +
        'button caption and reads as nothing on its own). These would show badly:\n' + bad.join('\n'),
    ).toEqual([]);
  });

  it('every deterministic quick-start says what it did, in words a customer can read', () => {
    // The reply to a direct run comes from `done` — there is no model turn to write
    // one. Without it the chat falls through to agent-chat's placeholder, which is
    // how "Done — ran manage_appointments." reached a customer's transcript.
    const toolNames = new Set(runQuickStarts.map((x) => x.qs.run!.tool));
    const bad: string[] = [];
    for (const { toolkit, qs } of runQuickStarts) {
      const done = (qs.done ?? '').trim();
      const at = `${toolkit}/"${qs.label}"`;
      if (!done) { bad.push(`${at}: no \`done\` copy — the reply falls back to a placeholder`); continue; }
      if (done.includes('{{')) bad.push(`${at}: \`done\` is shown verbatim, so it cannot carry {{placeholders}}`);
      if (words(done) < 3) bad.push(`${at}: \`done\` is too terse to read as a reply → "${done}"`);
      // The whole point: no internal identifiers in the customer's transcript.
      for (const t of toolNames) if (done.includes(t)) bad.push(`${at}: \`done\` names the tool "${t}"`);
      if (/_[a-z]/.test(done)) bad.push(`${at}: \`done\` contains a snake_case identifier → "${done}"`);
      if (done.toLowerCase().startsWith('done')) {
        bad.push(`${at}: the "Done, <name>!" opener is added by the Studio — don't repeat it here`);
      }
    }
    expect(
      bad,
      'A `run` quick-start needs a first-person, past-tense confirmation:\n' + bad.join('\n'),
    ).toEqual([]);
  });

  it('the bubble is built from the prompt, never from the label', () => {
    const hub = read(join(ROOT, 'src/components/features/ai/AgentHub.tsx'));
    expect(
      hub.includes('`▶ ${directRun.say}`'),
      'AgentHub no longer builds the direct-run bubble from `directRun.say`.',
    ).toBe(true);
    const captions = [...hub.matchAll(/say:\s*(?:qs|quickStart)\.label\b/g)].map((m) => m[0]);
    expect(
      captions,
      'A direct run is being announced with the quick-start LABEL. That is the button ' +
        'caption ("This week"); the bubble wants the sentence (`prompt` / the rendered ' +
        '`promptTemplate`). Keep .label only as the last-resort fallback in a `||` chain.',
    ).toEqual([]);
  });

  it('every hand-written quickstart deep-link resolves to a real quick-start', () => {
    const byLabel = (toolkitId: string, label: string) =>
      TOOLKITS.find((t) => t.id === toolkitId)?.quick_starts?.some((q) => q.label === label) ?? false;

    const misses: string[] = [];
    let literals = 0;
    // `?quickstart=<toolkitId>:<label>` written out by hand (launcher tiles, nav links).
    // Interpolated ones (`${cap.toolkitId}:${encodeURIComponent(qs.label)}` in
    // AppLauncher) come FROM the catalog and cannot drift, so they are skipped.
    for (const file of sourceFiles(join(ROOT, 'src'))) {
      const src = stripComments(read(file));
      for (const m of src.matchAll(/quickstart=([^&'"`\s)]+)/g)) {
        const raw = decodeURIComponent(m[1]);
        if (raw.includes('$') || raw.includes('<')) continue; // interpolated / doc placeholder
        literals++;
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const i = raw.indexOf(':');
        if (i < 0) { misses.push(`${rel}: malformed quickstart param "${raw}"`); continue; }
        const [tk, label] = [raw.slice(0, i), raw.slice(i + 1)];
        if (!byLabel(tk, label)) misses.push(`${rel}: ${tk}:"${label}"`);
      }
    }
    expect(literals, 'no hand-written quickstart deep-links found — the scan broke').toBeGreaterThan(3);
    // The capability registry's default action, used by every `?capability=` handoff.
    for (const cap of CAPABILITIES) {
      if (!cap.quickStartLabel) continue;
      if (!cap.toolkitId) { misses.push(`capability "${cap.id}": quickStartLabel with no toolkitId`); continue; }
      if (!byLabel(cap.toolkitId, cap.quickStartLabel)) {
        misses.push(`capability "${cap.id}": ${cap.toolkitId}:"${cap.quickStartLabel}"`);
      }
    }
    expect(
      misses,
      'These point at a quick-start label that no longer exists. AgentHub logs a ' +
        'console.warn and does nothing, so the link opens an empty agent instead of ' +
        'running anything:\n' + misses.join('\n'),
    ).toEqual([]);
  });
});

/**
 * The bound-toolkit hint. agent-chat injects "[CONTEXT] Toolkits already loaded for this turn:
 * …" so the agent does not spend a tool call and a model round trip re-loading a cluster it can
 * already call. The list was built from what the USER SELECTED, while a curated specialist binds
 * its WHOLE kit regardless of the selection — so the hint told Pepper that `b2b` was not loaded
 * while it was holding every tool in it. It called `load_toolkit('b2b')` (a 2ms no-op) and
 * offered the user a "load the toolkit" next step that cost a second full turn to answer the
 * same question again. Conversation 96da9fc8, 2026-08-18.
 */
describe('bound-toolkit hint', () => {
  const src = read(AGENT_CHAT);

  it('derives "already loaded" from the BOUND tools, not from the user selection', () => {
    const loop = src.match(
      /\/\/ Resolve toolkits → tool IDs[\s\S]*?\n {2}\}\n/,
    );
    expect(loop, 'toolkit resolution loop not found — this guard is reading the wrong file').toBeTruthy();
    expect(
      loop![0].includes('activeToolkitIds'),
      'activeToolkitIds is being filled inside the `selectedToolkits` loop again. That is the ' +
        'original defect: a curated specialist binds its whole kit, so the selection does not ' +
        'describe what is bound, and the agent gets told its own tools are unavailable.',
    ).toBe(false);

    expect(
      /const activeToolkitIds = Object\.entries\(TOOLKIT_CLUSTERS\)[\s\S]{0,600}boundToolIds/.test(src),
      'activeToolkitIds must be derived from the bound tool set (`boundToolIds`, built from ' +
        '`baseTools`). Without that, the hint cannot describe a curated specialist.',
    ).toBe(true);
  });

  it('every curated specialist actually owns clusters the old rule would have hidden', () => {
    const curated = src.match(/const CURATED_SPECIALISTS = new Set\(\[([\s\S]*?)\]\)/);
    expect(curated, 'CURATED_SPECIALISTS not found in agent-chat').toBeTruthy();
    const specialists = [...curated![1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(specialists.length, 'parsed no curated specialists — the slice is wrong').toBeGreaterThan(0);

    const start = src.indexOf('const AGENT_CONFIGS');
    const block = src.slice(start, src.indexOf('\n};', start) + 3);
    const agentTools = new Map<string, Set<string>>();
    for (const m of block.matchAll(/id:\s*'([a-z-]+)',[\s\S]*?tools:\s*\[([\s\S]*?)\n\s*\],/g)) {
      const ids = new Set<string>();
      for (const q of m[2].matchAll(/'([a-zA-Z0-9_]+)'/g)) ids.add(q[1]);
      agentTools.set(m[1], ids);
    }
    expect(agentTools.size, 'parsed suspiciously few agent configs — the slice is wrong').toBeGreaterThan(3);

    // A cluster is "bound" for a curated specialist when every tool in it that the agent is
    // permitted to use is in its config — exactly when load_toolkit would add nothing.
    const bare: string[] = [];
    for (const slug of specialists) {
      const owned = agentTools.get(slug);
      expect(owned, `curated specialist "${slug}" has no AGENT_CONFIGS entry`).toBeTruthy();
      const hidden = TOOLKITS.filter((tk) => {
        if (tk.alwaysOn) return false; // always reported under both rules
        const permitted = tk.tool_ids.filter((t) => owned!.has(t));
        return permitted.length > 0 && permitted.every((t) => owned!.has(t));
      }).map((tk) => tk.id);
      if (hidden.length === 0) bare.push(slug);
    }
    expect(
      bare,
      'These curated specialists own no non-alwaysOn cluster, which would make the bound-toolkit ' +
        'hint inert for them — either the kit shrank or CURATED_SPECIALISTS gained an agent that ' +
        `is not curated: ${bare.join(', ')}`,
    ).toEqual([]);
  });
});
