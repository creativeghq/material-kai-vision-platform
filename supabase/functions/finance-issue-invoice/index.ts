// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { buildInvoiceInputFromDb, buildCreditNoteInputFromDb, buildDeliveryNoteInputFromDb, type FiscalOverrides } from '../_shared/fiscal/invoice-builder.ts';

// Sales/Finance — issue an invoice from an accepted quote.
//
// Flow:
//   1. Call `issue_invoice_from_quote(quote_id)` RPC. Creates a draft invoice + items
//      with cost_snapshot copied from quote_items. Idempotent — returns existing invoice
//      if one exists for the quote.
//   2. If body.issue_now=true, flip status draft → issued (stamps issued_at + due_at).
//   3. If body.push_to_oxygen=true AND quote has no oxygen_notice_id yet, invoke the
//      existing oxygen-create-pre-invoice function. The notice id flows back to both
//      quotes.oxygen_notice_id and (mirrored at next read) invoices.oxygen_notice_id.
//
// Auth: admin / super_admin / owner / finance.

interface RequestBody {
  /** Create/find the invoice from this quote. Provide this OR invoice_id. */
  quote_id?: string;
  /** Operate on an existing invoice directly (e.g. submit a manual invoice to myDATA). */
  invoice_id?: string;
  /** Submit a credit note (myDATA 5.1) to the workspace's legal_invoice connector. */
  credit_note_id?: string;
  /** Submit a delivery note (myDATA 9.3 movement document) to the legal_invoice connector. */
  delivery_note_id?: string;
  issue_now?: boolean;
  push_to_oxygen?: boolean;
  /** Transmit the invoice to the workspace's `legal_invoice` connector (e.g. Novus → myDATA). */
  submit_fiscal?: boolean;
  /** Skip the provider's digital signature step (Novus ?skipSignature=true). */
  skip_signature?: boolean;
  /** Per-call myDATA overrides (invoice type, series/aa, income classification). */
  fiscal_overrides?: FiscalOverrides;
}

// Platform cost per myDATA transmission (markup on Novus ~0.5-1 cr). Root transmits free.
const TRANSMISSION_CREDITS = 2;

/** Sub-tenant credit pre-check: returns an error object when the workspace must pay but
 *  can't afford a transmission — so we never give away a paid myDATA submission. */
