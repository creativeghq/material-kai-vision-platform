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
  'add_purchase_item', 'create_purchase_order', 'send_purchase_order', 'generate_purchase_sheet', 'source_product',
  // Trip expenses (submit_trip_card is user-facing: "submit a DRAFT card to finance")
  'add_trip_expense', 'create_trip_card', 'list_trip_cards', 'submit_trip_card',
  // Product intelligence
  'brand_overview', 'customer_overview', 'supplier_overview', 'find_products_by_spec', 'related_products',
  'products_by_brand', 'products_in_project', 'projects_using_product', 'product_price_history', 'product_provenance',
  // Automation / social
  'manage_flows', 'manage_social',
  // Generation extras (belong in the Interior Design cluster)
  'generate_gemini', 'generate_video', 'virtual_staging',
  // HVAC / energy calculators
  'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
  // Docs / misc
  'search_workspace_docs', 'estimate_cost', 'web_search',
  // Tech Radar — confirmed USER-facing (workspace-scoped findings), needs a cluster
  'list_tech_radar', 'track_tech_radar', 'review_solution', 'update_finding',
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
