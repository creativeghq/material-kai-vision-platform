/**
 * Product configurator — options, live material swap, and configured pricing (#321 M2, #260 Phase 1).
 *
 * **The price is never computed here.** `get_configured_product_price` returns `configured_price`
 * already derived, and this module hands it to the UI to format. That is CLAUDE.md's first
 * anti-regression rule applied to a new money quantity: "base plus the options you picked" is
 * exactly the arithmetic that gets rewritten in the configurator, the quote builder and the embed
 * widget and then disagrees between them. A wrong total is a valid `number`, so nothing downstream
 * — not typecheck, not an integrity probe — can notice. Summing `price_delta` in TypeScript is a
 * bug even when it produces the right answer today;
 * [tests/unit/configuratorMoneyDerivation.test.ts](../../tests/unit/configuratorMoneyDerivation.test.ts)
 * fails the build on it.
 *
 * Options are AUTHORED data in their own tables, deliberately not in `products.attributes` — that
 * column is the gold layer of the facet pipeline and is rebuilt wholesale from `attributes_raw` by
 * the recanonicalize sweep, which would erase them without an error (#260 left this question open;
 * this is the answer and the reason).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ProductOptionGroup = Tables<'product_option_groups'>;
export type ProductOptionValue = Tables<'product_option_values'>;
export type ProductConfiguration = Tables<'product_configurations'>;

/** A group with its choices, ready to render. */
export interface OptionGroupWithValues extends ProductOptionGroup {
  values: ProductOptionValue[];
}

/**
 * What the SQL derivation returns. `configured_price` is the ONLY number a caller should show as
 * the price — `final_sell` is the base, before options.
 */
export interface ConfiguredPrice {
  currency: string;
  /** Base price before options. Null when the product is unpriced. */
  final_sell: number | null;
  /** Sum of the applied option deltas. */
  option_delta: number;
  /** Base + deltas, derived in SQL. Null when the product is unpriced — never invented. */
  configured_price: number | null;
  unpriced: boolean;
  /**
   * How many option ids were sent vs. how many actually belonged to this product. A mismatch means
   * ids were ignored — surfaced rather than swallowed, because silently dropping one is how a
   * configurator quotes the wrong number with total confidence.
   */
  options_requested: number;
  options_applied: number;
  /**
   * Rule violations for this selection (#260 Phase 2), evaluated in the SAME call that produced
   * the price so the two can never be fetched out of step.
   *
   * There is no client-side rules engine on purpose: a second implementation would eventually
   * disagree, and then the configurator shows a combination as valid that the quote rejects.
   */
  violations: OptionViolation[];
  is_valid: boolean;
}

export interface OptionViolation {
  type: 'excludes' | 'requires';
  when_value_id: string;
  when_label: string;
  then_value_id: string;
  then_label: string;
  note: string | null;
}

/** One violation, phrased for a person rather than a rules table. */
export function describeViolation(v: OptionViolation): string {
  if (v.note) return v.note;
  return v.type === 'excludes'
    ? `${v.when_label} cannot be combined with ${v.then_label}`
    : `${v.when_label} requires ${v.then_label}`;
}

/** The visual part of a choice, applied to a glTF material by name. */
export interface MaterialOverride {
  targetMaterialName: string;
  baseColorHex?: string | null;
  roughness?: number | null;
  metalness?: number | null;
}