async function transmissionCreditError(
  supabase: any, workspaceId: string, userId?: string,
): Promise<{ code: string; error: string; balance: number } | null> {
  const { data: ws } = await supabase.from('workspaces').select('is_root').eq('id', workspaceId).single();
  if (ws?.is_root || !userId) return null; // operator root transmits free
  const { data: cr } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
  const balance = cr?.balance ?? 0;
  if (balance < TRANSMISSION_CREDITS) {
    return { code: 'insufficient_credits', balance,
      error: `Not enough credits to transmit to myDATA (need ${TRANSMISSION_CREDITS}, have ${balance}). Please top up.` };
  }
  return null;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * #202 — is this user a FINANCE MANAGER (not just an allowed-in accountant) for the
 * workspace that owns this quote? Managers = workspace owner/admin OR a global
 * admin/super_admin/finance role. Runs under service role (auth.uid() is null), so we
 * resolve membership + global role by the authenticated user id directly.
 */
async function isFinanceManagerForQuote(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
  userId: string,
): Promise<boolean> {
  const { data: q } = await supabase.from('quotes').select('workspace_id').eq('id', quoteId).maybeSingle();
  if (!q?.workspace_id) return false;
  const [{ data: mem }, { data: prof }] = await Promise.all([
    supabase.from('workspace_members').select('role').eq('workspace_id', q.workspace_id).eq('user_id', userId).maybeSingle(),
    supabase.from('user_profiles').select('roles!user_profiles_role_id_fkey(name)').eq('user_id', userId).maybeSingle(),
  ]);
  const wsManager = !!mem && ['owner', 'admin'].includes((mem as any).role);
  const globalRole = (prof as any)?.roles?.name as string | undefined;
  const globalManager = !!globalRole && ['admin', 'super_admin', 'finance'].includes(globalRole);
  return wsManager || globalManager;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      // 'accountant' is allowed in so they can SUBMIT/transmit existing documents to myDATA
      // (#202). The privileged CREATE path (issue a new invoice from a quote) is guarded
      // separately below to managers only — an accountant can transmit + pay, never create.
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'accountant'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.quote_id && !body.invoice_id && !body.credit_note_id && !body.delivery_note_id) {
      return json({ error: 'quote_id, invoice_id, credit_note_id or delivery_note_id is required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Credit-note submission path (myDATA 5.1) ──────────────────────────────
    // A credit note is already created + the invoice already netted by issue_credit_note;
    // here we transmit it to the legal_invoice connector and stamp the MARK back.
    if (body.credit_note_id) {
      const { data: cnRow } = await supabase
        .from('credit_notes').select('workspace_id, fiscal_status, invoice_id')
        .eq('id', body.credit_note_id).single();
      if (!cnRow) return json({ error: 'credit note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, cnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (cnRow.fiscal_status === 'accepted') {
        return json({ ok: true, credit_note_id: body.credit_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: cnRow.workspace_id, p_module_slug: 'e-invoicing',
      });
      if (!entitled) {
        return json({ ok: false, code: 'not_entitled', error: 'Workspace not entitled to e-Invoicing.' }, 402);
      }

      const cnCreditErr = await transmissionCreditError(supabase, cnRow.workspace_id, auth.userId);
      if (cnCreditErr) return json({ ok: false, ...cnCreditErr }, 402);

      const resolved = await resolveWorkspaceConnector(supabase, cnRow.workspace_id, 'legal_invoice');
      if (!resolved.ok) return json({ ok: false, code: resolved.code, error: resolved.error }, 400);

      try {
        const input = await buildCreditNoteInputFromDb(supabase, body.credit_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: cnRow.workspace_id,
          invoice_id: cnRow.invoice_id, // correlated source invoice, for audit linkage
          connector_slug: resolved.resolved.slug,
          capability: 'legal_invoice',
          status: result.status,
          mark: result.mark ?? null,
          uid: result.uid ?? null,
          authentication_code: result.authenticationCode ?? null,
          qr_url: result.qrUrl ?? null,
          invoice_url: result.invoiceUrl ?? null,
          fiscal_invoice_type: input.header.invoiceType,
          series: input.header.series,
          aa: input.header.aa,
          is_offline: result.isOffline,
          transmission_failure: result.transmissionFailure ?? false,
          provider_credits: result.providerCredits ?? null,
          request_payload: input,
          response_payload: result.raw ?? null,
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage ?? null,
        });

        const accepted = result.status === 'accepted' || result.status === 'offline';
        await supabase.from('credit_notes').update({
          fiscal_status: result.status,
          fiscal_mark: result.mark ?? null,
          status: accepted ? 'submitted' : 'failed',
          updated_at: new Date().toISOString(),
        }).eq('id', body.credit_note_id);

        if (accepted && auth.userId) {
          try {
            const { data: wsRow } = await supabase.from('workspaces').select('is_root').eq('id', cnRow.workspace_id).single();
            if (!wsRow?.is_root) {
              await supabase.rpc('debit_user_credits', {
                p_user_id: auth.userId, p_amount: 2,
                p_operation_type: 'einvoice_transmission',
                p_description: `myDATA credit note ${body.credit_note_id}`,
              });
            }
          } catch (e) { console.warn('credit-note credit debit skipped', e); }
        }

        const { data: finalCn } = await supabase.from('credit_notes').select('*').eq('id', body.credit_note_id).single();
        return json({ ok: true, credit_note_id: body.credit_note_id, credit_note: finalCn, fiscal: { ok: true, ...result } });
      } catch (err: any) {
        return json({ ok: false, error: err?.message ?? 'credit note submission failed' }, 500);
      }
    }

    // ── Delivery-note submission path (myDATA 9.3 movement document) ──────────
    // The note already exists + stock already moved by issue_delivery_note; here we
    // transmit the movement document and stamp the MARK back onto delivery_notes.
    if (body.delivery_note_id) {
      const { data: dnRow } = await supabase
        .from('delivery_notes').select('workspace_id, fiscal_status')
        .eq('id', body.delivery_note_id).single();
      if (!dnRow) return json({ error: 'delivery note not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, dnRow.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }

      if (dnRow.fiscal_status === 'accepted') {
        return json({ ok: true, delivery_note_id: body.delivery_note_id, fiscal: { ok: true, skipped: true, reason: 'already_accepted' } });
      }

      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: dnRow.workspace_id, p_module_slug: 'e-invoicing',
      });
      if (!entitled) {
        return json({ ok: false, code: 'not_entitled', error: 'Workspace not entitled to e-Invoicing.' }, 402);
      }

      const dnCreditErr = await transmissionCreditError(supabase, dnRow.workspace_id, auth.userId);
      if (dnCreditErr) return json({ ok: false, ...dnCreditErr }, 402);

      const resolved = await resolveWorkspaceConnector(supabase, dnRow.workspace_id, 'legal_invoice');
      if (!resolved.ok) return json({ ok: false, code: resolved.code, error: resolved.error }, 400);

      try {
        const input = await buildDeliveryNoteInputFromDb(supabase, body.delivery_note_id, body.fiscal_overrides ?? {});
        const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
          skipSignature: body.skip_signature,
        });

        await supabase.from('fiscal_submissions').insert({
          workspace_id: dnRow.workspace_id,
          connector_slug: resolved.resolved.slug,
          capability: 'legal_invoice',
          status: result.status,
          mark: result.mark ?? null,
          uid: result.uid ?? null,
          authentication_code: result.authenticationCode ?? null,
          qr_url: result.qrUrl ?? null,
          invoice_url: result.invoiceUrl ?? null,
          fiscal_invoice_type: input.header.invoiceType,
          series: input.header.series,
          aa: input.header.aa,
          is_offline: result.isOffline,
          transmission_failure: result.transmissionFailure ?? false,
          provider_credits: result.providerCredits ?? null,
          request_payload: input,
          response_payload: result.raw ?? null,
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage ?? null,
        });

        const accepted = result.status === 'accepted' || result.status === 'offline';
        await supabase.from('delivery_notes').update({
          fiscal_status: result.status,
          fiscal_mark: result.mark ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', body.delivery_note_id);

        if (accepted && auth.userId) {
          try {
            const { data: wsRow } = await supabase.from('workspaces').select('is_root').eq('id', dnRow.workspace_id).single();
            if (!wsRow?.is_root) {
              await supabase.rpc('debit_user_credits', {
                p_user_id: auth.userId, p_amount: 2,
                p_operation_type: 'einvoice_transmission',
                p_description: `myDATA delivery note ${body.delivery_note_id}`,
              });
            }
          } catch (e) { console.warn('delivery-note credit debit skipped', e); }
        }

        const { data: finalDn } = await supabase.from('delivery_notes').select('*').eq('id', body.delivery_note_id).single();
        return json({ ok: true, delivery_note_id: body.delivery_note_id, delivery_note: finalDn, fiscal: { ok: true, ...result } });
      } catch (err: any) {
        return json({ ok: false, error: err?.message ?? 'delivery note submission failed' }, 500);
      }
    }

    // 1. Resolve the invoice: existing invoice_id, or idempotent create from quote.
    let invoiceId: string;
    if (body.invoice_id) {
      invoiceId = body.invoice_id;
      // Bind direct-invoice operations (issue / submit to myDATA) to the caller's workspace.
      // Without this, any finance user could issue/transmit another tenant's invoice by id.
      const { data: invWs } = await supabase.from('invoices').select('workspace_id').eq('id', invoiceId).single();
      if (!invWs) return json({ error: 'invoice not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, invWs.workspace_id))) {
        return json({ error: 'Not authorized for this document' }, 403);
      }
    } else {
      // CREATE path (issue a new invoice from a quote) — managers only. Block accountants
      // (and any other non-manager allowed in for the submit path). auth.uid() is null under
      // service role, so resolve the caller's role for the quote's workspace explicitly.
      const mgr = await isFinanceManagerForQuote(supabase, body.quote_id!, auth.userId!);
      if (!mgr) {
        return json({ error: 'Only a finance manager can issue a new invoice. Accountants may transmit and pay existing documents.' }, 403);
      }
      const { data: created, error: rpcErr } = await supabase.rpc('issue_invoice_from_quote', {
        p_quote_id: body.quote_id,
      });
      if (rpcErr) return json({ error: `issue_invoice_from_quote failed: ${rpcErr.message}` }, 500);
      invoiceId = created as string;
    }

    // 2. Optional issue (draft → issued)
    let invoiceState: any = null;
    if (body.issue_now) {
      // Skip if already issued — mark_invoice_issued errors out on non-draft state.
      const { data: current } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();
      if (current?.status === 'draft') {
        const { error: issueErr } = await supabase.rpc('mark_invoice_issued', {
          p_invoice_id: invoiceId,
        });
        if (issueErr) return json({ error: `mark_invoice_issued failed: ${issueErr.message}` }, 500);
      }
    }

    // 3. Optional Oxygen push (reuses oxygen-api action=create_pre_invoice)
    let oxygenResult: any = null;
    if (body.push_to_oxygen && body.quote_id) {
      try {
        const oxygenRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/oxygen-api`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: req.headers.get('Authorization') ?? '',
              apikey: req.headers.get('apikey') ?? '',
            },
            body: JSON.stringify({ action: 'create_pre_invoice', quote_id: body.quote_id }),
          },
        );
        oxygenResult = await oxygenRes.json();

        // Mirror oxygen_notice_id back onto the invoice if Oxygen returned one
        if (oxygenResult?.oxygen_notice_id) {
          await supabase
            .from('invoices')
            .update({ oxygen_notice_id: oxygenResult.oxygen_notice_id })
            .eq('id', invoiceId)
            .is('oxygen_notice_id', null);
        }
      } catch (err: any) {
        oxygenResult = { error: err?.message ?? 'oxygen push failed' };
      }
    }

    // 3b. Optional fiscal submission via the workspace's legal_invoice connector
    //     (e.g. Novus → myDATA). Connector-driven, per-capability (C3). Graceful
    //     when no key is configured yet — returns a clear not_configured result.
    let fiscalResult: any = null;
    if (body.submit_fiscal) {
      const { data: invRow } = await supabase
        .from('invoices')
        .select('workspace_id, fiscal_status')
        .eq('id', invoiceId)
        .single();

      // Monetization gate (#181): the workspace must be entitled to e-invoicing.
      const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
        p_workspace_id: invRow!.workspace_id,
        p_module_slug: 'e-invoicing',
      });

      if (invRow?.fiscal_status === 'accepted') {
        fiscalResult = { ok: true, skipped: true, reason: 'already_accepted' };
      } else if (!entitled) {
        fiscalResult = {
          ok: false,
          code: 'not_entitled',
          error: 'This workspace is not entitled to e-Invoicing. The operator must enable it for this workspace.',
        };
      } else {
        const creditErr = await transmissionCreditError(supabase, invRow!.workspace_id, auth.userId);
        const resolved: any = creditErr ? null : await resolveWorkspaceConnector(supabase, invRow!.workspace_id, 'legal_invoice');
        if (creditErr) {
          fiscalResult = { ok: false, ...creditErr };
        } else if (!resolved!.ok) {
          fiscalResult = { ok: false, code: resolved!.code, error: resolved!.error };
        } else {
          try {
            const input = await buildInvoiceInputFromDb(supabase, invoiceId, body.fiscal_overrides ?? {});
            const result = await resolved.resolved.connector.submitInvoice(input, resolved.resolved.ctx, {
              skipSignature: body.skip_signature,
            });

            await supabase.from('fiscal_submissions').insert({
              workspace_id: invRow!.workspace_id,
              invoice_id: invoiceId,
              connector_slug: resolved.resolved.slug,
              capability: 'legal_invoice',
              status: result.status,
              mark: result.mark ?? null,
              uid: result.uid ?? null,
              authentication_code: result.authenticationCode ?? null,
              qr_url: result.qrUrl ?? null,
              invoice_url: result.invoiceUrl ?? null,
              fiscal_invoice_type: input.header.invoiceType,
              series: input.header.series,
              aa: input.header.aa,
              is_offline: result.isOffline,
              transmission_failure: result.transmissionFailure ?? false,
              provider_credits: result.providerCredits ?? null,
              request_payload: input,
              response_payload: result.raw ?? null,
              error_code: result.errorCode ?? null,
              error_message: result.errorMessage ?? null,
            });

            if (result.status === 'accepted' || result.status === 'offline') {
              await supabase
                .from('invoices')
                .update({
                  fiscal_status: result.status,
                  fiscal_mark: result.mark ?? null,
                  fiscal_uid: result.uid ?? null,
                  fiscal_qr_url: result.qrUrl ?? null,
                  fiscal_connector_slug: resolved.resolved.slug,
                  fiscal_submitted_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);
            } else {
              await supabase.from('invoices').update({ fiscal_status: result.status }).eq('id', invoiceId);
            }

            // #181 meter the transmission against the issuing user's platform credits.
            // The operator root transmits free; sub-tenants are billed per accepted doc.
            if ((result.status === 'accepted' || result.status === 'offline') && auth.userId) {
              try {
                const { data: wsRow } = await supabase
                  .from('workspaces').select('is_root').eq('id', invRow!.workspace_id).single();
                if (!wsRow?.is_root) {
                  await supabase.rpc('debit_user_credits', {
                    p_user_id: auth.userId,
                    p_amount: 2, // platform cost per myDATA transmission (markup on Novus ~0.5-1 cr)
                    p_operation_type: 'einvoice_transmission',
                    p_description: `myDATA transmission for invoice ${invoiceId}`,
                  });
                }
              } catch (e) {
                console.warn('einvoice credit debit skipped', e);
              }
            }

            fiscalResult = { ok: true, ...result };
          } catch (err: any) {
            fiscalResult = { ok: false, error: err?.message ?? 'fiscal submission failed' };
          }
        }
      }
    }

    // 4. Read final state for the response
    const { data: finalInvoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    return json({
      ok: true,
      invoice_id: invoiceId,
      invoice: finalInvoice,
      oxygen: oxygenResult,
      fiscal: fiscalResult,
    });
  } catch (err: any) {
    console.error('finance-issue-invoice error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});
