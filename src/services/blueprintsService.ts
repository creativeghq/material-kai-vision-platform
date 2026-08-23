import { supabase } from '@/integrations/supabase/client';
import type { ZoneDef } from '@/utils/blueprintComposition';

/**
 * Blueprints — reusable, versioned scope-of-works templates. A blueprint is
 * a tree of sections + tasks with parametric quantity formulas and rates that may
 * link to the finance services catalog. Workspace-owned rows are editable; platform
 * starters (is_platform_starter, workspace_id NULL) are read-only and importable by
 * any workspace. CRUD here is direct-supabase (RLS-gated); pricing/compute lives in
 * the project-plan-engine edge function.
 */

export interface DimensionDef {
  key: string;
  label: string;
  unit?: string;
  default?: number;
  /**
   * What this number MEANS beyond being a number a formula can read.
   *
   * `budget` is the only role so far and it earns one: the customer's budget is the first thing a
   * kitchen retailer's checklist asks and the last thing a configurator can afford to ignore, but
   * it drives no quantity — showing it as another measurement slider is how "up to about €5,000"
   * ends up beside a €9,000 estimate with nothing pointing that out.
   */
  role?: 'budget';
}

export interface Blueprint {
  id: string;
  workspace_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  project_type: string | null;
  source_currency: string;
  dimensions_schema: DimensionDef[];
  /**
   * Zones — bottom units, top units, island, worktop — each with its own globals (height, depth,
   * door model) and module types. When this is non-empty the blueprint is configured by
   * COMPOSITION and its zone lengths/counts are derived, not typed: `dimensions_schema` then only
   * carries whatever no zone publishes. See src/utils/blueprintComposition.ts.
   */
  composition_schema: ZoneDef[];
  is_platform_starter: boolean;
  /**
   * Serve this blueprint through the embed SDK, to anonymous visitors on the tenant's own site
   * (#382 Phase 1).
   *
   * Deliberately not `status` (lifecycle) and not `is_platform_starter` (ours, not theirs) —
   * publication is a third, orthogonal fact. Publishing alone exposes nothing: an admin must also
   * create an embed key whose scope covers it, exactly as a storefront-published product does.
   * A platform starter can never be published this way; the DB refuses it, because a starter
   * carries our default rates and would quote a visitor prices the tenant never set.
   */
  is_embed_published: boolean;
  version: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BlueprintItem {
  id: string;
  blueprint_id: string;
  parent_id: string | null;
  sub_blueprint_id: string | null;
  sort_order: number;
  kind: 'section' | 'task';
  label: string;
  notes: string | null;
  unit: string | null;
  quantity_formula: string | null;
  default_quantity: number;
  line_kind: 'labor' | 'materials' | 'both';
  service_id: string | null;
  product_id: string | null;
  material_cost: number | null;
  labor_rate: number | null;
  margin_pct: number;
  option_group: string | null;
  tier: 'good' | 'better' | 'best' | null;
  is_allowance: boolean;
  allowance_amount: number | null;
  /**
   * A quantity-only line: it reports HOW MANY (hinges, drawer boxes, gola profile metres) and adds
   * nothing to the plan total. Priced when the plan becomes a quote — a client is not quoted thirty
   * hinges, but the workshop cannot order without the count. `material_cost` stays NULL until
   * someone sets a rate; NULL is "not priced yet" and must never render as 0.
   */
  is_schedule: boolean;
  /**
   * Stable slug on an option_group member. The engine publishes `opt_<key>` so OTHER lines can be
   * conditional on this choice — how the four gola parts switch on together when gola is picked.
   */
  option_key: string | null;
  /**
   * Formula giving the quantity the composition IMPLIES — `= base_corner_count` on a Le Mans
   * mechanism, because it goes in a corner unit. It SEEDS the quantity and lets a mismatch be
   * flagged; it never drives or locks the field, because how many corners get a mechanism is a
   * judgement. Contrast `quantity_formula`, which does drive and does lock.
   */
  suggests_quantity: string | null;
  /**
   * Whether a NON-option_group line starts selected when imported into a plan. Optional extras
   * (accessories, add-on mechanisms, a removal service) seed as `false` so a configurator does
   * not open with every extra already in the total. Members of an `option_group` ignore this —
   * their default is the `tier: 'good'` member.
   */
  default_selected: boolean;
  source: 'manual' | 'template' | 'ai';
  created_at: string;
  updated_at: string;
}

class BlueprintsService {
  /** List blueprints visible to the caller: own-workspace + platform starters. */
  async list(opts?: { includeStarters?: boolean; workspaceId?: string }): Promise<Blueprint[]> {
    let q = supabase.from('blueprints').select('*').eq('status', 'active').order('updated_at', { ascending: false });
    if (opts?.workspaceId && opts.includeStarters === false) q = q.eq('workspace_id', opts.workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Blueprint[];
  }

  /** Platform-starter blueprints only (for the picker + public tool). */
  async listStarters(): Promise<Blueprint[]> {
    const { data, error } = await supabase
      .from('blueprints')
      .select('*')
      .eq('is_platform_starter', true)
      .eq('status', 'active')
      .order('title');
    if (error) throw error;
    return (data ?? []) as Blueprint[];
  }

  async get(id: string): Promise<Blueprint | null> {
    const { data, error } = await supabase.from('blueprints').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Blueprint) ?? null;
  }

