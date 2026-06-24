// deno-lint-ignore-file no-explicit-any
// Customer self-service document list. A buyer who has an app account (their auth
// user_id is linked to one or more crm_contacts) can see THEIR OWN issued invoices /
// retail receipts and payment receipts, with fresh signed PDF download links.
//
// Why an edge function (not direct table reads): the invoices RLS is
// `is_workspace_member(workspace_id)` — a customer is NOT a workspace member, so they
// can't read the table directly. This runs under service role but scopes STRICTLY to
// documents whose counterparty is one of the caller's own linked CRM contacts.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const isReceiptDoc = (dt: string | null) => String(dt ?? '').startsWith('11');

Deno.serve(withApiLogging('finance-customer-documents', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  // Any authenticated user — this is a customer-facing surface, not admin-gated.
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. The caller's own CRM contacts (the only documents they may see).
  const { data: contacts } = await supabase
    .from('crm_contacts')
    .select('id')
    .eq('user_id', auth.userId);
  const contactIds = (contacts ?? []).map((c: any) => c.id);
  if (contactIds.length === 0) {
    return json({ ok: true, invoices: [], receipts: [], linked: false });
  }

  // 1b. The businesses those contacts belong to (crm_company_contacts). Same link that
  // drives the billing rollup — so a person attached to a business also SEES that
  // business's documents (they're its representative), not only their personal ones.
  const { data: links } = await supabase
    .from('crm_company_contacts')
    .select('company_id')
    .in('contact_id', contactIds);
  const companyIds = [...new Set((links ?? []).map((l: any) => l.company_id).filter(Boolean))];

  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data } = await supabase.storage.from('pdf-documents').createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? null;
  };

  const dedupeById = (rows: any[]): any[] => {
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  };

  // 2. Issued documents (invoices + retail receipts) addressed to the caller's contact
  //    OR their linked business. Two explicit IN-queries merged + de-duped — avoids the
  //    PostgREST or()/in() ambiguity entirely, so each filter is trivially correct.
  const fetchInvoices = (col: 'customer_contact_id' | 'customer_company_id', ids: string[]) =>
    supabase
      .from('invoices')
      .select('id, internal_number, legal_number, document_type, status, total, currency, issued_at, due_at, amount_due, pdf_storage_path')
      .in(col, ids)
      .neq('status', 'draft')
      .neq('status', 'void')
      .order('issued_at', { ascending: false, nullsFirst: false })
      .limit(200);
  const invResults = await Promise.all([
    fetchInvoices('customer_contact_id', contactIds),
    companyIds.length ? fetchInvoices('customer_company_id', companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const invRows = dedupeById(invResults.flatMap((r: any) => r.data ?? []));

  const invoices = await Promise.all((invRows ?? []).map(async (r: any) => ({
    id: r.id,
    kind: isReceiptDoc(r.document_type) ? 'receipt' : 'invoice',
    number: r.legal_number ?? r.internal_number ?? '',
    document_type: r.document_type,
    status: r.status,
    total: Number(r.total ?? 0),
    amount_due: Number(r.amount_due ?? 0),
    currency: r.currency ?? 'EUR',
    issued_at: r.issued_at,
    due_at: r.due_at,
    pdf_url: await sign(r.pdf_storage_path),
  })));

  // 3. Payment receipts (απόδειξη είσπραξης) for money the caller (or their business) paid.
  const fetchPayments = (col: 'counterparty_contact_id' | 'counterparty_company_id', ids: string[]) =>
    supabase
      .from('payments')
      .select('id, receipt_number, amount, currency, method, paid_at, pdf_storage_path')
      .in(col, ids)
      .eq('direction', 'in')
      .order('paid_at', { ascending: false })
      .limit(200);
  const payResults = await Promise.all([
    fetchPayments('counterparty_contact_id', contactIds),
    companyIds.length ? fetchPayments('counterparty_company_id', companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const payRows = dedupeById(payResults.flatMap((r: any) => r.data ?? []));

  const receipts = await Promise.all((payRows ?? []).map(async (r: any) => ({
    id: r.id,
    number: r.receipt_number ?? `PR-${String(r.id).slice(0, 8).toUpperCase()}`,
    amount: Number(r.amount ?? 0),
    currency: r.currency ?? 'EUR',
    method: r.method,
    paid_at: r.paid_at,
    pdf_url: await sign(r.pdf_storage_path),
  })));

  return json({ ok: true, linked: true, invoices, receipts });
}));
