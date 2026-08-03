// project-plan-engine — authoritative compute for the Blueprint estimating engine.
// The ONLY writer of persisted plan-line prices, plan versions, and plan→quote items.
// The frontend may edit plan_items directly (RLS-gated) for labels/quantities, then calls
// this function to (re)compute authoritative money. Actions:
//   create-from-blueprint  {project_id?, blueprint_id, dimensions?, title?}  -> {plan, items}
//   rescale                {plan_id, dimensions}                            -> {plan, items}
//   reprice                {plan_id}                                        -> {plan, items}
//   save-version           {plan_id, note?}                                 -> {version}
//   restore-version        {plan_id, version}                              -> {plan, items}
//   create-quote-from-plan {plan_id}                                        -> {quote_id}
// Auth: user JWT (or service role). Every write is bound to the caller's workspace via
// userCanAccessWorkspace — the service-role client bypasses RLS, so we re-check membership.

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { evaluateFormula, computeLinePricing, round2 } from '../_shared/blueprint/formula.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ItemRow {
  id: string;
  parent_id: string | null;
  sub_blueprint_id?: string | null;
  sort_order: number;
  kind: string;
  label: string;
  notes: string | null;
  unit: string | null;
  quantity_formula: string | null;
  default_quantity?: number;
  quantity?: number;
  line_kind: string;
  service_id: string | null;
  product_id: string | null;
  material_cost: number | null;
  labor_rate: number | null;
  margin_pct: number | null;
  unit_price?: number;
  line_total?: number;
  option_group: string | null;
  tier: string | null;
  is_selected?: boolean;
  is_allowance: boolean;
  allowance_amount: number | null;
  source: string;
}


// Resolve rates for service_id/product_id from product_prices (latest confirmed list_price).
async function buildRateMap(supabase: DbClient, items: ItemRow[]) {
  const ids = new Set<string>();
  for (const it of items) { if (it.service_id) ids.add(it.service_id); if (it.product_id) ids.add(it.product_id); }
  const map: Record<string, number> = {};
  if (ids.size === 0) return map;
  const { data } = await supabase
    .from('product_prices')
    .select('product_id, list_price, confirmed_at')
    .in('product_id', Array.from(ids))
    .order('confirmed_at', { ascending: false });
  for (const row of (data ?? []) as { product_id: string; list_price: number | null }[]) {
    if (map[row.product_id] === undefined && row.list_price != null) map[row.product_id] = Number(row.list_price);
  }
  return map;
}

// Recompute quantity (from formula) + pricing for one item against the dimensions + rate map.
function resolveItem(it: ItemRow, dims: Record<string, number>, rates: Record<string, number>) {
  if (it.kind === 'section') return { quantity: 0, unit_price: 0, line_total: 0 };
  let qty: number;
  if (it.quantity_formula && String(it.quantity_formula).trim() !== '') {
    const r = evaluateFormula(it.quantity_formula, dims);
    qty = r.ok ? r.value : Number(it.quantity ?? it.default_quantity ?? 1);
  } else {
    qty = Number(it.quantity ?? it.default_quantity ?? 1);
  }
  qty = round2(qty);
  const { unit_price, line_total } = computeLinePricing({
    is_allowance: it.is_allowance,
    allowance_amount: it.allowance_amount,
    material_cost: it.material_cost,
    labor_rate: it.labor_rate,
    resolved_material: it.product_id ? rates[it.product_id] ?? null : null,
    resolved_labor: it.service_id ? rates[it.service_id] ?? null : null,
    margin_pct: it.margin_pct,
    quantity: qty,
    is_selected: it.is_selected,
  });
  return { quantity: qty, unit_price, line_total };
}

