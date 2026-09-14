/**
 * What an online offer must carry, and what happens when it does not (#450).
 *
 * GPSR (EU) 2023/988 has applied since 13 December 2024 and the EAA since 28 June 2025. Art 2(1)
 * excludes only Chapter III SECTION 1 for CE-marked goods, so art. 19 reaches everything we sell.
 * The derivations live in SQL; what a verdict MEANS lives in `offerSafetyRules`, which is
 * import-free so the guard test can reach it without a database.
 */
import { supabase } from '@/integrations/supabase/client';

import type { OfferDisclosure, BannedPhrase } from '@/modules/finance/offerSafetyRules';

export type {
  OfferDisclosureStatus, ResponsiblePersonSource, OfferDisclosure, BannedPhrase, RecallDraft,
} from '@/modules/finance/offerSafetyRules';
export {
  RECALL_HEADLINE, RECALL_REQUIRED_FIELDS, missingRecallElements, bannedPhrasesIn,
  offerBlocksPublish,
} from '@/modules/finance/offerSafetyRules';

export interface OfferDisclosureRow {
  product_id: string;
  workspace_id: string;
  manufacturer_name: string | null;
  manufacturer_postal_address: string | null;
  manufacturer_email: string | null;
  responsible_person_source: 'us' | 'named' | 'manufacturer_is_eu';
  responsible_person_name: string | null;
  responsible_person_postal_address: string | null;
  responsible_person_email: string | null;
  product_identifier: string | null;
  product_type: string | null;
  safety_contact_email: string | null;
  accessibility_information: string | null;
}

export interface SafetyWarning {
  id: string;
  product_id: string;
  workspace_id: string;
  language_code: string;
  warning_text: string;
  position: number;
}

export interface ProductRecall {
  id: string;
  workspace_id: string;
  product_id: string | null;
  batch_codes: string[];
  language_code: string;
  headline: string;
  product_description: string | null;
  hazard_description: string | null;
  consumer_action: string | null;
  remedies: string | null;
  contact_channel: string | null;
  share_encouragement: string | null;
  status: 'draft' | 'published' | 'closed';
  public_token: string | null;
  published_at: string | null;
  closed_at: string | null;
  gateway_reference: string | null;
  gateway_submitted_at: string | null;
}

export interface RecallAffectedCustomer {
  company_id: string | null;
  contact_id: string | null;
  customer_name: string | null;
  email: string | null;
  orders: number;
  last_order_at: string | null;
  quantity: number | null;
}

export const productComplianceService = {
  /** The art. 19 block for one product, with the responsible person already resolved. */
  async offerDisclosure(productId: string, language = 'el'): Promise<OfferDisclosure> {
    const { data, error } = await supabase.rpc('product_offer_disclosure' as never, {
      p_product: productId,
      p_language: language,
    } as never);
    if (error) throw error;
    return data as unknown as OfferDisclosure;
  },

  async getDisclosureRow(productId: string): Promise<OfferDisclosureRow | null> {
    const { data, error } = await supabase
      .from('product_offer_disclosures')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw error;
    return (data as OfferDisclosureRow) ?? null;
  },

  async saveDisclosure(row: OfferDisclosureRow): Promise<void> {
    const { error } = await supabase
      .from('product_offer_disclosures')
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'product_id' });
    if (error) throw error;
  },

  async listWarnings(productId: string): Promise<SafetyWarning[]> {
    const { data, error } = await supabase
      .from('product_safety_warnings')
      .select('*')
      .eq('product_id', productId)
      .order('language_code')
      .order('position');
    if (error) throw error;
    return (data ?? []) as SafetyWarning[];
  },

  async addWarning(w: Omit<SafetyWarning, 'id'>): Promise<void> {
    const { error } = await supabase.from('product_safety_warnings').insert(w);
    if (error) throw error;
  },

  async removeWarning(id: string): Promise<void> {
    const { error } = await supabase.from('product_safety_warnings').delete().eq('id', id);
    if (error) throw error;
  },

  /** The banned-phrase table. Fetched rather than restated, so a phrase added reaches the editor. */
  async bannedPhrases(): Promise<BannedPhrase[]> {
    const { data, error } = await supabase
      .from('recall_notice_banned_phrases')
      .select('*')
      .order('language_code')
      .order('phrase');
    if (error) throw error;
    return (data ?? []) as BannedPhrase[];
  },

  async listRecalls(workspaceId: string): Promise<ProductRecall[]> {
    const { data, error } = await supabase
      .from('product_recalls')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProductRecall[];
  },

  async saveRecall(r: Partial<ProductRecall> & { workspace_id: string }): Promise<ProductRecall> {
    const { data, error } = await supabase
      .from('product_recalls')
      .upsert(r, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductRecall;
  },

  /**
   * Who bought it.
   *
   * Derived from the order lines — the recall keeps no mailing list of its own, and this sends
   * nothing: it returns the people so an operator can decide.
   */
  async affectedCustomers(recallId: string): Promise<RecallAffectedCustomer[]> {
    const { data, error } = await supabase.rpc('recall_affected_customers' as never, {
      p_recall: recallId,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as RecallAffectedCustomer[];
  },
};
