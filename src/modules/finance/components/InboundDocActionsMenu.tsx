/**
 * #206/#207 — per-row 3-dots action menu for the Expenses (myDATA inbound) inbox. Folds the
 * loose row buttons (Create bill / Receive stock / Dismiss) into one menu and adds two
 * "turn this received document into platform data" actions:
 *   • Add issuer → CRM supplier (with optional registry + business research when the issuer is
 *     Greek and myDATA returned only a VAT number / no name), deduped by VAT within the workspace.
 *   • Add products → warehouse (reuses the existing ReceiveToWarehouseDialog via callback).
 * Mirrors the InvoiceActionsMenu pattern so it drops into the InboundTable row.
 *
 * The research chain (ΑΑΔΕ → ΓΕΜΗ → web/Apollo enrichment) is the shared
 * [[researchCompany]] routine, so an issuer added here lands with the exact same data an
 * operator would get from Add Company or the refresh button on the company record. It used
 * to run ΑΑΔΕ only, which is why inbox-created issuers had no Γ.Ε.ΜΗ. number or website.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Building2, PackagePlus, FileText, Trash2, Loader2, ExternalLink, Sparkles, Eye } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter , DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { companiesAPI } from '@/services/crm.service';
import { researchCompany, greekAfm, summarizeResearch } from '@/modules/crm/services/companyResearch';
import type { InboundDocument } from '@/modules/finance/services/inboundService';
import { InboundDocPreviewDialog } from '@/modules/finance/components/InboundDocPreviewDialog';

interface Props {
  doc: InboundDocument;
  workspaceId: string;
  busy?: boolean;
  onCreateBill: () => void;
  onReceiveStock: () => void;
  onDismiss: () => void;
  onChanged?: () => void;
}

/** A bare 9-digit number is a Greek ΑΦΜ — only those are resolvable via the ΑΑΔΕ / ΓΕΜΗ registries. */
const isGreekVat = (vat: string | null | undefined) => !!greekAfm(vat);

export const InboundDocActionsMenu: React.FC<Props> = ({ doc, workspaceId, busy, onCreateBill, onReceiveStock, onDismiss, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const canBill = doc.status === 'new';
  const canReceive = doc.status === 'new' || doc.status === 'classified';
  const canDismiss = doc.status === 'new';
  const hasIssuer = !!(doc.issuer_vat || doc.issuer_name);

  // Read-only view of the document exactly as AADE holds it.
  const [previewOpen, setPreviewOpen] = useState(false);

  // ---- Add issuer → CRM supplier dialog ----
  const [crmOpen, setCrmOpen] = useState(false);
  const [name, setName] = useState(doc.issuer_name ?? '');
  // Research is on by default whenever there is something to research — a Greek ΑΦΜ (registries)
  // or at least a name (web research).
  const [enrich, setEnrich] = useState(isGreekVat(doc.issuer_vat) || !!doc.issuer_name?.trim());
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<{ id: string; name: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  // Sub-phase label while the research chain runs ("Checking ΓΕΜΗ registry…").
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const openCrm = async () => {
    setName(doc.issuer_name ?? '');
    setEnrich(isGreekVat(doc.issuer_vat) || !!doc.issuer_name?.trim());
    setExisting(null);
    setCrmOpen(true);
    // Dedupe: is a supplier with this VAT already in the workspace? RLS scopes the read.
    // Match on BOTH the raw string and the digits-only form — a CRM row saved as "EL800370260"
    // must still dedupe against a myDATA issuer_vat of "800370260" (an exact-string match let
    // duplicates straight through).
    const vat = doc.issuer_vat?.trim();
    if (vat) {
      setChecking(true);
      try {
        const forms = Array.from(new Set([vat, vat.replace(/\D/g, ''), `EL${vat.replace(/\D/g, '')}`].filter(Boolean)));
        const { data } = await supabase
          .from('crm_companies')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('vat_number', forms)
          .limit(1)
          .maybeSingle();
        if (data) setExisting({ id: (data as any).id, name: (data as any).name ?? null });
      } catch { /* non-blocking — worst case we create a dup the user can merge */ }
      finally { setChecking(false); }
    }
  };

  const saveCrm = async () => {
    const vat = doc.issuer_vat?.trim() || undefined;
    const typedName = name.trim();
    // Research needs *something* to work from: a Greek ΑΦΜ (registries) or a name (web research).
    const doResearch = enrich && !!(isGreekVat(vat) || typedName);
    if (!typedName && !isGreekVat(vat)) {
      toast({ title: 'Name required', description: 'Enter a supplier name — this issuer has no Greek ΑΦΜ to look up.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let payload: Record<string, unknown> = {
        name: typedName || vat,
        vat_number: vat,
        is_supplier: true,
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
        if (!res.ok) {
          // Research came back empty — still create the bare supplier rather than losing the action.
          toast({ title: 'Research found nothing — added without enrichment', description: summarizeResearch(res.steps) });
        }
      }
      if (!payload.name) { toast({ title: 'Name required', variant: 'destructive' }); setSaving(false); return; }
      const { data } = await companiesAPI.createCompany(payload);
      toast({
        title: 'Supplier added to CRM',
        description: doResearch ? 'Enriched from ΑΑΔΕ / ΓΕΜΗ + business research.' : undefined,
      });
      setCrmOpen(false);
      onChanged?.();
      if (data?.id) navigate(`/crm/companies/${data.id}`);
    } catch (err: any) {
      toast({ title: 'Failed to add supplier', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); setStatusLine(null); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(e) => e.stopPropagation()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-2" /> Preview
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Add to platform</DropdownMenuLabel>
          <DropdownMenuItem onClick={openCrm} disabled={!hasIssuer}>
            <Building2 className="h-4 w-4 mr-2" /> Add issuer to CRM
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReceiveStock} disabled={!canReceive}>
            <PackagePlus className="h-4 w-4 mr-2" /> Add products to warehouse
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Document</DropdownMenuLabel>
          <DropdownMenuItem onClick={onCreateBill} disabled={!canBill}>
            <FileText className="h-4 w-4 mr-2" /> Create supplier bill
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDismiss} disabled={!canDismiss}>
            <Trash2 className="h-4 w-4 mr-2" /> Dismiss
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InboundDocPreviewDialog doc={doc} open={previewOpen} onOpenChange={setPreviewOpen} />

      {/* Add issuer → CRM supplier */}
      <Dialog open={crmOpen} onOpenChange={setCrmOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Add Issuer as CRM Supplier</DialogTitle><DialogDescription className="sr-only">Process this received (myDATA) document.</DialogDescription></DialogHeader>
          {existing ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>Already in CRM: <span className="font-medium">{existing.name ?? '—'}</span></span>
                <Button size="sm" variant="outline" onClick={() => { setCrmOpen(false); navigate(`/crm/companies/${existing.id}`); }}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isGreekVat(doc.issuer_vat) ? 'Leave blank to fetch from ΑΑΔΕ' : 'Supplier name'} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">VAT number</Label>
                <Input value={doc.issuer_vat ?? ''} disabled className="font-mono text-xs" />
              </div>
              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 rounded" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1 font-medium">
                    <Sparkles className="h-3 w-3" />
                    {isGreekVat(doc.issuer_vat) ? 'Research: ΑΑΔΕ + ΓΕΜΗ + business info' : 'Research business info'}
                  </span>
                  <span className="text-muted-foreground">
                    {isGreekVat(doc.issuer_vat)
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
              <Button variant="outline" onClick={() => setCrmOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={saveCrm} disabled={saving || checking}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : 'Add supplier'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
