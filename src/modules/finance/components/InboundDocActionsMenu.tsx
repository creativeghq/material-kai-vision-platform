/**
 * #206/#207 — per-row 3-dots action menu for the Expenses (myDATA inbound) inbox. Folds the
 * loose row buttons (Create bill / Receive stock / Dismiss) into one menu and adds two
 * "turn this received document into platform data" actions:
 *   • Add issuer → CRM supplier (with optional ΑΑΔΕ enrichment when the issuer is Greek and
 *     myDATA returned only a VAT number / no name), deduped by VAT within the workspace.
 *   • Add products → warehouse (reuses the existing ReceiveToWarehouseDialog via callback).
 * Mirrors the InvoiceActionsMenu pattern so it drops into the InboundTable row.
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
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
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

/** A bare 9-digit number is a Greek ΑΦΜ — only those are resolvable via the ΑΑΔΕ registry. */
const isGreekVat = (vat: string | null | undefined) => !!vat && /^\d{9}$/.test(vat.trim());

/** Map an ΑΑΔΕ lookup onto crm_companies columns (mirrors CompanyDetailPage.adoptAadeAll) so
 *  a brand-new supplier persists every registry field in a single insert. */
function aadeToCompanyFields(res: AadeLookupResult): Record<string, unknown> {
  const r = res.basic_rec;
  const primary = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
  const secondary = res.activities.filter((a) => a.kind !== 1);
  const combinedAddress = r.postal_address
    ? `${r.postal_address} ${r.postal_address_no ?? ''}`.replace(/\s+/g, ' ').trim()
    : null;
  const out: Record<string, unknown> = {
    street: r.postal_address ?? undefined,
    street_number: r.postal_address_no ?? undefined,
    address: combinedAddress ?? undefined,
    postal_code: r.postal_zip_code ?? undefined,
    city: r.postal_area_description ?? undefined,
    country: r.postal_area_description ? 'Greece' : undefined,
    country_code: 'EL',
    tax_office: r.doy_descr ?? undefined,
    profession: primary?.description ?? undefined,
    commercial_title: r.commer_title ?? undefined,
    legal_status: r.legal_status_descr ?? undefined,
    kad_primary: primary?.code ?? undefined,
    kad_primary_description: primary?.description ?? undefined,
    kad_secondary: secondary.length > 0 ? secondary : undefined,
    business_start_date: r.regist_date ? (r.regist_date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? undefined) : undefined,
    aade_data: { basic_rec: r, activities: res.activities },
    aade_data_at: res.checked_at,
    vat_validated: true,
    vat_validated_at: res.checked_at,
    vat_validated_name: r.onomasia ?? undefined,
    vat_validated_address: combinedAddress ?? undefined,
    vat_validation_source: 'aade',
  };
  // Drop undefined so we never overwrite a typed value with a blank.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

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
  const [enrich, setEnrich] = useState(isGreekVat(doc.issuer_vat));
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<{ id: string; name: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const openCrm = async () => {
    setName(doc.issuer_name ?? '');
    setEnrich(isGreekVat(doc.issuer_vat));
    setExisting(null);
    setCrmOpen(true);
    // Dedupe: is a supplier with this VAT already in the workspace? RLS scopes the read.
    const vat = doc.issuer_vat?.trim();
    if (vat) {
      setChecking(true);
      try {
        const { data } = await supabase
          .from('crm_companies')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .eq('vat_number', vat)
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
    const doEnrich = enrich && isGreekVat(vat);
    if (!typedName && !doEnrich) {
      toast({ title: 'Name required', description: 'Enter a supplier name, or enable ΑΑΔΕ enrichment to fetch it.', variant: 'destructive' });
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
      if (doEnrich) {
        const res = await aadeService.lookup({ afm: vat!, reason: 'invoice_counterparty', workspaceId });
        if ('ok' in res && res.ok) {
          payload = { ...payload, ...aadeToCompanyFields(res), name: typedName || res.basic_rec.onomasia || vat };
        } else {
          // Enrichment failed — still create the bare supplier rather than losing the action.
          toast({ title: 'ΑΑΔΕ lookup failed — added without enrichment', description: (res as any).message ?? (res as any).error, variant: 'destructive' });
        }
      }
      if (!payload.name) { toast({ title: 'Name required', variant: 'destructive' }); setSaving(false); return; }
      const { data } = await companiesAPI.createCompany(payload);
      toast({ title: 'Supplier added to CRM', description: doEnrich ? 'Enriched from the ΑΑΔΕ registry.' : undefined });
      setCrmOpen(false);
      onChanged?.();
      if (data?.id) navigate(`/crm/companies/${data.id}`);
    } catch (err: any) {
      toast({ title: 'Failed to add supplier', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
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
          <DialogHeader><DialogTitle>Add issuer as CRM supplier</DialogTitle><DialogDescription className="sr-only">Process this received (myDATA) document.</DialogDescription></DialogHeader>
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
              {isGreekVat(doc.issuer_vat) && (
                <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 rounded" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
                  <span>
                    <span className="flex items-center gap-1 font-medium"><Sparkles className="h-3 w-3" /> Enrich from ΑΑΔΕ registry</span>
                    <span className="text-muted-foreground">Fills name, address, tax office &amp; ΚΑΔ from the issuer's ΑΦΜ. Writes an audit entry to their TAXISnet inbox (ΑΑΔΕ policy).</span>
                  </span>
                </label>
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