  async listItems(blueprintId: string): Promise<BlueprintItem[]> {
    const { data, error } = await supabase
      .from('blueprint_items')
      .select('*')
      .eq('blueprint_id', blueprintId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BlueprintItem[];
  }

  async create(input: { workspace_id: string; title: string; description?: string; project_type?: string; source_currency?: string; dimensions_schema?: DimensionDef[]; composition_schema?: ZoneDef[]; }): Promise<Blueprint> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('blueprints').insert({
      workspace_id: input.workspace_id,
      created_by: user.id,
      title: input.title,
      description: input.description ?? null,
      project_type: input.project_type ?? null,
      source_currency: input.source_currency ?? 'EUR',
      dimensions_schema: input.dimensions_schema ?? [],
      composition_schema: input.composition_schema ?? [],
    }).select('*').single();
    if (error) throw error;
    return data as Blueprint;
  }

  async update(id: string, patch: Partial<Pick<Blueprint, 'title' | 'description' | 'project_type' | 'source_currency' | 'dimensions_schema' | 'composition_schema' | 'status' | 'is_embed_published'>>): Promise<Blueprint> {
    const { data, error } = await supabase.from('blueprints').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return data as Blueprint;
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprints').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * The premade-section library: every starter blueprint's sections, for the
   * "Add section from library" pickers (project Plan tab + public estimator).
   * Readable by anon too (starters pass the RLS select policy).
   */
  async getSectionLibrary(): Promise<Array<{ blueprintId: string; blueprintTitle: string; sections: Array<{ id: string; label: string; taskCount: number }> }>> {
    const starters = await this.listStarters();
    const out: Array<{ blueprintId: string; blueprintTitle: string; sections: Array<{ id: string; label: string; taskCount: number }> }> = [];
    for (const bp of starters) {
      const items = await this.listItems(bp.id);
      const sections = items.filter((i) => i.kind === 'section').map((s) => ({
        id: s.id, label: s.label, taskCount: items.filter((i) => i.parent_id === s.id).length,
      }));
      out.push({ blueprintId: bp.id, blueprintTitle: bp.title, sections });
    }
    return out;
  }

  /** Create a workspace blueprint from an arbitrary item tree (the public tool's
   *  edited plan → import after sign-up). */
  async createFromItems(input: { workspace_id: string; title: string; source_currency?: string; dimensions_schema?: DimensionDef[]; items: Array<Partial<BlueprintItem> & { id: string; kind: 'section' | 'task'; label: string }>; }): Promise<Blueprint> {
    const bp = await this.create({
      workspace_id: input.workspace_id,
      title: input.title,
      source_currency: input.source_currency ?? 'EUR',
      dimensions_schema: input.dimensions_schema ?? [],
    });
    const idMap: Record<string, string> = {};
    for (const it of input.items) idMap[it.id] = crypto.randomUUID();
    await this.replaceItems(bp.id, input.items.map((it) => ({
      ...it,
      id: idMap[it.id],
      parent_id: it.parent_id ? idMap[it.parent_id] ?? null : null,
      source: 'template' as const,
    })));
    return bp;
  }

  /** Replace the full item tree for a blueprint (editor "Save"). */
  async replaceItems(blueprintId: string, items: Array<Partial<BlueprintItem> & { kind: 'section' | 'task'; label: string }>): Promise<void> {
    const { error: delErr } = await supabase.from('blueprint_items').delete().eq('blueprint_id', blueprintId);
    if (delErr) throw delErr;
    if (!items.length) return;
    const rows = items.map((it, idx) => ({
      blueprint_id: blueprintId,
      id: it.id,
      parent_id: it.parent_id ?? null,
      sub_blueprint_id: it.sub_blueprint_id ?? null,
      sort_order: it.sort_order ?? idx,
      kind: it.kind,
      label: it.label,
      notes: it.notes ?? null,
      unit: it.unit ?? null,
      quantity_formula: it.quantity_formula ?? null,
      default_quantity: it.default_quantity ?? 1,
      line_kind: it.line_kind ?? 'labor',
      service_id: it.service_id ?? null,
      product_id: it.product_id ?? null,
      material_cost: it.material_cost ?? null,
      labor_rate: it.labor_rate ?? null,
      margin_pct: it.margin_pct ?? 0,
      option_group: it.option_group ?? null,
      tier: it.tier ?? null,
      is_allowance: it.is_allowance ?? false,
      allowance_amount: it.allowance_amount ?? null,
      is_schedule: it.is_schedule ?? false,
      option_key: it.option_key ?? null,
      suggests_quantity: it.suggests_quantity ?? null,
      default_selected: it.default_selected ?? true,
      source: it.source ?? 'manual',
    }));
    const { error } = await supabase.from('blueprint_items').insert(rows);
    if (error) throw error;
  }

  /**
   * Copy any blueprint (a platform starter or one of your own) into the active
   * workspace. Optionally override the title and bake dimension values in as the
   * new defaults (used by the public-tool "import after sign-up" flow). One method
   * reused by: library "Copy to my library", the read-only starter viewer's
   * "Copy to edit", and the post-login import.
   */
  async duplicate(sourceId: string, workspaceId: string, opts?: { title?: string; dimensionValues?: Record<string, number> }): Promise<Blueprint> {
    const source = await this.get(sourceId);
    if (!source) throw new Error('Blueprint not found');
    const items = await this.listItems(sourceId);

    const schema = (source.dimensions_schema ?? []).map((d) => ({
      ...d,
      default: opts?.dimensionValues?.[d.key] ?? d.default,
    }));

    const bp = await this.create({
      workspace_id: workspaceId,
      title: opts?.title ?? `${source.title} (copy)`,
      description: source.description ?? undefined,
      project_type: source.project_type ?? undefined,
      source_currency: source.source_currency,
      dimensions_schema: schema,
      // Without this a copied starter keeps the option groups but loses the zones that price
      // them — the configurator disappears and the copy silently becomes a flat price list.
      composition_schema: source.composition_schema ?? [],
    });

    const idMap: Record<string, string> = {};
    for (const it of items) idMap[it.id] = crypto.randomUUID();
    await this.replaceItems(bp.id, items.map((it) => ({
      ...it,
      id: idMap[it.id],
      parent_id: it.parent_id ? idMap[it.parent_id] ?? null : null,
      source: 'template' as const,
    })));
    return bp;
  }

  /**
   * Save a project plan back into the workspace blueprint library so it can be
   * reused. Copies the plan's items (stripping resolved prices/quantities — a
   * blueprint stores formulas + rates, not resolved numbers) into a fresh blueprint.
   */
  async createFromPlan(input: { workspace_id: string; plan_id: string; title: string; description?: string; project_type?: string; }): Promise<Blueprint> {
    const { data: plan, error: pErr } = await supabase.from('project_plans').select('source_currency, dimensions').eq('id', input.plan_id).maybeSingle();
    if (pErr) throw pErr;
    const { data: items, error: iErr } = await supabase.from('project_plan_items').select('*').eq('plan_id', input.plan_id).order('sort_order');
    if (iErr) throw iErr;

    // Derive a dimensions_schema from the plan's dimension keys
    const dims = (plan?.dimensions ?? {}) as Record<string, number>;
    const dimensions_schema: DimensionDef[] = Object.keys(dims).map((key) => ({ key, label: key, default: Number(dims[key]) }));

    const bp = await this.create({
      workspace_id: input.workspace_id,
      title: input.title,
      description: input.description,
      project_type: input.project_type,
      source_currency: plan?.source_currency ?? 'EUR',
      dimensions_schema,
    });

    // Re-id items to fresh blueprint_item ids, preserving hierarchy
    const idMap: Record<string, string> = {};
    for (const it of (items ?? [])) idMap[it.id] = crypto.randomUUID();
    const bpItems = (items ?? []).map((it: any) => ({
      id: idMap[it.id],
      blueprint_id: bp.id,
      parent_id: it.parent_id ? idMap[it.parent_id] ?? null : null,
      sort_order: it.sort_order,
      kind: it.kind,
      label: it.label,
      notes: it.notes,
      unit: it.unit,
      quantity_formula: it.quantity_formula,
      default_quantity: it.quantity ?? 1,
      line_kind: it.line_kind,
      service_id: it.service_id,
      product_id: it.product_id,
      material_cost: it.material_cost,
      labor_rate: it.labor_rate,
      margin_pct: it.margin_pct,
      option_group: it.option_group,
      tier: it.tier,
      is_allowance: it.is_allowance,
      allowance_amount: it.allowance_amount,
      // Which optional extras the plan had switched on becomes the template's default.
      // Option-group members record their state too, but readers ignore it for them
      // and re-pick the tier:'good' member on import.
      default_selected: it.is_selected !== false,
      source: 'template' as const,
    }));
    if (bpItems.length) {
      const { error } = await supabase.from('blueprint_items').insert(bpItems);
      if (error) throw error;
    }
    return bp;
  }
}

export const blueprintsService = new BlueprintsService();
