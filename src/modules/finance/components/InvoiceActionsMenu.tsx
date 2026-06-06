/**
 * #204 — per-document action menu (the timologisi-style 3-dots). Reuses the actions that
 * already have implementations; the detail page hosts the heavier dialogs (payment /
 * credit note) so those entries deep-link there. myDATA submit + Copy MARK act inline.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Eye, CreditCard, FileText, Send, Copy, Hash, Loader2, RefreshCw } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { useCapabilities } from '@/hooks/useCapabilities';

interface Props {
  invoiceId: string;
  financeBase: string;          // '/finance' | '/admin/finance'
  fiscalStatus?: string | null; // when known by the caller (skips a fetch)
  fiscalMark?: string | null;
  status?: string | null;
  onChanged?: () => void;
}

export const InvoiceActionsMenu: React.FC<Props> = ({ invoiceId, financeBase, fiscalStatus, fiscalMark, status, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAccountant } = useCapabilities(); // read-only accountant: no write actions
  const [mark, setMark] = useState<string | null>(fiscalMark ?? null);
  const [fStatus, setFStatus] = useState<string | null>(fiscalStatus ?? null);
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load the fiscal fields the caller didn't pass (e.g. aging rows lack them).
  const hydrate = async () => {
    if (fiscalMark !== undefined && fiscalStatus !== undefined) return;
    const { data } = await supabase.from('invoices').select('fiscal_mark, fiscal_status').eq('id', invoiceId).maybeSingle();
    if (data) { setMark((data as any).fiscal_mark ?? null); setFStatus((data as any).fiscal_status ?? null); }
  };

  const go = (suffix = '') => navigate(`${financeBase}/invoices/${invoiceId}${suffix}`);

  const copyMark = async () => {
    let m = mark;
    if (!m) { const { data } = await supabase.from('invoices').select('fiscal_mark').eq('id', invoiceId).maybeSingle(); m = (data as any)?.fiscal_mark ?? null; }
    if (!m) { toast({ title: 'No MARK yet', description: 'This invoice has not been transmitted to myDATA.', variant: 'destructive' }); return; }
    await navigator.clipboard.writeText(m);
    toast({ title: 'MARK copied' });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${financeBase}/invoices/${invoiceId}`);
    toast({ title: 'Link copied' });
  };

  const submitFiscal = async () => {
    setSubmitting(true);
    try {
      const res = await fiscalConnectorService.submitInvoice(invoiceId);
      const f: any = res?.fiscal;
      if (!f || f.ok === false) { toast({ title: 'Not submitted', description: f?.error, variant: 'destructive' }); }
      else if (f.skipped) { toast({ title: 'Already transmitted' }); }
      else if (f.status === 'accepted') { toast({ title: 'Transmitted to myDATA', description: `MARK ${f.mark}` }); }
      else if (f.status === 'offline') { toast({ title: 'Accepted — AADE offline', description: 'Final MARK assigned shortly.' }); }
      else if (f.status === 'rejected') { toast({ title: 'Rejected by myDATA', description: f.errorMessage ?? f.errorCode, variant: 'destructive' }); }
      else { toast({ title: 'Submitted', description: String(f.status ?? 'done') }); }
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err?.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const accepted = fStatus === 'accepted' || fStatus === 'offline';
  const canSubmit = status !== 'draft' && status !== 'void' && !accepted;

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) void hydrate(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => go()}><Eye className="h-4 w-4 mr-2" /> View</DropdownMenuItem>
        {!isAccountant && <DropdownMenuItem onClick={() => go()}><CreditCard className="h-4 w-4 mr-2" /> Record payment</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => go()}><FileText className="h-4 w-4 mr-2" /> Print / PDF</DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">myDATA</DropdownMenuLabel>
        {canSubmit && !isAccountant && <DropdownMenuItem onClick={submitFiscal}><Send className="h-4 w-4 mr-2" /> Submit to myDATA</DropdownMenuItem>}
        <DropdownMenuItem onClick={copyMark}><Hash className="h-4 w-4 mr-2" /> Copy MARK</DropdownMenuItem>

        <DropdownMenuSeparator />
        {!isAccountant && <DropdownMenuItem onClick={() => go()}><RefreshCw className="h-4 w-4 mr-2" /> Issue credit note</DropdownMenuItem>}
        <DropdownMenuItem onClick={copyLink}><Copy className="h-4 w-4 mr-2" /> Copy link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
