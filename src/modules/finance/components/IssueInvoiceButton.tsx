// Issue-invoice button for the quote admin page. Renders when the quote is in
// 'accepted' status. Calls the finance-issue-invoice edge function (which
// creates the invoice row + items via the issue_invoice_from_quote RPC) and
// then navigates to the invoice detail page.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Receipt, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { financeService } from '@/modules/finance/services/financeService';

interface Props {
  quoteId: string;
  quoteStatus: string;
}

export const IssueInvoiceButton: React.FC<Props> = ({ quoteId, quoteStatus }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void check();
  }, [quoteId]);

  const check = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('quote_id', quoteId)
      .not('status', 'eq', 'void')
      .limit(1)
      .maybeSingle();
    setExistingInvoiceId(data?.id ?? null);
  };

  if (quoteStatus !== 'accepted' && !existingInvoiceId) return null;

  if (existingInvoiceId) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate(`/admin/finance/invoices/${existingInvoiceId}`)}
      >
        <Receipt className="h-4 w-4 mr-1" /> Open invoice <ExternalLink className="ml-1 h-3 w-3" />
      </Button>
    );
  }

  const handleIssue = async () => {
    try {
      setBusy(true);
      const result = await financeService.issueInvoiceFromQuote(quoteId, { issueNow: true });
      toast({ title: 'Invoice issued', description: result.invoice?.internal_number });
      navigate(`/admin/finance/invoices/${result.invoice_id}`);
    } catch (err: any) {
      toast({ title: 'Issue failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" onClick={handleIssue} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Receipt className="h-4 w-4 mr-1" />}
      Issue invoice
    </Button>
  );
};
