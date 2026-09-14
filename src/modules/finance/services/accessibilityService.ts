/**
 * European Accessibility Act — Directive (EU) 2019/882, Ν. 4994/2022 (#450).
 *
 * The regulated thing is the SELLING SERVICE, not what is sold, so an online tile shop is in scope.
 * There is no presumption of conformity available — no harmonised standard is cited in the OJ under
 * this Directive — so EN 301 549 / WCAG 2.1 AA is the benchmark and never a legal shield.
 */
import { supabase } from '@/integrations/supabase/client';

import type { AccessibilityPosition } from '@/modules/finance/offerSafetyRules';

export type { AccessibilityStatus, AccessibilityPosition } from '@/modules/finance/offerSafetyRules';
export { accessibilityNeedsAttention, burdenClaimIsVoid } from '@/modules/finance/offerSafetyRules';

export interface AccessibilityAssessment {
  id: string;
  workspace_id: string;
  subject: 'storefront' | 'app' | 'other';
  assessed_on: string;
  conclusion: string;
  annex_vi_documentation: string | null;
  disproportionate_burden_claimed: boolean;
  funding_received: boolean;
  funding_source: string | null;
  next_review_due: string;
  superseded_at: string | null;
}

export const accessibilityService = {
  async position(workspaceId: string, subject = 'storefront'): Promise<AccessibilityPosition> {
    const { data, error } = await supabase.rpc('accessibility_position' as never, {
      p_workspace: workspaceId,
      p_subject: subject,
    } as never);
    if (error) throw error;
    return data as unknown as AccessibilityPosition;
  },

  async listAssessments(workspaceId: string): Promise<AccessibilityAssessment[]> {
    const { data, error } = await supabase
      .from('accessibility_assessments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('assessed_on', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AccessibilityAssessment[];
  },

  async recordAssessment(a: Partial<AccessibilityAssessment> & { workspace_id: string; conclusion: string }) {
    const { error } = await supabase.from('accessibility_assessments').insert(a);
    if (error) throw error;
  },

  async getStatement(workspaceId: string, language = 'el') {
    const { data, error } = await supabase
      .from('accessibility_statements')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('language_code', language)
      .maybeSingle();
    if (error) throw error;
    return (data as { workspace_id: string; language_code: string; body: string } | null) ?? null;
  },

  async saveStatement(workspaceId: string, language: string, body: string) {
    const { error } = await supabase.from('accessibility_statements').upsert(
      { workspace_id: workspaceId, language_code: language, body, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,language_code' },
    );
    if (error) throw error;
  },
};
