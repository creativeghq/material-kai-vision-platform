import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Canonical platform lead scorer. ONE score (crm_contacts.lead_score / health_score)
// used by CRM, Sales, and Real Estate. Generic CRM signals + property enrichment when real-estate
// is enabled — all resolved server-side in the crm-lead-score edge function.
export interface LeadScore { lead_score: number; health_score: number; rationale?: string; credits: number }

export async function scoreLead(workspaceId: string, crmContactId: string): Promise<LeadScore> {
  const { data, error } = await supabase.functions.invoke('crm-lead-score', {
    body: { workspace_id: workspaceId, crm_contact_id: crmContactId },
  });
  if (error) throw await edgeError(error);
  return data as LeadScore;
}

/** Tailwind tint for a 0-100 lead score badge (shared across surfaces). */
export function leadScoreTint(score: number | null | undefined): string {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-500';
  if (score >= 40) return 'bg-amber-500/15 text-amber-500';
  return 'bg-muted text-muted-foreground';
}
