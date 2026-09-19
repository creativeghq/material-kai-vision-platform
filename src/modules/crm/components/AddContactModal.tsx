import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Factory, User, Users } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import {
  NEW_CONTACT_KINDS, type NewContactKind, type NewContactKindId,
} from '@/modules/crm/contactType';

const KIND_ICONS: Record<NewContactKindId, React.ComponentType<{ className?: string }>> = {
  customer_private: User,
  customer_business: Briefcase,
  supplier: Factory,
  other: Users,
};

export const AddContactModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offered because a whole business belongs in `crm_companies`, not in a contact row. */
  onAddCompanyInstead?: () => void;
}> = ({ open, onOpenChange, onAddCompanyInstead }) => {
  const navigate = useNavigate();

  const pick = (kind: NewContactKind) => {
    onOpenChange(false);
    navigate('/crm/contacts/new', { state: { prefill: kind.prefill } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What Are You Adding?</DialogTitle>
          <DialogDescription>
            Pick the type first — it sets which side of the trade this person is on and whether
            they are invoiced as a business or given a retail receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {NEW_CONTACT_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind.id];
            return (
              <button
                key={kind.id}
                type="button"
                onClick={() => pick(kind)}
                className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
              >
                <Icon className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                <div className="font-medium">{kind.label}</div>
                <p className="text-xs text-muted-foreground mt-1">{kind.hint}</p>
              </button>
            );
          })}
        </div>
        {onAddCompanyInstead && (
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="ghost" size="sm" onClick={onAddCompanyInstead}>
              <Building2 className="h-4 w-4 mr-1" /> Adding a whole business? Add a company instead
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddContactModal;
