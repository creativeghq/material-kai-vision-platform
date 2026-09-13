/**
 * Put a quote or a pay link onto the channel the business actually sells on. Until this, the only
 * routes were email and the clipboard.
 *
 * It does NOT send: it opens the counterparty's WhatsApp conversation with the text ready. Sending
 * from a finance screen would post to a customer with no sight of the thread or Meta's 24-hour
 * window, both of which the Inbox already handles.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { messagingService } from '../services/messagingService';

interface Props {
  /** Who to reach. The contact is preferred — a company's switchboard is rarely on WhatsApp. */
  contactId?: string | null;
  companyId?: string | null;
  /** What to put in the composer. Usually a sentence plus a link. */
  message: string;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'secondary' | 'outline' | 'ghost';
}

/** The first number we hold for this party, or null. Mobile first: this is WhatsApp. */
async function resolvePhone(contactId?: string | null, companyId?: string | null): Promise<{ phone: string; name: string | null } | null> {
  if (contactId) {
    const { data } = await supabase.from('crm_contacts')
      .select('name, phone, mobile').eq('id', contactId).maybeSingle();
    const c = data as { name?: string; phone?: string; mobile?: string } | null;
    const phone = c?.mobile || c?.phone;
    if (phone) return { phone, name: c?.name ?? null };
  }
  if (companyId) {
    const { data } = await supabase.from('crm_companies')
      .select('name, phone').eq('id', companyId).maybeSingle();
    const c = data as { name?: string; phone?: string } | null;
    if (c?.phone) return { phone: c.phone, name: c?.name ?? null };
  }
  return null;
}

export const SendOnWhatsAppButton: React.FC<Props> = ({
  contactId, companyId, message, label = 'Send on WhatsApp', size = 'sm', variant = 'secondary',
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [party, setParty] = useState<{ phone: string; name: string | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await resolvePhone(contactId, companyId).catch(() => null);
      if (!cancelled) setParty(p);
    })();
    return () => { cancelled = true; };
  }, [contactId, companyId]);

  // No number on file is not a failure to report — it is simply not an option for this customer,
  // and a disabled button with a tooltip nobody reads is worse than no button.
  if (party === undefined || party === null) return null;

  const go = async () => {
    try {
      setBusy(true);
      const r = await messagingService.openWhatsAppThread({
        phone: party.phone, name: party.name || undefined,
      });
      navigate(`/inbox?thread=${r.thread_id}&say=${encodeURIComponent(message)}`);
    } catch (e) {
      toast({ title: 'Could not open WhatsApp', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} size={size} className="gap-1.5" disabled={busy} onClick={go}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {label}
    </Button>
  );
};

export default SendOnWhatsAppButton;