export const productConfiguratorService = {
  /** Compatibility rules for a product, with both sides' labels resolved for display. */
  async listRules(productId: string): Promise<Array<{
    id: string; rule_type: 'excludes' | 'requires';
    when_value_id: string; then_value_id: string; note: string | null;
  }>> {
    const { data, error } = await supabase
      .from('product_option_rules')
      .select('id, rule_type, when_value_id, then_value_id, note')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as never;
  },

  async addRule(
    workspaceId: string,
    productId: string,
    ruleType: 'excludes' | 'requires',
    whenValueId: string,
    thenValueId: string,
  ): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('product_option_rules').insert({
      workspace_id: workspaceId,
      product_id: productId,
      rule_type: ruleType,
      when_value_id: whenValueId,
      then_value_id: thenValueId,
      created_by: auth.user?.id ?? null,
    });
    if (error) throw error;
  },

  async removeRule(id: string): Promise<void> {
    const { error } = await supabase.from('product_option_rules').delete().eq('id', id);
    if (error) throw error;
  },

  /** Option groups for a product, each with its values, in author-defined order. */
  async listOptions(productId: string): Promise<OptionGroupWithValues[]> {
    const { data: groups, error: gErr } = await supabase
      .from('product_option_groups')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    if (gErr) throw gErr;
    if (!groups || groups.length === 0) return [];

    const { data: values, error: vErr } = await supabase
      .from('product_option_values')
      .select('*')
      .in('group_id', groups.map((g) => g.id))
      .order('sort_order', { ascending: true });
    if (vErr) throw vErr;

    const byGroup = new Map<string, ProductOptionValue[]>();
    for (const v of values ?? []) {
      const list = byGroup.get(v.group_id) ?? [];
      list.push(v);
      byGroup.set(v.group_id, list);
    }
    return groups.map((g) => ({ ...g, values: byGroup.get(g.id) ?? [] }));
  },

  /**
   * The default selection: each group's `is_default` value, or its first.
   *
   * Returned as group_id → value_id so the caller can drive a controlled picker without inventing
   * its own idea of "what is selected before the user touches anything".
   */
  defaultSelection(groups: OptionGroupWithValues[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const g of groups) {
      const pick = g.values.find((v) => v.is_default) ?? g.values[0];
      if (pick) out[g.id] = pick.id;
    }
    return out;
  },

  /**
   * Price this configuration. One round trip, one derivation, no arithmetic on this side.
   */
  async priceConfiguration(
    workspaceId: string,
    productId: string,
    optionValueIds: string[],
    opts: { companyId?: string | null; contactId?: string | null; audience?: string | null } = {},
  ): Promise<ConfiguredPrice> {
    const { data, error } = await supabase.rpc('get_configured_product_price', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_option_value_ids: optionValueIds,
      p_company_id: opts.companyId ?? undefined,
      p_contact_id: opts.contactId ?? undefined,
      p_audience: opts.audience ?? undefined,
    });
    if (error) throw error;
    return data as unknown as ConfiguredPrice;
  },

  /** Material overrides for the selected values, for the viewer to apply. */
  materialOverrides(
    groups: OptionGroupWithValues[],
    selection: Record<string, string>,
  ): MaterialOverride[] {
    const out: MaterialOverride[] = [];
    for (const g of groups) {
      // A group with no target material is a priced choice with no visual effect (a warranty, an
      // assembly service). It still counts toward the price; it just has nothing to paint.
      if (!g.target_material_name) continue;
      const value = g.values.find((v) => v.id === selection[g.id]);
      if (!value) continue;
      out.push({
        targetMaterialName: g.target_material_name,
        baseColorHex: value.base_color_hex,
        roughness: value.roughness,
        metalness: value.metalness,
      });
    }
    return out;
  },

  /** Save a configuration. Stores the CHOICES only — see the table comment on why not the price. */
  async saveConfiguration(
    workspaceId: string,
    productId: string,
    optionValueIds: string[],
    label?: string,
  ): Promise<ProductConfiguration> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('product_configurations')
      .insert({
        workspace_id: workspaceId,
        product_id: productId,
        selections: optionValueIds,
        label: label?.trim() || null,
        created_by: auth.user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Turn a saved configuration into a quote line (#260 Phase 3).
   *
   * Everything happens in one SQL statement: the price is read from the derivation and FROZEN onto
   * the line in the same breath. Quotes freeze their own numbers — which is exactly why a
   * configuration stores none — and doing the read here then writing it back would open a window
   * between the two, plus an obvious place for someone to "adjust" the figure on the way past.
   *
   * The function also refuses to pair a quote and a configuration from different workspaces. Both
   * being individually visible is not the same as belonging together: a user in two workspaces can
   * legitimately read one of each.
   */
  async addToQuote(quoteId: string, configurationId: string, quantity = 1): Promise<{
    quote_item_id: string;
    unit_price: number | null;
    line_total: number | null;
    pricing_status: string;
    options: Record<string, string>;
  }> {
    const { data, error } = await supabase.rpc('add_configuration_to_quote', {
      p_quote_id: quoteId,
      p_configuration_id: configurationId,
      p_quantity: quantity,
    });
    if (error) throw error;
    return data as never;
  },

  /** Quotes this configuration could be added to — the workspace's open ones. */
  async openQuotes(workspaceId: string): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, name, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['draft', 'pending', 'sent'])
      .order('updated_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    return (data ?? []).map((q) => ({ id: q.id, name: q.name ?? 'Untitled quote' }));
  },

  async listConfigurations(productId: string): Promise<ProductConfiguration[]> {
    const { data, error } = await supabase
      .from('product_configurations')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

/** Selection map → the flat id list the derivation and the save path both take. */
export function selectionToValueIds(selection: Record<string, string>): string[] {
  return Object.values(selection).filter(Boolean);
}
