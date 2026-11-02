import { supabase } from '@/integrations/supabase/client';
import {
  buildInvoiceRenderData, getTemplateSpec, resolveColors, DEFAULT_TEMPLATE_ID,
  type InvoiceColors, type InvoiceRenderData, type InvoiceTemplateSpec, type RenderDocumentKind,
} from '@/modules/finance/invoice-templates';

export interface PublicDocumentPayload {
  ok: true;
  kind: RenderDocumentKind;
  document: Record<string, any>;
  counterparty_snapshot: { row: Record<string, any> } | null;
  items: Record<string, any>[];
  document_taxes: Array<{ tax_type: number; tax_category?: number | null; tax_amount: number; reduces_payable: boolean; label?: string | null }>;
  settings: Record<string, any> | null;
  customer: Record<string, any> | null;
  self_bill_supplier: Record<string, any> | null;
  address_unit: Record<string, any> | null;
  branch: Record<string, any> | null;
  order: { order_number: string | null; notes: string | null } | null;
  bank_accounts: Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>;
  auth_code: string | null;
  provider_attribution: string | null;
  pos_payments: NonNullable<Parameters<typeof buildInvoiceRenderData>[0]['posPayments']>;
  timezone: string | null;
  logo_url: string | null;
  related: { label: string; number: string | null } | null;
  pdf_available: boolean;
  show_pay_link: boolean;
}

export interface RenderedPublicDocument {
  spec: InvoiceTemplateSpec;
  colors: InvoiceColors;
  data: InvoiceRenderData;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-document', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error((parsed as { error?: string } | null)?.error ?? 'This document could not be loaded.');
  }
  return data as T;
}

export const publicDocumentService = {
  fetch(token: string): Promise<PublicDocumentPayload> {
    return invoke<PublicDocumentPayload>({ token });
  },

  async pdfUrl(token: string): Promise<string> {
    const out = await invoke<{ pdf_url?: string; error?: string }>({ token, pdf: true });
    if (!out?.pdf_url) throw new Error(out?.error ?? 'The PDF could not be produced right now.');
    return out.pdf_url;
  },

  render(p: PublicDocumentPayload, payUrl: string | null = null): RenderedPublicDocument {
    const invoice: Record<string, any> = { ...p.document, counterparty_snapshot: p.counterparty_snapshot };
    const templateId = invoice.template_id || p.settings?.invoice_template_id || DEFAULT_TEMPLATE_ID;
    return {
      spec: getTemplateSpec(templateId),
      colors: resolveColors(templateId, invoice.template_colors ?? p.settings?.invoice_template_colors),
      data: buildInvoiceRenderData({
        documentKind: p.kind,
        invoice,
        items: p.items,
        settings: p.settings,
        customer: p.customer,
        selfBillSupplier: p.self_bill_supplier,
        addressUnit: p.address_unit,
        authCode: p.auth_code,
        providerAttribution: p.provider_attribution,
        posPayments: p.pos_payments,
        branch: p.branch,
        order: p.order,
        logoUrl: p.logo_url,
        bankAccounts: p.bank_accounts,
        timezone: p.timezone,
        documentTaxes: p.document_taxes.length ? p.document_taxes : null,
        payUrl,
      }),
    };
  },
};
