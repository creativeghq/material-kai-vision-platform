/**
 * Toolkit coverage guard.
 *
 * The agent's tools live in two hand-maintained places that MUST stay in sync:
 *   • backend  — each tool is defined with `tool(fn, { name: '<id>', schema })` in
 *                supabase/functions/_shared/tools/*.ts (+ a few inline in agent-chat).
 *   • frontend — src/components/features/ai/agentToolsCatalog.ts groups tools into
 *                toolkit clusters (`tool_ids`) that the ToolkitPickerModal renders.
 *
 * Nothing enforced that every implemented tool is actually surfaced in a cluster, so
 * the catalog silently drifted (e.g. adjust_catalog_pricing shipped on the agent but
 * was invisible in the picker until someone noticed). This test makes the invariant
 * a red build:
 *
 *   1. No cluster may reference a tool that doesn't exist (dead / renamed ref).
 *   2. Every implemented tool must be EITHER in a cluster, OR explicitly `INTERNAL`,
 *      OR on the `KNOWN_UNCLUSTERED` debt list — so a brand-new tool that nobody
 *      surfaced fails CI and forces a decision (cluster it, or mark it internal).
 *   3. `KNOWN_UNCLUSTERED` may only shrink — once a tool gets a cluster it must be
 *      pruned from the list, keeping the debt honest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOOLS_DIR = join(ROOT, 'supabase/functions/_shared/tools');
const AGENT_CHAT = join(ROOT, 'supabase/functions/agent-chat/index.ts');
const CATALOG = join(ROOT, 'src/components/features/ai/agentToolsCatalog.ts');

const NAME_RE = /name: '([a-z][a-z0-9_]+)',/g;
const TOOL_IDS_RE = /tool_ids:\s*\[([^\]]*)\]/g;
const QUOTED_RE = /'([a-z][a-z0-9_]+)'/g;

// Toolkit clusters the SERVER binds (SERVER_TOOLKITS) but the picker has no entry
// for — so `load_toolkit` can pull them mid-chat, yet a user can never enable them
// from the ToolkitPickerModal. Each one is a missing ToolkitDefinition in
// agentToolsCatalog.ts, NOT a missing tool. SHRINK by adding the picker entry;
// never grow (a newly-orphaned cluster should fail the build). See #266.
//
// Emptied 2026-07-16: flows-toolkit / knowledge-graph / social / tech-radar were
// all given picker entries. Keep at zero.
const KNOWN_PICKERLESS_CLUSTERS = new Set<string>([]);

// Per-cluster tool_ids the server binds that the picker's same-named cluster omits.
// Same rule: shrink only. Emptied 2026-07-16 (projects gained add_purchase_item +
// generate_purchase_sheet).
const KNOWN_MIRROR_GAPS: Record<string, string[]> = {};

// Genuinely not user-facing: runtime meta-tools, status pollers, and Anthropic
// structured-output schemas that only LOOK like tools to the extractor.
const INTERNAL_TOOLS = new Set([
  'load_toolkit', 'load_skill', 'check_generation_status',
  // NOT an agent tool: an Anthropic `tool_choice` structured-output schema used
  // inside the tech-radar review call (tech-radar-tools.ts). The `name:` regex
  // can't tell it apart from a LangChain tool — the Phase 0 manifest generator
  // must exclude `input_schema` blocks or it will emit phantom tools. See #266.
  'submit_findings',
]);

// Implemented + agent-bound tools that DON'T yet belong to a toolkit cluster — reachable
// only by typing in chat, invisible in the toolkit picker. Tracked tech-debt: SHRINK by
// giving each a cluster; never grow it (a new orphan should fail the build instead).
const KNOWN_UNCLUSTERED = new Set([
  // Purchasing / sourcing
  'create_purchase_order', 'send_purchase_order', 'source_product',
  // Trip expenses (submit_trip_card is user-facing: "submit a DRAFT card to finance")
  'add_trip_expense', 'create_trip_card', 'list_trip_cards', 'submit_trip_card',
  // Business expenses (added by the concurrent finance-expenses work, commit 7db30144) — not yet
  // clustered by that change; tracked here so main stays green until it gets a Finance-Hub cluster.
  'record_expense', 'list_recent_expenses',
  // Generation extras (belong in the Interior Design cluster)
  'generate_gemini', 'generate_video', 'virtual_staging',
  // HVAC / energy calculators
  'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
  // Docs / misc
  'search_workspace_docs', 'estimate_cost', 'web_search',
  // ─── Cleared 2026-07-16 (#266) ───────────────────────────────────────
  // 18 entries were removed here, not by 18 separate judgement calls but by
  // adding the 4 ToolkitDefinitions the SERVER already defined + the 2 tools
  // the picker's projects cluster omitted:
  //   knowledge-graph → product_provenance, product_price_history,
  //     projects_using_product, products_in_project, customer_overview,
  //     supplier_overview, products_by_brand, brand_overview,
  //     related_products, find_products_by_spec
  //   tech-radar      → review_solution, track_tech_radar, list_tech_radar, update_finding
  //   flows-toolkit   → manage_flows
  //   social          → manage_social
  //   projects        → add_purchase_item, generate_purchase_sheet
]);

function implementedTools(): Set<string> {
  const out = new Set<string>();
  const files = [
    ...readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts')).map((f) => join(TOOLS_DIR, f)),
    AGENT_CHAT,
  ];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(NAME_RE)) out.add(m[1]);
  }
  return out;
}

function clusteredTools(): Set<string> {
  const src = readFileSync(CATALOG, 'utf8');
  const section = src.slice(src.indexOf('export const TOOLKITS'));
  const out = new Set<string>();
  for (const block of section.matchAll(TOOL_IDS_RE)) {
    for (const t of block[1].matchAll(QUOTED_RE)) out.add(t[1]);
  }
  return out;
}

// ── Mirror parsing ───────────────────────────────────────────────────
// SERVER_TOOLKITS (agent-chat/index.ts) and TOOLKITS (agentToolsCatalog.ts) are
// two hand-maintained copies of the SAME cluster→tool_ids map; the index.ts
// comment even says "mirrored from agentToolsCatalog.ts". Only the frontend copy
// drives the picker; only the server copy drives what load_toolkit binds. They
// are held together by nothing, so we diff them here.
//
// Both are parsed by brace-matching the value AFTER the `=` — anchoring on the
// first `{` instead grabs the TYPE annotation (`Record<string, { ... }>`) and
// silently yields zero clusters, i.e. a green build that checks nothing.

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

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

/** TOOLKITS — array of `{ id: '<id>', ..., tool_ids: [...] }`. */
function frontendToolkits(): Record<string, Set<string>> {
  const body = valueBlock(read(CATALOG), 'export const TOOLKITS');
  const out: Record<string, Set<string>> = {};
  for (const { src } of childObjects(body)) {
    const m = src.match(/^\{\s*id: '([a-z0-9-]+)'/);
    if (m) out[m[1]] = idsOf(src);
  }
  return out;
}

describe('toolkit coverage', () => {
  const impl = implementedTools();
  const clustered = clusteredTools();

  it('extracts a sane number of tools (guards against a broken regex)', () => {
    expect(impl.size).toBeGreaterThan(80);
    expect(clustered.size).toBeGreaterThan(60);
  });

  it('every clustered tool_id is a real implemented tool (no dead / renamed refs)', () => {
    const dead = [...clustered].filter((t) => !impl.has(t)).sort();
    expect(dead, `agentToolsCatalog clusters reference non-existent tools: ${dead.join(', ')}`).toEqual([]);
  });

  it('every implemented tool is clustered, internal, or tracked debt (no NEW orphans)', () => {
    const newOrphans = [...impl]
      .filter((t) => !clustered.has(t) && !INTERNAL_TOOLS.has(t) && !KNOWN_UNCLUSTERED.has(t))
      .sort();
    expect(
      newOrphans,
      `New tool(s) not surfaced in any toolkit cluster: ${newOrphans.join(', ')}. ` +
        `Add each to a cluster's tool_ids in agentToolsCatalog.ts, or (if truly internal) ` +
        `to INTERNAL_TOOLS / KNOWN_UNCLUSTERED in this test.`,
    ).toEqual([]);
  });

  it('KNOWN_UNCLUSTERED stays honest — prune tools once they get a cluster', () => {
    const stale = [...KNOWN_UNCLUSTERED].filter((t) => !impl.has(t) || clustered.has(t)).sort();
    expect(stale, `Prune from KNOWN_UNCLUSTERED (now clustered or removed): ${stale.join(', ')}`).toEqual([]);
  });

  it('INTERNAL_TOOLS stays honest — only lists tools that still exist', () => {
    const stale = [...INTERNAL_TOOLS].filter((t) => !impl.has(t)).sort();
    expect(stale, `Prune from INTERNAL_TOOLS (no longer implemented): ${stale.join(', ')}`).toEqual([]);
  });
});

describe('toolkit mirror parity (SERVER_TOOLKITS ⇄ TOOLKITS)', () => {
  const server = serverToolkits();
  const front = frontendToolkits();

  it('parses both mirrors (guards against a silently-empty parse)', () => {
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

  it('no NEW server cluster is missing from the picker', () => {
    const pickerless = Object.keys(server)
      .filter((k) => !front[k] && !KNOWN_PICKERLESS_CLUSTERS.has(k))
      .sort();
    expect(
      pickerless,
      `Server binds toolkit(s) with no picker entry: ${pickerless.join(', ')}. ` +
        `Add a ToolkitDefinition to TOOLKITS in agentToolsCatalog.ts, or record it ` +
        `in KNOWN_PICKERLESS_CLUSTERS with a reason.`,
    ).toEqual([]);
  });

  it('clusters present in BOTH mirrors have identical tool_ids', () => {
    const drift: string[] = [];
    for (const id of Object.keys(server)) {
      if (!front[id]) continue;
      const allowed = new Set(KNOWN_MIRROR_GAPS[id] ?? []);
      const serverOnly = [...server[id]].filter((t) => !front[id].has(t) && !allowed.has(t));
      const pickerOnly = [...front[id]].filter((t) => !server[id].has(t));
      if (serverOnly.length) drift.push(`${id}: server-only (not in picker) → ${serverOnly.join(', ')}`);
      if (pickerOnly.length) drift.push(`${id}: picker-only (NOT bindable) → ${pickerOnly.join(', ')}`);
    }
    expect(drift, `SERVER_TOOLKITS and TOOLKITS disagree:\n  ${drift.join('\n  ')}`).toEqual([]);
  });

  it('KNOWN_PICKERLESS_CLUSTERS stays honest — prune once a picker entry exists', () => {
    const stale = [...KNOWN_PICKERLESS_CLUSTERS].filter((k) => !server[k] || front[k]).sort();
    expect(stale, `Prune from KNOWN_PICKERLESS_CLUSTERS (now surfaced or removed): ${stale.join(', ')}`).toEqual([]);
  });

  it('every icon referenced by TOOLKITS resolves in the picker ICON_MAP', () => {
    // ICON_MAP[toolkit.icon] || Wrench — an unknown name degrades silently to a
    // generic wrench instead of failing, so nothing surfaced 11 pre-existing
    // misses (incl. 'Plus' and 'Percent'). Assert coverage instead.
    const catalogSrc = read(CATALOG);
    const tk = catalogSrc.slice(catalogSrc.indexOf('export const TOOLKITS'));
    const used = new Set([...tk.matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1]));

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

  it('KNOWN_MIRROR_GAPS stays honest — prune once the picker lists the tool', () => {
    const stale: string[] = [];
    for (const [id, tools] of Object.entries(KNOWN_MIRROR_GAPS)) {
      if (!server[id] || !front[id]) { stale.push(`${id} (cluster gone)`); continue; }
      for (const t of tools) if (front[id].has(t) || !server[id].has(t)) stale.push(`${id}.${t}`);
    }
    expect(stale, `Prune from KNOWN_MIRROR_GAPS: ${stale.join(', ')}`).toEqual([]);
  });
});
