/**
 * Add a myDATA issuer to the platform as a CRM supplier.
 *
 * Extracted out of `InboundDocActionsMenu` so the document row and the Expenses-by-Supplier list
 * offer the SAME act rather than two spellings of it. Two things make this a dialog and not a
 * button that writes:
 *
 *  1. It DEDUPES first, on the normalised VAT key (#353 CRM-4) — not on the raw string, because a
 *     row stored as `GR 800 370 260` matches none of the spellings a caller would think to try,
 *     and the workspace ends up with the same business twice.
 *  2. It RESEARCHES: ΑΑΔΕ → ΓΕΜΗ → web/Apollo via the shared [[researchCompany]] chain, so an
 *     issuer added here lands with the same identity an operator would get from Add Company. That
 *     costs an ΑΑΔΕ call that writes an audit entry into the issuer's own TAXISnet inbox, which is
 *     the operator's decision to make — hence the checkbox, and hence no silent create anywhere.
 *
 * Never navigates on success: the caller says what happens next, because one caller is mid-triage
 * in a 241-row filing queue and the other is looking at a single document.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/core/ui/dialog';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
// One normalised VAT key (#353 CRM-4).
import { normalizeVat, CRM_VAT_COLUMN } from '@/components/business/crm/companyIdentity';
import { companiesAPI } from '@/services/crm.service';
import { researchCompany, greekAfm, summarizeResearch, missingSoftIdentity } from '@/modules/crm/services/companyResearch';

/** A bare 9-digit number is a Greek ΑΦΜ — only those are resolvable via the ΑΑΔΕ / ΓΕΜΗ registries. */
export const isGreekVat = (vat: string | null | undefined) => !!greekAfm(vat);

export const AddIssuerToCrmDialog: React.FC<{
  workspaceId: string;
  issuerVat: string | null | undefined;
  /** The name myDATA sent, if any — the operator can correct it before it is written. */
  issuerName: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The company now exists. The caller decides whether to open it or stay put and refresh. */
  onCreated?: (companyId: string | null) => void;
}> = ({ workspaceId, issuerVat, issuerName, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(issuerName ?? '');
  // Research is on by default whenever there is something to research — a Greek ΑΦΜ (registries)
  // or at least a name (web research).
  const [enrich, setEnrich] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<{ id: string; name: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  // Sub-phase label while the research chain runs ("Checking ΓΕΜΗ registry…").
  const [statusLine, setStatusLine] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(issuerName ?? '');
    setEnrich(isGreekVat(issuerVat) || !!issuerName?.trim());
    setExisting(null);
    // Dedupe: is a company with this VAT already in the workspace? RLS scopes the read. Matched
    // on the normalised key, which is the whole reason this is not an exact-string compare.
    const vat = issuerVat?.trim();
    if (!vat) return;
    let cancelled = false;
    setChecking(true);
    void (async () => {
      try {
        const vatKey = normalizeVat(vat);
        const { data } = await supabase
          .from('crm_companies')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .eq(CRM_VAT_COLUMN, vatKey)
          .limit(1)
          .maybeSingle();
        if (!cancelled && data) setExisting({ id: (data as any).id, name: (data as any).name ?? null });
      } catch { /* non-blocking — worst case we create a dup the user can merge */ }
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [open, issuerVat, issuerName, workspaceId]);

  const save = async () => {
    const vat = issuerVat?.trim() || undefined;
    const typedName = name.trim();
    // Research needs *something* to work from: a Greek ΑΦΜ (registries) or a name (web research).
    const doResearch = enrich && !!(isGreekVat(vat) || typedName);
    if (!typedName && !isGreekVat(vat)) {
      toast({ title: 'Name required', description: 'Enter a supplier name — this issuer has no Greek ΑΦΜ to look up.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    let researchNote: string | null = null;
    try {
      let payload: Record<string, unknown> = {
        name: typedName || vat,
        vat_number: vat,
        is_supplier: true,
        // MUST be explicit: crm_companies.is_customer DEFAULTS TO TRUE, so omitting it here
        // filed every issuer as a customer as well — a company we only ever buy from showed up
        // in customer pickers, AR statements and the receivables aging. The document is an
        // expense we RECEIVED; its issuer sells to us and nothing more.
        is_customer: false,
        workspace_id: workspaceId,
      };
      if (doResearch) {
        // Full chain: ΑΑΔΕ → ΓΕΜΗ → web/Apollo. No companyId yet (the row doesn't exist), so
        // everything comes back as fields and lands in the single insert below.
        const res = await researchCompany({
          vatNumber: vat,
          name: typedName || undefined,
          workspaceId,
          reason: 'invoice_counterparty',
          existing: { name: typedName || undefined },
          onProgress: setStatusLine,
        });
        payload = { ...payload, ...res.fields, name: typedName || res.resolvedName || vat };
        // Report the outcome either way. `res.ok` is true if ANY leg worked, so gating the
        // message on failure hid the common case: registries answered, the web pass found only a
        // website, and the supplier arrived with no phone or industry and no explanation.
        researchNote = summarizeResearch(res.steps);
        const stillMissing = missingSoftIdentity(payload);
        if (stillMissing.length) researchNote += ` Still missing: ${stillMissing.join(', ')}.`;
      }
      if (!payload.name) { toast({ title: 'Name required', variant: 'destructive' }); setSaving(false); return; }
      const { data } = await companiesAPI.createCompany(payload);
      toast({ title: 'Supplier added to CRM', description: researchNote ?? undefined });
      onOpenChange(false);
      onCreated?.(data?.id ?? null);
    } catch (err: any) {
      toast({ title: 'Failed to add supplier', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); setStatusLine(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Add Issuer as CRM Supplier</DialogTitle>
          <DialogDescription className="sr-only">Add this myDATA issuer to the workspace as a supplier.</DialogDescription>
        </DialogHeader>
        {checking && !existing ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking whether they are already in CRM…
          </p>
        ) : null}
        {existing ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Already in CRM: <span className="font-medium">{existing.name ?? '—'}</span></span>
              <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate(`/crm/companies/${existing.id}`); }}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isGreekVat(issuerVat) ? 'Leave blank to fetch from ΑΑΔΕ' : 'Supplier name'} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">VAT number</Label>
              <Input value={issuerVat ?? ''} disabled className="font-mono text-xs" />
            </div>
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <Checkbox className="mt-0.5 h-3.5 w-3.5 rounded" checked={enrich} onCheckedChange={(v) => setEnrich(v === true)} />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  <Sparkles className="h-3 w-3" />
                  {isGreekVat(issuerVat) ? 'Research: ΑΑΔΕ + ΓΕΜΗ + Business Info' : 'Research business info'}
                </span>
                <span className="text-muted-foreground">
                  {isGreekVat(issuerVat)
                    ? "Fills name, address, tax office & ΚΑΔ from ΑΑΔΕ, the Γ.Ε.ΜΗ. number from ΓΕΜΗ, and website / phone / socials from the web. The ΑΑΔΕ call writes an audit entry to the issuer's TAXISnet inbox (ΑΑΔΕ policy)."
                    : 'Looks up website, phone, socials and industry from the web. No Greek ΑΦΜ, so the ΑΑΔΕ / ΓΕΜΗ registries are skipped.'}
                </span>
              </span>
            </label>
            {statusLine && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{statusLine}</p>
            )}
          </div>
        )}
        {!existing && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || checking}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : <><Building2 className="h-4 w-4 mr-2" /> Add supplier</>}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
