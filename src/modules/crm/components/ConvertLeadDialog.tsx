import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { crmLeadsService, type Lead } from '@/services/crmLeadsService';

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export const ConvertLeadDialog: React.FC<Props> = ({ lead, onClose }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [createDeal, setCreateDeal] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (lead) setCreateDeal(true); }, [lead]);

  const convert = async () => {
    if (!lead || busy) return;
    setBusy(true);
    try {
      const r = await crmLeadsService.convert(lead.id, createDeal);
      onClose();
      toast({
        title: r.already_converted ? 'Already converted' : r.reused_contact ? 'Linked to existing contact' : 'Converted to contact',
        description: r.deal_id ? 'A deal was opened in the pipeline.' : undefined,
      });
      navigate(`/crm/contacts/${r.contact_id}`);
    } catch (e) {
      toast({ title: 'Could not convert lead', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to contact</DialogTitle>
          <DialogDescription>
            {lead?.name} becomes a CRM contact, with this lead&apos;s request and notes kept on the contact and its
            quotes moved to it. A contact with the same email is reused rather than duplicated.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={createDeal} onCheckedChange={(v) => setCreateDeal(v === true)} />
          Also open a deal in the pipeline
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void convert()} disabled={busy}>{busy ? 'Converting…' : 'Convert'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
