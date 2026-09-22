import { authenticate } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import {
  buildExpenseEnvelope, expenseEnvelopeProblems, parseSendResponse,
  type ExpenseEnvelopeInput, type ExpenseLine,
} from '../_shared/fiscal/mydata-expense-envelope.ts';

const DEFAULT_BASE = 'https://mydatapi.aade.gr/myDATA';

interface Creds { aade_user_id: string; subscription_key: string; base_url: string | null }

async function credentialsFor(service: any, workspaceId: string): Promise<Creds> {
  const { data } = await service
    .from('workspace_inbound_credentials')
    .select('aade_user_id, subscription_key, base_url, enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data?.enabled || !data.aade_user_id || !data.subscription_key) {
    throw new HttpError(400, 'ΑΑΔΕ credentials are not configured for this workspace.');
  }
  return data as Creds;
}

function post(creds: Creds, path: string, body: string): Promise<Response> {
  return fetch(`${creds.base_url || DEFAULT_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'aade-user-id': creds.aade_user_id,
      'Ocp-Apim-Subscription-Key': creds.subscription_key,
      'Content-Type': 'application/xml',
    },
    body,
  });
}

function linesFor(doc: any): ExpenseLine[] {
  const classifications: any[] = Array.isArray(doc.expenses_classification) ? doc.expenses_classification : [];
  const byLine = new Map<number, any>();
  for (const c of classifications) byLine.set(Number(c.line_number ?? 1), c);

  const docLines: any[] = Array.isArray(doc.lines) && doc.lines.length ? doc.lines : [];
  if (!docLines.length) {
    const c = byLine.get(1) ?? classifications[0] ?? {};
    return [{
      lineNumber: 1,
      netValue: Number(doc.total_net ?? 0),
      vatCategory: Number(doc.vat_category ?? (Number(doc.total_vat ?? 0) > 0 ? 1 : 7)),
      vatAmount: Number(doc.total_vat ?? 0),
      vatExemptionCategory: doc.vat_exemption_category ? Number(doc.vat_exemption_category) : undefined,
      classificationType: c.classification_type ?? undefined,
      classificationCategory: String(c.classification_category ?? ''),
      itemDescr: doc.issuer_name ?? undefined,
    }];
  }
  return docLines.map((l: any, i: number) => {
    const c = byLine.get(Number(l.line_number ?? i + 1)) ?? {};
    return {
      lineNumber: Number(l.line_number ?? i + 1),
      netValue: Number(l.net_value ?? l.net ?? 0),
      vatCategory: Number(l.vat_category ?? (Number(l.vat_amount ?? 0) > 0 ? 1 : 7)),
      vatAmount: Number(l.vat_amount ?? 0),
      vatExemptionCategory: l.vat_exemption_category ? Number(l.vat_exemption_category) : undefined,
      classificationType: c.classification_type ?? undefined,
      classificationCategory: String(c.classification_category ?? ''),
      itemDescr: l.item_description ?? undefined,
    };
  });
}

Deno.serve(withApiLogging('finance-mydata-send', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
  const service = auth.supabase;

  const body = await req.json().catch(() => null) as Record<string, any> | null;
  const action = String(body?.action ?? '');
  const workspaceId = String(body?.workspace_id ?? '');
  if (!action || !workspaceId) throw new HttpError(400, 'action and workspace_id are required');

  const { data: isMgr } = await auth.supabaseAsUser!
    .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
  if (!isMgr) throw new HttpError(404, 'not found');
  if (!(await isWorkspaceEntitled(service, workspaceId, 'sales-finance'))) {
    throw new HttpError(402, 'The Finance module is not enabled for this workspace');
  }

  switch (action) {
    case 'check-rights': {
      const creds = await credentialsFor(service, workspaceId);
      const res = await post(creds, 'SendInvoices', '<not-a-document/>');
      const text = await res.text().catch(() => '');
      return jsonResponse({
        ok: true,
        canSend: res.status !== 401 && res.status !== 403,
        status: res.status,
        detail: res.status === 401 || res.status === 403
          ? 'ΑΑΔΕ refused the credentials for SendInvoices. The subscription reads your book but may not file.'
          : 'ΑΑΔΕ accepted the call and rejected the document, which is what a malformed probe should do.',
        raw: text.slice(0, 500),
      });
    }

    case 'send': {
      const docId = String(body?.document_id ?? '');
      if (!docId) throw new HttpError(400, 'document_id is required');

      const { data: blockers, error: blockErr } = await auth.supabaseAsUser!
        .rpc('expense_document_send_blockers', { p_doc_id: docId });
      if (blockErr) throw new HttpError(500, blockErr.message);
      if ((blockers ?? []).length) {
        throw new HttpError(400, (blockers as any[]).map((b) => b.blocker ?? b).join(' '));
      }

      const { data: doc } = await service
        .from('inbound_documents').select('*')
        .eq('id', docId).eq('workspace_id', workspaceId).maybeSingle();
      if (!doc) throw new HttpError(404, 'not found');

      const { data: fs } = await service
        .from('finance_settings').select('business_vat, business_name')
        .eq('workspace_id', workspaceId).maybeSingle();
      const ourVat = String(fs?.business_vat ?? '').replace(/\D/g, '');
      if (!ourVat) throw new HttpError(400, 'Your own ΑΦΜ is not set.');

      const isEntity = String(doc.doc_type ?? '').split('.')[0] === '17';
      const input: ExpenseEnvelopeInput = {
        invoiceType: String(doc.doc_type),
        series: String(doc.series),
        aa: String(doc.aa),
        issueDate: String(doc.issue_date),
        currency: doc.currency ?? 'EUR',
        issuer: isEntity
          ? { vatNumber: ourVat, country: 'GR', branch: 0, name: fs?.business_name ?? undefined }
          : {
            vatNumber: String(doc.issuer_vat ?? '').trim(),
            country: String(doc.issuer_country ?? 'GR').toUpperCase(),
            branch: 0,
            name: doc.issuer_name ?? undefined,
          },
        counterpart: isEntity ? undefined : { vatNumber: ourVat, country: 'GR', branch: 0 },
        lines: linesFor(doc),
      };

      const problems = expenseEnvelopeProblems(input);
      if (problems.length) throw new HttpError(400, problems.join(' '));

      const creds = await credentialsFor(service, workspaceId);
      const res = await post(creds, 'SendInvoices', buildExpenseEnvelope(input));
      const outcome = parseSendResponse(res.status, await res.text().catch(() => ''));

      await service.from('inbound_documents').update({
        transmit_attempted_at: new Date().toISOString(),
        transmit_error: outcome.ok ? null : outcome.errors.join(' · '),
        ...(outcome.ok
          ? {
            mydata_mark: outcome.mark,
            source_ref: {
              ...(doc.source_ref ?? {}),
              mark: outcome.mark,
              uid: outcome.uid ?? doc.uid ?? null,
              authentication_code: outcome.authenticationCode ?? doc.authentication_code ?? null,
            },
          }
          : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', docId).eq('workspace_id', workspaceId);

      if (!outcome.ok) {
        return jsonResponse({ ok: false, errors: outcome.errors, status: outcome.status }, 200);
      }
      return jsonResponse({ ok: true, mark: outcome.mark, uid: outcome.uid });
    }

    default:
      throw new HttpError(400, `unknown action ${action}`);
  }
}));
