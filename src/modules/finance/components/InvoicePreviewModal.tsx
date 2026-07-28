import React, { useEffect, useState } from 'react';
import { Loader2, Download, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import {
  buildInvoiceRenderData,
  getTemplateSpec,
  resolveColors,
  DEFAULT_TEMPLATE_ID,
  type InvoiceColors,
  type InvoiceRenderData,
  type InvoiceTemplateSpec,
} from '../invoice-templates';
import { financeService } from '../services/financeService';
import { InvoiceDocument } from './InvoiceDocument';

interface Resolved {
  spec: InvoiceTemplateSpec;
  colors: InvoiceColors;
  data: InvoiceRenderData;
}

/**
 * Full-screen invoice preview. Loads the invoice + items + finance settings + customer
 * exactly like the PDF function does, then renders the themed HTML document so the
 * on-screen preview matches the generated PDF. Offers Download (calls the PDF function).
 */
export function InvoicePreviewModal({
  invoiceId,
  workspaceId,
  open,
  onOpenChange,
}: {
  invoiceId: string | null;
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setResolved(null);
      try {
        const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
        if (error || !invoice) throw error ?? new Error('Invoice not found');
        const [{ data: items }, { data: settings }] = await Promise.all([
          supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('added_at'),
          supabase.from('finance_settings').select('*').eq('workspace_id', workspaceId).maybeSingle(),
        ]);

        let customer: Record<string, any> | null = null;
        if (invoice.customer_company_id) {
          const { data } = await supabase.from('crm_companies').select('*').eq('id', invoice.customer_company_id).maybeSingle();
          customer = data;
        } else if (invoice.customer_contact_id) {
          const { data } = await supabase.from('crm_contacts').select('*').eq('id', invoice.customer_contact_id).maybeSingle();
          customer = data;
        }

        let branch: Record<string, any> | null = null;
        if (Number(invoice.branch_code ?? 0) > 0) {
          const { data } = await supabase.from('finance_branches').select('*')
            .eq('workspace_id', workspaceId).eq('branch_code', invoice.branch_code).maybeSingle();
          branch = data;
        }

        let order: Record<string, any> | null = null;
        if (invoice.order_id) {
          const { data } = await supabase.from('orders').select('order_number, notes').eq('id', invoice.order_id).maybeSingle();
          order = data;
        }

        let logoUrl: string | null = null;
        if (settings?.business_logo_path) {
          const { data: signed } = await supabase.storage.from('generation-images')
            .createSignedUrl(settings.business_logo_path, 60 * 60);
          logoUrl = signed?.signedUrl ?? null;
        }

        // Template + colors: per-invoice snapshot wins, else workspace settings, else default.
        const templateId = invoice.template_id || settings?.invoice_template_id || DEFAULT_TEMPLATE_ID;
        const spec = getTemplateSpec(templateId);
        const colors = resolveColors(templateId, invoice.template_colors ?? settings?.invoice_template_colors);
        const bankAccounts = await financeService.listInvoiceBankAccounts(workspaceId);

        // Pay/view-online link — reuse an existing, unexpired token (the PDF step is what
        // mints; the preview just reflects what's already there).
        let payUrl: string | null = null;
        if ((settings as any)?.invoice_show_pay_link !== false && invoice.pay_token
            && Number(invoice.amount_due ?? 0) > 0.005 && invoice.status !== 'void' && invoice.status !== 'credit_noted') {
          const exp = invoice.pay_token_expires_at ? new Date(invoice.pay_token_expires_at) : null;
          if (!exp || exp.getTime() > Date.now()) payUrl = `${window.location.origin}/pay/${invoice.pay_token}`;
        }

        // Carry-forward balance (same RPC + gate the PDF uses).
        let priorBalance: number | null = null;
        if ((settings as any)?.invoice_show_previous_balance !== false && (invoice.customer_company_id || invoice.customer_contact_id)) {
          try {
            const { data: pb } = await (supabase.rpc as any)('get_customer_prior_balance', {
              p_workspace_id: workspaceId,
              p_company_id: invoice.customer_company_id ?? null,
              p_contact_id: invoice.customer_company_id ? null : (invoice.customer_contact_id ?? null),
              p_exclude_invoice_id: invoice.id,
              p_as_of: invoice.issued_at ?? null,
            });
            const v = (pb as any)?.prior_balance;
            if (typeof v === 'number' && Math.abs(v) >= 0.01) priorBalance = v;
          } catch { /* informational only */ }
        }

        const data = buildInvoiceRenderData({ invoice, items: items ?? [], settings, customer, branch, order, logoUrl, bankAccounts, payUrl, priorBalance });

        if (!cancelled) setResolved({ spec, colors, data });
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Could not load invoice preview', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoiceId, workspaceId, toast]);

  const handleDownload = async () => {
    if (!invoiceId) return;
    setDownloading(true);
    try {
      const { pdf_url } = await financeService.generateInvoicePdf(invoiceId, true);
      if (pdf_url) window.open(pdf_url, '_blank', 'noopener');
      else throw new Error('No PDF URL returned');
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="no-card-hover w-[100vw] h-[100vh] max-w-none p-0 gap-0 rounded-none border-0 flex flex-col bg-muted/40"
      >
        {/* Radix requires a title + description on every dialog for screen readers; the toolbar
            shows a visible label, so these are visually hidden but announced. */}
        <DialogTitle className="sr-only">Invoice Preview</DialogTitle>
        <DialogDescription className="sr-only">Full-page preview of the invoice document with a download action.</DialogDescription>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 h-14 shrink-0 border-b border-border/40 bg-background">
          <span className="text-sm font-medium">Invoice preview</span>
          <div className="flex items-center gap-2">
            <Button size="sm" className="rounded-full gap-2" onClick={handleDownload} disabled={downloading || !resolved}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full gap-1.5" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>

        {/* Scrollable paper area */}
        <div className="flex-1 overflow-auto py-8 px-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : resolved ? (
            <InvoiceDocument spec={resolved.spec} colors={resolved.colors} data={resolved.data} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No preview available.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default InvoicePreviewModal;