// Load a blueprint's items, expanding sub_blueprint_id nodes into nested sections.
// Depth-guarded + cycle-guarded. Returns a flat list with remapped parent ids.
async function loadBlueprintTree(
  supabase: DbClient,
  blueprintId: string,
  parentId: string | null,
  depth: number,
  visited: Set<string>,
  out: ItemRow[],
): Promise<void> {
  if (depth > 3 || visited.has(blueprintId)) return;
  visited.add(blueprintId);
  const { data, error } = await supabase
    .from('blueprint_items')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('sort_order', { ascending: true });
  if (error) throw new HttpError(400, `Failed to load blueprint items: ${error.message}`);
  const rows = (data ?? []) as ItemRow[];
  // Build id->newId map preserving hierarchy within this blueprint
  const idMap: Record<string, string> = {};
  for (const r of rows) idMap[r.id] = crypto.randomUUID();
  for (const r of rows) {
    const newId = idMap[r.id];
    const newParent = r.parent_id ? (idMap[r.parent_id] ?? parentId) : parentId;
    out.push({ ...r, id: newId, parent_id: newParent });
    if (r.sub_blueprint_id) {
      // expand the referenced blueprint as children of this node
      await loadBlueprintTree(supabase, r.sub_blueprint_id, newId, depth + 1, new Set(visited), out);
    }
  }
  visited.delete(blueprintId);
}

