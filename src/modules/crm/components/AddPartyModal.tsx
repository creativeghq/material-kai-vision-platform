import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Briefcase, Factory, User, Users,
} from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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
import { narrowToContactFields } from '@/modules/crm/services/companyResearch';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import {
  NEW_PARTY_KINDS, PARTY_GROUP_LABEL, type NewPartyKind, type NewPartyKindId,
} from '@/modules/crm/contactType';

const KIND_ICONS: Record<NewPartyKindId, React.ComponentType<{ className?: string }>> = {
  customer_private: User,
  customer_business: Briefcase,
  supplier: Factory,
  other: Users,
};

const GROUPS: Array<NewPartyKind['group']> = ['person', 'business'];

/**
 * The ONE "what are you adding?" question for CRM. A business kind runs the shared registry
 * lookup (VAT/ΑΦΜ → ΑΑΔΕ → ΓΕΜΗ) before opening its form; a person kind opens the contact form
 * directly. Neither row is written here. It replaced two modals asking the same question, where
 * only the company one reached the lookup.
 */
export const AddPartyModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'kind' | 'identity'>('kind');
  const [kindId, setKindId] = useState<NewPartyKindId | null>(null);
  const [identity, setIdentity] = useState<CompanyIdentityDraft>(() => emptyCompanyIdentity());
  const [lookupBusy, setLookupBusy] = useState(false);

  const kind = NEW_PARTY_KINDS.find((k) => k.id === kindId) ?? null;

  const clearDraft = useSessionDraft(
    'crm-add-party',
    open,
    { step, kindId, identity },
    (d) => {
      setStep(d?.step ?? 'kind');
      setKindId(d?.kindId ?? null);
      setIdentity(d?.identity ?? emptyCompanyIdentity());
    },
  );

  const reset = () => {
    setStep('kind'); setKindId(null); setIdentity(emptyCompanyIdentity()); setLookupBusy(false);
  };

  const close = (next: boolean) => { if (!next) reset(); onOpenChange(next); };

  const leave = (to: string, prefill: Record<string, unknown>) => {
    onOpenChange(false);
    clearDraft();
    reset();
    navigate(to, { state: { prefill } });
  };

  const pick = (k: NewPartyKind) => {
    if (k.entity === 'contact') { leave('/crm/contacts/new', { ...k.contactPrefill }); return; }
    setKindId(k.id);
    setStep('identity');
  };

  const requireName = () => {
    if (identity.name.trim()) return true;
    toast({
      title: 'Business name required',
      description: 'Enter a name (or run a VAT lookup to fetch it).',
      variant: 'destructive',
    });
    return false;
  };

  const createCompany = () => {
    if (!kind || !requireName()) return;
    leave('/crm/companies/new', companyIdentityPayload(identity, kind.companyRoles ?? {}));
  };

  /** Same ΑΦΜ, other row — the registry name is their TRADING name, never the person's own. */
  const createSoleTrader = () => {
    if (!kind || !requireName()) return;
    const vat = identity.vatNumber.trim();
    leave('/crm/contacts/new', {
      ...kind.contactPrefill,
      ...narrowToContactFields(identity.fields),
      company: identity.name.trim(),
      vat_number: vat || null,
      country_code: identity.countryCode.trim().toUpperCase() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        {step === 'kind' || !kind ? (
          <>
            <DialogHeader>
              <DialogTitle>What Are You Adding?</DialogTitle>
              <DialogDescription>
                Pick the type first — it sets which side of the trade this party is on, whether
                they are invoiced against a VAT number or given a retail receipt, and which form
                you get.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {GROUPS.map((group) => (
                <div key={group} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {PARTY_GROUP_LABEL[group]}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {NEW_PARTY_KINDS.filter((k) => k.group === group).map((k) => {
                      const Icon = KIND_ICONS[k.id];
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => pick(k)}
                          className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
                        >
                          <Icon className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                          <div className="font-medium">{k.label}</div>
                          <p className="text-xs text-muted-foreground mt-1">{k.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(KIND_ICONS[kind.id], { className: 'h-4 w-4' })}
                New {kind.companyRoles?.is_supplier ? 'supplier' : 'customer'}
                <Badge variant="secondary" className="text-[10px]">{kind.label}</Badge>
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
                onSubmit={createCompany}
                namePlaceholder={kind.companyRoles?.is_supplier ? 'e.g. Acme Tiles S.A.' : 'e.g. Acme LLC'}
              >
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  disabled={lookupBusy}
                  onClick={createSoleTrader}
                >
                  This is a sole trader — add as a person instead
                </Button>
              </CompanyIdentityLookup>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep('kind')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="button" onClick={createCompany} disabled={lookupBusy}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddPartyModal;
