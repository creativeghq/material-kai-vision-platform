/**
 * RefreshResearchButton — drop-in "Refresh research" control for any surface that shows a CRM
 * company but isn't the company record page (Finance → Parties, and anywhere else that grows one).
 *
 * It owns the whole interaction: load the row, run the shared [[researchCompany]] chain
 * (ΑΑΔΕ → ΓΕΜΗ → business research), write the patch back, and report what happened — including
 * the legs that were SKIPPED. That reporting is the point: `ok` is true when ANY leg works, so a
 * run where Apollo is unconfigured and web search returns one URL used to read as a clean success
 * and leave a company with no phone or industry and no explanation.
 *
 * Deliberately a component, not a copied handler: the company/contact record pages already carry
 * their own runResearch (they additionally patch inline state and log a CRM activity), and a
 * third hand-rolled copy is exactly how the chain drifted before.
 */
import React, { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { companiesAPI } from '@/services/crm.service';
import { researchCompany, summarizeResearch, missingSoftIdentity } from '@/modules/crm/services/companyResearch';

interface Props {
  /**
   * `crm_companies.id` — NEVER a `crm_contacts.id`. The registry edge functions cache their raw
   * payloads onto `crm_companies`, so a contact id writes the registry data onto the wrong row.
   * Callers holding a polymorphic party must gate on `party_type === 'company'`.
   */
  companyId: string;
  workspaceId?: string | null;
  /** Called after a successful patch so the parent can reload. */
  onDone?: () => void;
  size?: 'sm' | 'default';
  className?: string;
}

export const RefreshResearchButton: React.FC<Props> = ({ companyId, workspaceId, onDone, size = 'sm', className }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setSummary(null);
    try {
      // The caller only has an id, so read the row first — the chain needs the ΑΦΜ to reach the
      // registries, and `existing` to know which soft fields are still blank.
      const { data: company } = await companiesAPI.getCompany(companyId);
      if (!company) {
        toast({ title: 'Company not found', variant: 'destructive' });
        return;
      }
      const res = await researchCompany({
        vatNumber: (company as any).vat_number,
        countryCode: (company as any).country_code,
        name: (company as any).name,
        countryName: (company as any).country,
        companyId,
        workspaceId: workspaceId ?? undefined,
        reason: 'crm_enrichment',
        existing: company as Record<string, unknown>,
        onProgress: setStatus,
      });

      if (Object.keys(res.fields).length > 0) {
        await companiesAPI.updateCompany(companyId, res.fields);
        onDone?.();
      }

      const line = summarizeResearch(res.steps);
      const stillMissing = missingSoftIdentity({ ...(company as any), ...res.fields });
      const full = stillMissing.length ? `${line} Still missing: ${stillMissing.join(', ')}.` : line;
      setSummary(full);
      toast({
        title: res.ok ? 'Company refreshed' : 'Nothing new found',
        description: full,
        variant: res.ok ? undefined : (res.steps.some((s) => s.status === 'failed') ? 'destructive' : undefined),
      });
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size={size}
          onClick={run}
          disabled={busy}
          title="Refresh from ΑΑΔΕ + ΓΕΜΗ registries and re-run business research (website, phone, socials)"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          {busy ? 'Researching…' : 'Refresh research'}
        </Button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>
      {summary && !busy && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{summary}</p>
      )}
    </div>
  );
};