// Within each option_group, ensure exactly one member is selected by default
// (prefer tier 'good', else the lowest sort_order). Mutates is_selected in place.
// Used on import; manual edits thereafter manage selection via is_selected directly.
function applyOptionDefaults(items: ItemRow[]) {
  const groups: Record<string, ItemRow[]> = {};
  for (const it of items) {
    if (it.option_group) (groups[it.option_group] ||= []).push(it);
  }
  for (const members of Object.values(groups)) {
    const already = members.find((m) => m.is_selected === true);
    const pick = already
      ?? members.find((m) => m.tier === 'good')
      ?? [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    for (const m of members) m.is_selected = m.id === pick?.id;
  }
}

// Persist resolved items for a plan (replace-all) and return the stored rows + subtotal.
async function writePlanItems(supabase: DbClient, planId: string, items: ItemRow[], dims: Record<string, number>) {
  const rates = await buildRateMap(supabase, items);
  let subtotal = 0;
  const rows = items.map((it) => {
    const r = resolveItem(it, dims, rates);
    if (it.kind !== 'section') subtotal += r.line_total;
    return {
      id: it.id,
      plan_id: planId,
      parent_id: it.parent_id,
      sort_order: it.sort_order ?? 0,
      kind: it.kind,
      label: it.label,
      notes: it.notes ?? null,
      unit: it.unit ?? null,
      quantity_formula: it.quantity_formula ?? null,
      quantity: r.quantity,
      line_kind: it.line_kind ?? 'labor',
      service_id: it.service_id ?? null,
      product_id: it.product_id ?? null,
      material_cost: it.material_cost ?? null,
      labor_rate: it.labor_rate ?? null,
      margin_pct: it.margin_pct ?? 0,
      unit_price: r.unit_price,
      line_total: r.line_total,
      option_group: it.option_group ?? null,
      tier: it.tier ?? null,
      is_selected: it.is_selected !== false,
      is_allowance: it.is_allowance ?? false,
      allowance_amount: it.allowance_amount ?? null,
      source: it.source ?? 'manual',
    };
  });
  // parents must exist before children (self-FK). Insert sections first, then tasks by depth.
  // Simpler: drop the self-FK ordering problem by inserting all with FK deferred is not available,
  // so sort so parents precede children.
  const ordered = topoOrder(rows);
  await supabase.from('project_plan_items').delete().eq('plan_id', planId);
  if (ordered.length) {
    const { error } = await supabase.from('project_plan_items').insert(ordered);
    if (error) throw new HttpError(400, `Failed to write plan items: ${error.message}`);
  }
  return { subtotal: round2(subtotal) };
}

// Order rows so any row's parent appears before it (parent_id self-FK on insert).
function topoOrder<T extends { id: string; parent_id: string | null }>(rows: T[]): T[] {
  const byParent: Record<string, T[]> = {};
  for (const r of rows) {
    const k = r.parent_id ?? '__root__';
    (byParent[k] ||= []).push(r);
  }
  const out: T[] = [];
  const walk = (key: string) => {
    for (const r of byParent[key] ?? []) { out.push(r); walk(r.id); }
  };
  walk('__root__');
  // include any orphans (parent not present) to avoid dropping rows
  if (out.length !== rows.length) {
    const seen = new Set(out.map((r) => r.id));
    for (const r of rows) if (!seen.has(r.id)) out.push(r);
  }
  return out;
}

// Build quote_item rows from a plan's selected leaf tasks, grouped by section→room.
function buildQuoteItems(quoteId: string, items: ItemRow[]) {
  const sectionLabel: Record<string, string> = {};
  for (const it of items) if (it.kind === 'section') sectionLabel[it.id] = it.label;
  const leaf = items.filter((it) => it.kind !== 'section' && it.is_selected !== false);
  const rows = leaf.map((it) => {
    const qty = Number(it.quantity ?? 1);
    const lineTotal = Number(it.line_total ?? 0);
    const dimsText = it.is_allowance ? 'Allowance' : `${qty}${it.unit ? ` ${it.unit}` : ''} × ${Number(it.unit_price ?? 0).toFixed(2)}`;
    return {
      quote_id: quoteId,
      product_id: null,
      custom_product_name: it.label,
      custom_unit: it.unit ?? null,
      quantity: 1,
      unit_price: lineTotal,
      line_total: lineTotal,
      room: it.parent_id ? sectionLabel[it.parent_id] ?? null : null,
      dimensions: dimsText,
      notes: it.notes ?? null,
      added_from: 'manual',
    };
  });
  const subtotal = round2(leaf.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
  return { rows, subtotal };
}

async function loadPlan(supabase: DbClient, planId: string) {
  const { data, error } = await supabase.from('project_plans').select('*').eq('id', planId).maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, 'Plan not found');
  return data;
}

/** Resolve the project's client so a plan-generated quote carries the customer (pricing / email /
 *  invoicing) — CreateQuoteModal does this from the project too, so the paths agree. */
async function projectCustomer(supabase: DbClient, projectId: string | null): Promise<{ customer_company_id: string | null; customer_contact_id: string | null }> {
  if (!projectId) return { customer_company_id: null, customer_contact_id: null };
  const { data } = await supabase.from('projects').select('client_company_id, client_contact_id').eq('id', projectId).maybeSingle();
  return {
    customer_company_id: (data as any)?.client_company_id ?? null,
    customer_contact_id: (data as any)?.client_contact_id ?? null,
  };
}

async function loadPlanItems(supabase: DbClient, planId: string): Promise<ItemRow[]> {
  const { data, error } = await supabase.from('project_plan_items').select('*').eq('plan_id', planId).order('sort_order');
  if (error) throw new HttpError(400, error.message);
  return (data ?? []) as ItemRow[];
}

async function requireWorkspace(supabase: DbClient, userId: string | null, workspaceId: string, isService: boolean) {
  if (isService) return;
  const ok = await userCanAccessWorkspace(supabase, userId, workspaceId);
  if (!ok) throw new HttpError(403, 'Not a member of this workspace');
}

const handler = withApiLogging('project-plan-engine', async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const auth = await authenticate(req, { requireUser: false });
  if (!auth.success) return json({ error: auth.error || 'Unauthorized' }, 401);
  const supabase = auth.supabase;
  const userId = auth.userId;
  const isService = auth.level === 'secret';

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;
  if (!action) throw new HttpError(400, 'Missing action');

  switch (action) {
    case 'create-from-blueprint': {
      const { project_id, blueprint_id, dimensions, title } = body;
      if (!blueprint_id) throw new HttpError(400, 'blueprint_id required');
      const { data: bp, error: bpErr } = await supabase.from('blueprints').select('*').eq('id', blueprint_id).maybeSingle();
      if (bpErr) throw new HttpError(400, bpErr.message);
      if (!bp) throw new HttpError(404, 'Blueprint not found');

      // Resolve the target workspace + user. project_id (when given) determines workspace.
      let workspaceId: string;
      let planUserId = userId;
      if (project_id) {
        const { data: proj, error: pErr } = await supabase.from('projects').select('id, workspace_id, user_id').eq('id', project_id).maybeSingle();
        if (pErr) throw new HttpError(400, pErr.message);
        if (!proj) throw new HttpError(404, 'Project not found');
        workspaceId = proj.workspace_id;
        planUserId = planUserId ?? proj.user_id;
      } else if (bp.workspace_id) {
        workspaceId = bp.workspace_id;
      } else {
        throw new HttpError(400, 'project_id required when importing a platform-starter blueprint');
      }
      await requireWorkspace(supabase, userId, workspaceId, isService);

      // default dimensions from the blueprint schema
      const dims: Record<string, number> = {};
      for (const d of (bp.dimensions_schema ?? []) as { key: string; default?: number }[]) {
        dims[d.key] = Number(d.default ?? 0);
      }
      Object.assign(dims, dimensions ?? {});

      // build plan item tree from the blueprint (with sub-blueprint expansion)
      const tree: ItemRow[] = [];
      await loadBlueprintTree(supabase, blueprint_id, null, 0, new Set(), tree);
      applyOptionDefaults(tree); // one tier per option_group selected by default

      const { data: plan, error: planErr } = await supabase.from('project_plans').insert({
        project_id: project_id ?? null,
        workspace_id: workspaceId,
        user_id: planUserId,
        blueprint_id,
        title: title || bp.title,
        dimensions: dims,
        source_currency: bp.source_currency || 'EUR',
        status: 'draft',
        created_by: userId,
      }).select().single();
      if (planErr) throw new HttpError(400, `Failed to create plan: ${planErr.message}`);

      const { subtotal } = await writePlanItems(supabase, plan.id, tree, dims);
      await supabase.from('project_plans').update({ subtotal }).eq('id', plan.id);
      const items = await loadPlanItems(supabase, plan.id);
      return json({ plan: { ...plan, subtotal }, items });
    }

    case 'rescale':
    case 'reprice': {
      const { plan_id } = body;
      if (!plan_id) throw new HttpError(400, 'plan_id required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      const dims: Record<string, number> = action === 'rescale'
        ? { ...(plan.dimensions ?? {}), ...(body.dimensions ?? {}) }
        : (plan.dimensions ?? {});
      const items = await loadPlanItems(supabase, plan_id);
      const { subtotal } = await writePlanItems(supabase, plan_id, items, dims);
      await supabase.from('project_plans').update({ dimensions: dims, subtotal }).eq('id', plan_id);
      const fresh = await loadPlanItems(supabase, plan_id);
      return json({ plan: { ...plan, dimensions: dims, subtotal }, items: fresh });
    }

    case 'save-version': {
      const { plan_id, note } = body;
      if (!plan_id) throw new HttpError(400, 'plan_id required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      const items = await loadPlanItems(supabase, plan_id);
      const { data: maxV } = await supabase.from('project_plan_versions').select('version').eq('plan_id', plan_id).order('version', { ascending: false }).limit(1).maybeSingle();
      const nextV = (maxV?.version ?? 0) + 1;
      const { error } = await supabase.from('project_plan_versions').insert({
        plan_id, version: nextV, note: note ?? null, created_by: userId,
        snapshot: { dimensions: plan.dimensions, subtotal: plan.subtotal, items },
      });
      if (error) throw new HttpError(400, error.message);
      await supabase.from('project_plans').update({ version: nextV }).eq('id', plan_id);
      return json({ version: nextV });
    }

    case 'restore-version': {
      const { plan_id, version } = body;
      if (!plan_id || version == null) throw new HttpError(400, 'plan_id and version required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      const { data: ver, error } = await supabase.from('project_plan_versions').select('*').eq('plan_id', plan_id).eq('version', version).maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!ver) throw new HttpError(404, 'Version not found');
      const snap = ver.snapshot as { dimensions: Record<string, number>; items: ItemRow[] };
      // re-id the snapshot items so self-FKs are fresh
      const idMap: Record<string, string> = {};
      for (const it of snap.items) idMap[it.id] = crypto.randomUUID();
      const reIded = snap.items.map((it) => ({ ...it, id: idMap[it.id], parent_id: it.parent_id ? idMap[it.parent_id] ?? null : null }));
      const dims = snap.dimensions ?? plan.dimensions ?? {};
      const { subtotal } = await writePlanItems(supabase, plan_id, reIded, dims);
      await supabase.from('project_plans').update({ dimensions: dims, subtotal }).eq('id', plan_id);
      const items = await loadPlanItems(supabase, plan_id);
      return json({ plan: { ...plan, dimensions: dims, subtotal }, items });
    }

    case 'create-quote-from-plan': {
      const { plan_id } = body;
      if (!plan_id) throw new HttpError(400, 'plan_id required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      const items = await loadPlanItems(supabase, plan_id);

      // Reuse the plan's existing DRAFT quote if it has one (idempotent regenerate —
      // avoids piling up duplicate drafts on repeated clicks / re-quotes). Once the
      // quote has been sent/accepted we leave it alone and create a fresh one.
      let quote: { id: string } | null = null;
      if (plan.quote_id) {
        const { data: existing } = await supabase.from('quotes').select('id, status').eq('id', plan.quote_id).maybeSingle();
        if (existing && existing.status === 'draft') {
          quote = { id: existing.id };
          await supabase.from('quote_items').delete().eq('quote_id', existing.id); // rebuild from the current plan
          await supabase.from('quotes').update({ name: plan.title }).eq('id', existing.id);
        }
      }
      if (!quote) {
        const cust = await projectCustomer(supabase, plan.project_id);
        const { data: created, error: qErr } = await supabase.from('quotes').insert({
          user_id: plan.user_id,
          workspace_id: plan.workspace_id,
          project_id: plan.project_id,
          ...cust,
          name: plan.title,
          status: 'draft',
          currency: plan.source_currency || 'EUR',
          notes: `Created from project plan${plan.brief ? `: ${plan.brief}` : ''}`,
        }).select().single();
        if (qErr) throw new HttpError(400, `Failed to create quote: ${qErr.message}`);
        quote = { id: created.id };
      }

      const { rows: quoteItems, subtotal } = buildQuoteItems(quote.id, items);
      if (quoteItems.length) {
        const { error: qiErr } = await supabase.from('quote_items').insert(quoteItems);
        if (qiErr) throw new HttpError(400, `Failed to add quote items: ${qiErr.message}`);
      }
      await supabase.from('quotes').update({ total_items: quoteItems.length, subtotal }).eq('id', quote.id);
      await supabase.from('project_plans').update({ quote_id: quote.id, status: 'quoted' }).eq('id', plan_id);
      return json({ quote_id: quote.id });
    }

    case 'add-section-from-blueprint': {
      // Append a single premade section (+ its tasks) from any blueprint into an
      // existing plan, then reprice. Lets a project be built from parts without
      // importing a whole blueprint.
      const { plan_id, source_blueprint_id, section_id } = body;
      if (!plan_id || !source_blueprint_id || !section_id) throw new HttpError(400, 'plan_id, source_blueprint_id, section_id required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);

      const { data: srcItems, error } = await supabase.from('blueprint_items').select('*').eq('blueprint_id', source_blueprint_id);
      if (error) throw new HttpError(400, error.message);
      const rows = (srcItems ?? []) as ItemRow[];
      const section = rows.find((i) => i.id === section_id && i.kind === 'section');
      if (!section) throw new HttpError(404, 'Section not found');
      const tasks = rows.filter((i) => i.parent_id === section_id);

      const existing = await loadPlanItems(supabase, plan_id);
      const maxSort = existing.filter((i) => i.kind === 'section').reduce((m, i) => Math.max(m, i.sort_order ?? 0), -1);
      const newSecId = crypto.randomUUID();
      const appended: ItemRow[] = [{ ...section, id: newSecId, parent_id: null, sort_order: maxSort + 1 }];
      tasks.forEach((t, idx) => appended.push({ ...t, id: crypto.randomUUID(), parent_id: newSecId, sort_order: idx }));

      const dims = plan.dimensions ?? {};
      const { subtotal } = await writePlanItems(supabase, plan_id, [...existing, ...appended], dims);
      await supabase.from('project_plans').update({ subtotal }).eq('id', plan_id);
      const items = await loadPlanItems(supabase, plan_id);
      return json({ plan: { ...plan, subtotal }, items });
    }

    case 'generate-material-list': {
      // Derive a material shopping list from the plan's selected material-bearing
      // leaf tasks → project_purchase_items (existing finance/PDF surface).
      const { plan_id } = body;
      if (!plan_id) throw new HttpError(400, 'plan_id required');
      const plan = await loadPlan(supabase, plan_id);
      if (!plan.project_id) throw new HttpError(400, 'Plan is not attached to a project');
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      const items = await loadPlanItems(supabase, plan_id);
      const sectionLabel: Record<string, string> = {};
      for (const it of items) if (it.kind === 'section') sectionLabel[it.id] = it.label;

      const materialRows = items.filter((it) =>
        it.kind !== 'section' && it.is_selected !== false &&
        (it.is_allowance || it.line_kind === 'materials' || it.line_kind === 'both' || it.material_cost != null || it.product_id != null));

      const purchaseItems = materialRows.map((it, idx) => {
        const qty = it.is_allowance ? 1 : Math.max(Number(it.quantity ?? 1), 0.0001);
        const unitCost = it.is_allowance
          ? Number(it.allowance_amount ?? 0)
          : (it.material_cost != null ? Number(it.material_cost) : null);
        return {
          project_id: plan.project_id,
          workspace_id: plan.workspace_id,
          created_by: userId,
          item_type: 'other',
          name: it.label,
          category: it.parent_id ? sectionLabel[it.parent_id] ?? null : null,
          quantity: qty,
          unit_cost: unitCost,
          currency: plan.source_currency || 'EUR',
          status: 'draft',
          details: { source: 'blueprint_plan', plan_id, unit: it.unit ?? null, is_allowance: !!it.is_allowance },
          sort_order: idx,
        };
      });
      if (purchaseItems.length) {
        const { error: piErr } = await supabase.from('project_purchase_items').insert(purchaseItems);
        if (piErr) throw new HttpError(400, `Failed to write material list: ${piErr.message}`);
      }
      return json({ count: purchaseItems.length });
    }

    case 'create-change-order': {
      // Plan changed after its quote was approved → spawn a revision quote (delta
      // captured as a fresh quote in the parent_quote_id chain) for re-approval.
      const { plan_id } = body;
      if (!plan_id) throw new HttpError(400, 'plan_id required');
      const plan = await loadPlan(supabase, plan_id);
      await requireWorkspace(supabase, userId, plan.workspace_id, isService);
      if (!plan.quote_id) throw new HttpError(400, 'Plan has no quote to revise');
      const { data: prevQuote } = await supabase.from('quotes').select('revision_number').eq('id', plan.quote_id).maybeSingle();
      const items = await loadPlanItems(supabase, plan_id);

      const coCust = await projectCustomer(supabase, plan.project_id);
      const { data: quote, error: qErr } = await supabase.from('quotes').insert({
        user_id: plan.user_id,
        workspace_id: plan.workspace_id,
        project_id: plan.project_id,
        ...coCust,
        name: `${plan.title} (revised)`,
        status: 'draft',
        currency: plan.source_currency || 'EUR',
        parent_quote_id: plan.quote_id,
        revision_number: (prevQuote?.revision_number ?? 1) + 1,
        notes: 'Change order generated from updated project plan',
      }).select().single();
      if (qErr) throw new HttpError(400, `Failed to create change order: ${qErr.message}`);

      const { rows: quoteItems, subtotal } = buildQuoteItems(quote.id, items);
      if (quoteItems.length) {
        const { error: qiErr } = await supabase.from('quote_items').insert(quoteItems);
        if (qiErr) throw new HttpError(400, `Failed to add quote items: ${qiErr.message}`);
      }
      await supabase.from('quotes').update({ total_items: quoteItems.length, subtotal }).eq('id', quote.id);
      await supabase.from('project_plans').update({ quote_id: quote.id, status: 'quoted' }).eq('id', plan_id);
      return json({ quote_id: quote.id });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
});

Deno.serve(handler);
