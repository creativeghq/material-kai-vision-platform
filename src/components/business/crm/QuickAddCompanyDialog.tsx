// Create a business from anywhere OUTSIDE the CRM pages — an expense payee, a bill issuer, a
// counterparty on a form — with the same identity lookup the CRM "Add company" flow uses.
//
// The difference from `AddCompanyModal` is only what happens at the end: that one hands the
// resolved identity to the full create form for review, because you went to CRM to add a
// company. Here you were doing something else (booking an expense) and just need the
// counterparty to exist, so it writes the row and hands it straight back. The identity captured
// is identical either way — that is the whole point of sharing `CompanyIdentityLookup`.
import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Building2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { companiesAPI } from '@/services/crm.service';
import {
  CompanyIdentityLookup,
  companyIdentityPayload,
  emptyCompanyIdentity,
  vatDedupeForms,
  type CompanyIdentityDraft,
} from '@/components/business/crm/CompanyIdentityLookup';

export interface QuickCreatedCompany { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Seeds the name field — e.g. whatever the operator had typed into the payee search. */
  initialName?: string;
  /** What this business is to us. Both flags are ALWAYS sent: the crm-api POST treats a request
   *  that names neither as "it's a customer", so a supplier would silently become one too. */
  role?: 'supplier' | 'customer' | 'both';
  onCreated: (company: QuickCreatedCompany) => void;
  title?: string;
  description?: string;
}

export const QuickAddCompanyDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  workspaceId,
  initialName,
  role = 'supplier',
  onCreated,
  title = 'New business',
  description = 'Look the VAT / ΑΦΜ up to pull the official name, address and registry details — or just type a name.',
}) => {
  const { toast } = useToast();
  const emailFieldId = useId();
  const [draft, setDraft] = useState<CompanyIdentityDraft>(() => emptyCompanyIdentity());
  // Optional, and the one thing no registry reliably supplies. It matters at the point of
  // creation because the surfaces that create a business here go on to email it — an invoice to
  // a client, a PO to a supplier — and a party with no address on file blocks that silently.
  const [email, setEmail] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // A business already in this workspace matching the VAT (or the exact name). Offered instead of
  // a create — the duplicate is what makes spend-per-supplier and AP aging wrong later.
  const [duplicate, setDuplicate] = useState<QuickCreatedCompany | null>(null);

  // Seed on the OPEN TRANSITION only. `initialName` is a live search-box value in both callers,
  // so keying the reset on its identity meant any change to it mid-dialog — including the
  // caller clearing the box as it adopts the result — threw away a completed registry lookup.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(emptyCompanyIdentity({ name: initialName?.trim() ?? '' }));
      setEmail('');
      setDuplicate(null);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, initialName]);

  // Dedupe probe. VAT first (authoritative, and matched across every spelling a row might be
  // stored under), name second. Debounced because it runs as you type.
  useEffect(() => {
    if (!open) return;
    const vat = draft.vatNumber.trim();
    const name = draft.name.trim();
    if (!vat && name.length < 2) { setDuplicate(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const forms = vatDedupeForms(vat);
        let q = supabase.from('crm_companies').select('id, name').eq('workspace_id', workspaceId).limit(1);
        q = forms.length ? q.in('vat_number', forms) : q.ilike('name', name);
        const { data } = await q.maybeSingle();
        if (!cancelled) setDuplicate(data ? { id: (data as any).id, name: (data as any).name ?? name } : null);
      } catch {
        // Non-blocking — worst case a duplicate gets created and can be merged.
        if (!cancelled) setDuplicate(null);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, draft.vatNumber, draft.name, workspaceId]);

  // Adopting the existing row still has to apply the role. A company only ever flagged as a
  // customer that now pays us bills IS a supplier — leave the flag off and it stays invisible to
  // every supplier-scoped picker and report.
  // Named `adopt`, not `use`: a plain async handler that starts with `use` reads as a hook to
  // both eslint (rules-of-hooks fails on it inside the onClick below) and to the next reader.
  const adoptExisting = async () => {
    if (!duplicate) return;
    const flags: Record<string, boolean> = {};
    if (role === 'supplier' || role === 'both') flags.is_supplier = true;
    if (role === 'customer' || role === 'both') flags.is_customer = true;
    try {
      if (Object.keys(flags).length) await companiesAPI.updateCompany(duplicate.id, flags);
    } catch {
      // Non-blocking — the operator picked an existing business; the flag can be set on its record.
    }
    onCreated(duplicate);
    onOpenChange(false);
  };

  const handleCreate = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: 'Company name required', description: 'Enter a name (or run a VAT lookup to fetch it).', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = companyIdentityPayload(draft, {
        is_supplier: role === 'supplier' || role === 'both',
        is_customer: role === 'customer' || role === 'both',
      });
      // A typed email beats one the web research guessed — same rule as the name.
      if (email.trim()) payload.email = email.trim();
      const { data } = await companiesAPI.createCompany({ ...payload, workspace_id: workspaceId });
      if (!data?.id) throw new Error('The company was not returned by the server.');
      toast({
        title: `${data.name ?? name} added`,
        description: draft.verified ? 'Identity verified against the registry.' : undefined,
      });
      onCreated({ id: data.id as string, name: (data.name as string) ?? name });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Could not create the business', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <CompanyIdentityLookup
          value={draft}
          onChange={setDraft}
          onBusyChange={setLookupBusy}
          onSubmit={() => { if (!duplicate) void handleCreate(); }}
          disabled={saving}
          autoFocusName={!initialName}
          namePlaceholder="e.g. Acme Tiles S.A."
        >
          {duplicate && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-xs">
              <span>
                <span className="font-medium text-foreground">{duplicate.name}</span>
                <span className="text-muted-foreground"> is already in CRM.</span>
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => void adoptExisting()}>Use it</Button>
            </div>
          )}
        </CompanyIdentityLookup>

        <div className="space-y-1.5">
          <Label htmlFor={emailFieldId} className="text-xs">Email (optional)</Label>
          <Input
            id={emailFieldId}
            type="email"
            value={email}
            disabled={saving}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={draft.fields.email ? String(draft.fields.email) : 'billing@example.com'}
          />
          {draft.fields.email && !email.trim() && (
            <p className="text-[11px] text-muted-foreground">
              Found by research — leave blank to keep it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={saving || lookupBusy || !draft.name.trim()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddCompanyDialog;
