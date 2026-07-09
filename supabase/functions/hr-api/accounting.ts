// deno-lint-ignore-file no-explicit-any
// #252 — accounting documents. The accounting team uploads the monthly statutory docs (EFKA/tax
// payment slips, APD, …) that carry the real Payment ID / payment number for a payroll period.
// Claude OCR identifies the doc + extracts the fields (credit-metered); a "prepare" step reconciles
// the extracted payments against the payroll run and stamps the payment IDs onto its Finance lines.
import { corsHeaders } from '../_shared/cors.ts';
import { HttpError } from '../_shared/api-logger.ts';

export interface AcctCtx { supabase: any; workspaceId: string; userId: string; body: any; access: { canView: boolean; canManage: boolean }; }

const HR_DOC_BUCKET = 'pdf-documents';
const ANALYZE_CREDITS = 3;   // Claude OCR identify + extract, per document
const PREPARE_CREDITS = 3;   // AI reconciliation of a period against payroll

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function creditBalance(supabase: any, userId: string): Promise<number> {
  const { data } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
  return Number(data?.balance ?? 0);
}
async function debitCredits(supabase: any, userId: string, amount: number, opType: string, description: string, metadata: any): Promise<void> {
  const { data, error } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId, p_amount: amount, p_operation_type: opType, p_description: description, p_metadata: metadata,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || (row && row.success === false)) throw new HttpError(402, row?.error_message || error?.message || 'Credit deduction failed');
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  return btoa(bin);
}

async function anthropicToolCall(contentBlocks: any[], tool: any, maxTokens = 1200): Promise<any> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new HttpError(400, 'AI is not configured (ANTHROPIC_API_KEY missing)');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: Deno.env.get('HR_JOB_AI_MODEL') || 'claude-sonnet-4-6', max_tokens: maxTokens,
      tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });
  if (!res.ok) throw new HttpError(502, `AI request failed (${res.status})`);
  const data = await res.json();
  const block = (data.content || []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) throw new HttpError(502, 'AI returned no structured result');
  return block.input;
}

