import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Factory, ArrowRight, ArrowLeft } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  CompanyIdentityLookup,
  companyIdentityPayload,
  emptyCompanyIdentity,
  type CompanyIdentityDraft,
} from '@/components/business/crm/CompanyIdentityLookup';
import { useSessionDraft } from '@/hooks/useSessionDraft';

type Role = 'customer' | 'supplier';

/**
 * Role-first company creation. The operator first picks what they're adding
 * (a customer we sell to, or a supplier we buy from / match to a factory), then
 * optionally researches the VAT number via VIES (EU) or ΑΑΔΕ (Greek ΑΦΜ) — the shared
 * `CompanyIdentityLookup`, the same control every other create-a-business surface uses. The
 * fetched identity prefills the create form so it can be reviewed before saving —
 * the row is NOT written here. On continue we navigate to the new-company form
 * with the role + prefill in router state.
 *
 * Suppliers land in a lean form (no pricing/invoicing schema); customers get the
 * full commercial card set. See CompanyDetailPage role gating.
 */
export const AddCompanyModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'role' | 'details'>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [identity, setIdentity] = useState<CompanyIdentityDraft>(() => emptyCompanyIdentity());
  const [lookupBusy, setLookupBusy] = useState(false);

  // Draft persistence — a half-filled "add company" survives navigating away +
  // reopening; cleared once you continue to the create form.
  const clearDraft = useSessionDraft(
    'crm-add-company',
    open,
    { step, role, identity },
    (d) => {
      setStep(d?.step ?? 'role');
      setRole(d?.role ?? null);
      setIdentity(d?.identity ?? emptyCompanyIdentity());
    },
  );

  const reset = () => {
    setStep('role'); setRole(null); setIdentity(emptyCompanyIdentity()); setLookupBusy(false);
  };

  const close = (next: boolean) => { if (!next) reset(); onOpenChange(next); };

  const pickRole = (r: Role) => { setRole(r); setStep('details'); };

  const handleCreate = () => {
    if (!role) return;
    if (!identity.name.trim()) {
      toast({ title: 'Company name required', description: 'Enter a name (or run a VAT lookup to fetch it).', variant: 'destructive' });
      return;
    }
    const finalPrefill = companyIdentityPayload(identity, {
      is_supplier: role === 'supplier',
      is_customer: role === 'customer',
    });
    onOpenChange(false);
    clearDraft();
    reset();
    navigate('/crm/companies/new', { state: { prefill: finalPrefill } });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        {step === 'role' ? (
          <>
            <DialogHeader>
              <DialogTitle>What Are You Adding?</DialogTitle>
              <DialogDescription>
                Pick the role first — it decides which form you get. Suppliers stay lean
                (no pricing/invoicing) and can be matched to a brand; customers get the full
                commercial profile.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                type="button"
                onClick={() => pickRole('customer')}
                className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
              >
                <Building2 className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                <div className="font-medium">Customer</div>
                <p className="text-xs text-muted-foreground mt-1">A business we sell to — quotes, invoices, pricing & discounts.</p>
              </button>
              <button
                type="button"
                onClick={() => pickRole('supplier')}
                className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
              >
                <Factory className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                <div className="font-medium">Supplier</div>
                <p className="text-xs text-muted-foreground mt-1">A business we buy from — match it to an ingested brand's products.</p>
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {role === 'supplier' ? <Factory className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                New {role}
                <Badge variant="secondary" className="text-[10px]">{role === 'supplier' ? 'Supplier' : 'Customer'}</Badge>
              </DialogTitle>
              <DialogDescription>
                Research the VAT number to auto-fill the identity, then review it on the next screen.
              </DialogDescription>
            </DialogHeader>

            <div className="py-1">
              <CompanyIdentityLookup
                value={identity}
                onChange={setIdentity}
                onBusyChange={setLookupBusy}
                onSubmit={handleCreate}
                namePlaceholder={role === 'supplier' ? 'e.g. Acme Tiles S.A.' : 'e.g. Acme LLC'}
              />
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep('role')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="button" onClick={handleCreate} disabled={lookupBusy}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCompanyModal;
