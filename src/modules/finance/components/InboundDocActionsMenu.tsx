/**
 * per-row 3-dots action menu for the Expenses (myDATA inbound) inbox. Folds the
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
import { MoreVertical, Building2, PackagePlus, Trash2, Loader2, ExternalLink, Sparkles, Eye, Wallet, ShoppingCart, Receipt } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter , DialogDescription } from '@/components/core/ui/dialog';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { companiesAPI } from '@/services/crm.service';
import { researchCompany, greekAfm, summarizeResearch, missingSoftIdentity } from '@/modules/crm/services/companyResearch';
import type { InboundDocument } from '@/modules/finance/services/inboundService';
import { InboundDocPreviewDialog } from '@/modules/finance/components/InboundDocPreviewDialog';

interface Props {
  doc: InboundDocument;
  workspaceId: string;
  busy?: boolean;
  /** Set when the issuer's ΑΦΜ already matches a CRM company — the row resolved it, so the
   *  "add" action is offered as already-done rather than letting a duplicate be started. */
  crmCompanyId?: string;
  /**
   * Open the Record Payment form preset to this document. Opening must never WRITE — in
   * particular it must not convert the document into an expense; that happens when the form
   * saves. (For the read-only "what has been paid" view, see `onOpenPayments`.)
   */
  onRecordPayment: () => void;
  /** Open the order form seeded from this document's lines — where "what is this for?" decides
   *  between raising the purchase and booking it onto one that already exists (freight, customs,
   *  an installer). Absent → the entry isn't offered. */
  onCreateOrder?: () => void;
  /** This document already produced an order — offered as done rather than repeated. */
  hasOrder?: boolean;
  /**
   * Open the payments/balance ledger for the expense this document became. Read-only: it shows
   * what has settled and what is still owed, and never converts the document.
   *
   * The other half of "Record payment". The Gross column is a BRONZE myDATA fact that never
   * moves, so a fully-settled document still shows its whole amount there — what is actually
   * outstanding lives on the bill's derived `amount_due`, and this is the only way to reach it
   * from the inbox. Absent → the entry isn't offered.
   */
  onOpenPayments?: () => void;
  onReceiveStock: () => void;
  onDismiss: () => void;
  onChanged?: () => void;
}

/** A bare 9-digit number is a Greek ΑΦΜ — only those are resolvable via the ΑΑΔΕ / ΓΕΜΗ registries. */
const isGreekVat = (vat: string | null | undefined) => !!greekAfm(vat);

export const InboundDocActionsMenu: React.FC<Props> = ({ doc, workspaceId, busy, crmCompanyId, onRecordPayment, onCreateOrder, hasOrder, onOpenPayments, onReceiveStock, onDismiss, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ONE goods receipt per purchase. Receiving the document and receiving the purchase order it
  // became are the same arrival counted from two rows — nothing links them, so doing both added
  // the stock twice. Once the order exists it owns the receipt (it knows the catalog products,
  // the per-line delivered quantities and the customer allocations waiting on them).
  const canReceive = (doc.status === 'new' || doc.status === 'classified') && !hasOrder;
  const canDismiss = doc.status === 'new';
  // Paying settles an expense that EXISTS. A document that hasn't been booked yet is settled by
  // booking it — "Add to Expenses" carries a "Mark as paid" tick — so there is one way in and it
  // always leaves an order behind the money. This item used to convert the document itself on
  // save, which produced a paid bill with no order to match it against: the exact shape the
  // Money section was reorganised to prevent.
  const canPay = doc.status !== 'dismissed' && !!doc.created_supplier_bill_id;
  const hasIssuer = !!(doc.issuer_vat || doc.issuer_name);
  /** Already a CRM company — adding again would only make a duplicate to merge later. */
  const inCrm = !!crmCompanyId;

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
      toast({
        title: 'Supplier added to CRM',
        description: researchNote ?? undefined,
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
          {inCrm ? (
            // State, not an action. This menu is "things you can do to this document"; opening a
            // CRM record is neither, and navigating away mid-triage loses the operator's place.
            // The issuer name in the row is already the link into CRM.
            <DropdownMenuItem disabled>
              <Building2 className="h-4 w-4 mr-2" /> Issuer in CRM
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={openCrm} disabled={!hasIssuer}>
              <Building2 className="h-4 w-4 mr-2" /> Add issuer to CRM
            </DropdownMenuItem>
          )}
          {/* Same act as the order menu's entry — one name for it, the goods-receipt term. Once an
              order exists it owns the receipt, so this is disabled rather than explained. */}
          <DropdownMenuItem onClick={onReceiveStock} disabled={!canReceive}>
            <PackagePlus className="h-4 w-4 mr-2" /> Receive into warehouse
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Money</DropdownMenuLabel>
          {/* ONE way in. You cannot buy from a supplier and hold only an expense — the purchase
              happened, so the order is the record of it and the expense hangs off that. This used
              to be two items ("Add to Expenses — not paid" wrote a bare bill; "Create the order
              for this" wrote order + bill), and the bill-only one produced a payable with nothing
              to match it against, which is precisely what 3-way match exists to prevent. */}
          <DropdownMenuItem onClick={onCreateOrder} disabled={hasOrder || doc.status === 'dismissed' || !onCreateOrder}>
            <ShoppingCart className="h-4 w-4 mr-2" /> {hasOrder ? 'Already in Expenses' : 'Add to Expenses'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRecordPayment} disabled={!canPay}>
            <Wallet className="h-4 w-4 mr-2" /> Record payment
          </DropdownMenuItem>
          {/* Viewing is read-only, so it stays available even for a dismissed document — the
              money that moved is still a fact worth reading back. */}
          <DropdownMenuItem onClick={onOpenPayments} disabled={!onOpenPayments || !doc.created_supplier_bill_id}>
            <Receipt className="h-4 w-4 mr-2" /> View payments
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
                <Checkbox className="mt-0.5 h-3.5 w-3.5 rounded" checked={enrich} onCheckedChange={(v) => setEnrich(v === true)} />
                <span>
                  <span className="flex items-center gap-1 font-medium">
                    <Sparkles className="h-3 w-3" />
                    {isGreekVat(doc.issuer_vat) ? 'Research: ΑΑΔΕ + ΓΕΜΗ + Business Info' : 'Research business info'}
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