/** Returns a Response, or null if `action` isn't ours. Caller already bound to workspace + entitled. */
export async function handleAccounting(action: string, ctx: AcctCtx): Promise<Response | null> {
  const { supabase, workspaceId, userId, body, access } = ctx;
  const requireManage = () => { if (!access.canManage) throw new HttpError(403, 'You need HR manage permission for this action.'); };

  switch (action) {
    case 'list-accounting-docs': {
      let q = supabase.from('hr_accounting_documents')
        .select('id, period, payroll_run_id, name, mime, size_bytes, status, doc_kind, extracted, ai_confidence, ai_notes, credits_spent, analyzed_at, created_at')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (body?.period) q = q.eq('period', String(body.period));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ documents: data ?? [] });
    }

    case 'upload-accounting-doc': {
      requireManage();
      const period = String(body?.period ?? '').trim();
      const name = String(body?.name ?? '').trim();
      const b64 = String(body?.content_base64 ?? '');
      if (!/^\d{4}-\d{2}$/.test(period)) return json({ error: 'period must be YYYY-MM' }, 400);
      if (!name || !b64) return json({ error: 'name and content_base64 are required' }, 400);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return json({ error: 'invalid file data' }, 400); }
      if (bytes.length > 20_000_000) return json({ error: 'file too large (max 20MB)' }, 400);
      const mime = String(body?.content_type ?? 'application/pdf');
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `hr/${workspaceId}/accounting/${period}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(HR_DOC_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      if (upErr) throw new HttpError(400, upErr.message);
      const { data, error } = await supabase.from('hr_accounting_documents').insert({
        workspace_id: workspaceId, period, payroll_run_id: body?.payroll_run_id ?? null, name,
        storage_bucket: HR_DOC_BUCKET, storage_object_path: path, mime, size_bytes: bytes.length, uploaded_by: userId,
      }).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ document: data }, 201);
    }

    case 'sign-accounting-doc': {
      const id = String(body?.document_id ?? '');
      const { data: d } = await supabase.from('hr_accounting_documents').select('storage_bucket, storage_object_path').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!d) return json({ error: 'not found' }, 404);
      const { data: signed, error } = await supabase.storage.from(d.storage_bucket).createSignedUrl(d.storage_object_path, 300);
      if (error) throw new HttpError(400, error.message);
      return json({ url: signed?.signedUrl });
    }

    case 'delete-accounting-doc': {
      requireManage();
      const id = String(body?.document_id ?? '');
      const { data: d } = await supabase.from('hr_accounting_documents').select('storage_bucket, storage_object_path').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!d) return json({ error: 'not found' }, 404);
      await supabase.storage.from(d.storage_bucket).remove([d.storage_object_path]);
      const { error } = await supabase.from('hr_accounting_documents').delete().eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    // AI OCR — identify the document + extract the payment fields. Charges credits.
    case 'analyze-accounting-doc': {
      requireManage();
      const id = String(body?.document_id ?? '');
      const { data: doc } = await supabase.from('hr_accounting_documents').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
      if (!doc) return json({ error: 'not found' }, 404);
      if (await creditBalance(supabase, userId) < ANALYZE_CREDITS) return json({ error: `Not enough credits (need ${ANALYZE_CREDITS}).`, code: 'insufficient_credits' }, 402);

      const { data: blob } = await supabase.storage.from(doc.storage_bucket).download(doc.storage_object_path);
      if (!blob) return json({ error: 'could not read the document' }, 400);
      const b64 = base64FromBytes(new Uint8Array(await (blob as Blob).arrayBuffer()));
      const isImage = String(doc.mime ?? '').startsWith('image/');
      const source = isImage
        ? { type: 'image', source: { type: 'base64', media_type: doc.mime, data: b64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
      const tool = {
        name: 'extract_accounting_document',
        description: 'Identify a payroll-related accounting/payment document and extract its key fields.',
        input_schema: {
          type: 'object',
          properties: {
            doc_kind: { type: 'string', enum: ['efka_payment', 'tax_payment', 'apd', 'payslip', 'other'], description: 'Best classification of the document.' },
            payment_id: { type: 'string', description: 'The payment identity / reference code (e.g. Ταυτότητα Πληρωμής / RF code). Empty string if none.' },
            payment_number: { type: 'string', description: 'Any secondary reference/number (declaration no., statement no.). Empty string if none.' },
            amount: { type: 'number', description: 'The total payable amount. 0 if not present.' },
            currency: { type: 'string', description: 'ISO currency (e.g. EUR).' },
            payee: { type: 'string', description: 'Who is being paid (e.g. EFKA, AADE / tax authority).' },
            due_date: { type: 'string', description: 'Payment due date (YYYY-MM-DD) or empty.' },
            issued_at: { type: 'string', description: 'Document/issue date (YYYY-MM-DD) or empty.' },
            line_items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, amount: { type: 'number' } } }, description: 'Any itemised amounts.' },
            confidence: { type: 'number', description: '0..1 overall extraction confidence.' },
            notes: { type: 'string', description: 'Anything notable, ambiguous, or that needs a human check.' },
          },
          required: ['doc_kind', 'payment_id', 'amount', 'confidence'],
        },
      };
      let out: any;
      try {
        out = await anthropicToolCall([source, { type: 'text', text: `This is a monthly accounting/payment document for a company's payroll (period ${doc.period}). Read it and extract the fields. Do not invent values — leave a field empty/0 if it isn't present.` }], tool);
      } catch (e) {
        await supabase.from('hr_accounting_documents').update({ status: 'error', ai_notes: (e as Error).message }).eq('id', id);
        throw e; // not charged — AI failed
      }
      await debitCredits(supabase, userId, ANALYZE_CREDITS, 'hr_accounting_analyze', `HR accounting OCR (${doc.name})`, { workspace_id: workspaceId, document_id: id, period: doc.period });
      const extracted = {
        payment_id: String(out.payment_id ?? '').trim() || null,
        payment_number: String(out.payment_number ?? '').trim() || null,
        amount: Number(out.amount ?? 0), currency: String(out.currency ?? 'EUR'),
        payee: String(out.payee ?? '').trim() || null,
        due_date: String(out.due_date ?? '').trim() || null, issued_at: String(out.issued_at ?? '').trim() || null,
        line_items: Array.isArray(out.line_items) ? out.line_items : [],
      };
      const { data: upd, error } = await supabase.from('hr_accounting_documents').update({
        status: 'analyzed', doc_kind: out.doc_kind ?? 'other', extracted,
        ai_confidence: Number(out.confidence ?? 0), ai_notes: String(out.notes ?? '') || null,
        credits_spent: Number(doc.credits_spent ?? 0) + ANALYZE_CREDITS, analyzed_at: new Date().toISOString(),
      }).eq('id', id).eq('workspace_id', workspaceId).select('*').single();
      if (error) throw new HttpError(400, error.message);
      return json({ document: upd, credits_used: ANALYZE_CREDITS });
    }

    // AI reconciliation — match the analyzed docs to the payroll run's statutory obligations, flag
    // discrepancies, and stamp the payment IDs onto the period's Finance lines. Charges credits.
    case 'prepare-accounting-period': {
      requireManage();
      const period = String(body?.period ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return json({ error: 'period must be YYYY-MM' }, 400);
      const { data: docs } = await supabase.from('hr_accounting_documents')
        .select('id, name, doc_kind, extracted').eq('workspace_id', workspaceId).eq('period', period).eq('status', 'analyzed');
      if (!docs || docs.length === 0) return json({ error: 'Analyze at least one document for this period first.' }, 400);
      const { data: run } = await supabase.from('hr_payroll_runs').select('id, period, currency').eq('workspace_id', workspaceId).eq('period', period).maybeSingle();
      let payroll: any = null;
      if (run) {
        const { data: items } = await supabase.from('hr_payroll_items').select('net, income_tax, employee_contributions, employer_contributions').eq('run_id', run.id);
        const sum = (k: string) => Math.round((items ?? []).reduce((s: number, i: any) => s + Number(i[k] ?? 0), 0) * 100) / 100;
        payroll = { net: sum('net'), income_tax: sum('income_tax'), efka: Math.round((sum('employee_contributions') + sum('employer_contributions')) * 100) / 100, currency: run.currency };
      }
      if (await creditBalance(supabase, userId) < PREPARE_CREDITS) return json({ error: `Not enough credits (need ${PREPARE_CREDITS}).`, code: 'insufficient_credits' }, 402);

      const tool = {
        name: 'reconcile_period',
        description: 'Reconcile extracted payment documents against a payroll period’s statutory obligations.',
        input_schema: {
          type: 'object',
          properties: {
            matches: { type: 'array', items: { type: 'object', properties: {
              obligation: { type: 'string', description: 'income_tax | efka | net | other' },
              expected_amount: { type: 'number' }, document_name: { type: 'string' },
              payment_id: { type: 'string' }, found_amount: { type: 'number' },
              status: { type: 'string', enum: ['matched', 'mismatch', 'missing_document', 'no_obligation'] },
            } } },
            discrepancies: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string', description: 'Plain-language reconciliation summary for the accountant.' },
            ready_to_pay: { type: 'boolean' },
          },
          required: ['matches', 'summary'],
        },
      };
      const payloadText = `Payroll period ${period}.\n\nPayroll obligations (from the run):\n${payroll ? JSON.stringify(payroll) : '(no payroll run found for this period)'}\n\nExtracted documents:\n${JSON.stringify(docs.map((d: any) => ({ name: d.name, kind: d.doc_kind, ...d.extracted })))}\n\nMatch each obligation (income tax → tax authority, EFKA → EFKA) to the document that pays it, using the payment_id from the document. Flag amount mismatches or missing documents. Amounts are in ${payroll?.currency ?? 'EUR'}.`;
      const out = await anthropicToolCall([{ type: 'text', text: payloadText }], tool, 1500);
      await debitCredits(supabase, userId, PREPARE_CREDITS, 'hr_accounting_prepare', `HR accounting reconciliation ${period}`, { workspace_id: workspaceId, period });

      // Best-effort: stamp each matched payment_id onto the period's Finance planned payment.
      let stamped = 0;
      if (run) {
        for (const m of (out.matches ?? [])) {
          const pid = String(m?.payment_id ?? '').trim();
          if (!pid || (m.status !== 'matched' && m.status !== 'mismatch')) continue;
          const category = m.obligation === 'income_tax' ? 'tax' : m.obligation === 'efka' ? 'social_security' : null;
          if (!category) continue;
          const { data: pp } = await supabase.from('planned_payments')
            .select('id, notes').eq('workspace_id', workspaceId).eq('category', category).ilike('title', `%${period}%`).limit(1).maybeSingle();
          if (pp) {
            await supabase.from('planned_payments').update({ notes: `${pp.notes ?? ''}\nPayment ID: ${pid}`.trim() }).eq('id', pp.id);
            stamped++;
          }
        }
      }
      return json({ reconciliation: out, stamped_finance_lines: stamped, credits_used: PREPARE_CREDITS });
    }

    default:
      return null;
  }
}
