/**
 * Order intake — the shared brain behind both channels. Issue #342 §3.
 *
 * Called from ONE chokepoint (`maybeRunOrderIntake` in `inbox-api`), immediately before the agent
 * reply, at all three places an inbound customer message lands. WhatsApp reaches it through
 * `zernio-webhook-handler` and email through `email-webhooks`, both of which already call
 * `internal_agent_reply` — so neither webhook needed a change.
 *
 * The result is a PROPOSAL stored on `inbox_threads.metadata.order_intake`. Nothing is written to
 * `orders` here, or anywhere, until a member approves it.
 */

import type { DbClient } from '../supabase-client.ts';
import { buildTranscript, classifyOrderIntent, extractOrderLines } from './extract.ts';
import { firstImageBase64, matchByImage, matchByText } from './match.ts';
import { defaultVatPercent, resolveLinePrice } from './price.ts';
import {
  DEFAULT_ORDER_INTAKE_SETTINGS,
  type IntakeItem,
  type OrderIntake,
  type OrderIntakeSettings,
} from './types.ts';

export * from './types.ts';
export { intakeDisplayTotal } from './types.ts';

/** How much conversation the reading is based on. */
const TRANSCRIPT_LIMIT = 30;

/** Per-workspace gate. Read-modify-write shape mirrors `settings.inbox_agent`. */
export async function orderIntakeSettings(
  db: DbClient,
  workspaceId: string,
): Promise<OrderIntakeSettings> {
  const { data } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const root = ((data as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>;
  const cfg = (root.order_intake || {}) as Record<string, unknown>;
  return {
    // Opt-IN, unlike the inbox agent's opt-out. #209 shipped manual-only takeover because
    // "auto-engaging billing without an explicit opt-in felt wrong"; extraction spends credits
    // on every inbound message, so it earns the stricter default.
    enabled: cfg.enabled === true,
    currency: typeof cfg.currency === 'string' ? cfg.currency : DEFAULT_ORDER_INTAKE_SETTINGS.currency,
    cost: Number.isFinite(Number(cfg.cost)) ? Number(cfg.cost) : DEFAULT_ORDER_INTAKE_SETTINGS.cost,
  };
}

/** The intake currently on a thread, if any. */
export function readIntake(threadMetadata: unknown): OrderIntake | null {
  const meta = (threadMetadata || {}) as Record<string, unknown>;
  const intake = meta.order_intake;
  if (!intake || typeof intake !== 'object') return null;
  return intake as OrderIntake;
}

/**
 * Read-modify-write the thread metadata, preserving every sibling key. Clobbering
 * `zernio_account_id` / `zernio_conversation_id` would break the WhatsApp relay binding, and
 * `email_to` / `email_from` are what the thread-correlation heuristic reads.
 */
export async function writeIntake(
  db: DbClient,
  threadId: string,
  intake: OrderIntake | null,
): Promise<void> {
  const { data } = await db.from('inbox_threads').select('metadata').eq('id', threadId).maybeSingle();
  const current = ((data as { metadata?: Record<string, unknown> } | null)?.metadata || {}) as Record<string, unknown>;
  const next = { ...current };
  if (intake) next.order_intake = intake;
  else delete next.order_intake;
  const { error } = await db.from('inbox_threads').update({ metadata: next }).eq('id', threadId);
  if (error) throw new Error(`failed to store the order intake: ${error.message}`);
}

/**
 * Should this message produce a (re-)reading?
 *
 * A pending intake is REPLACED rather than duplicated, so "and one box of the grey" amends the
 * order under review instead of racing a second one. A decided intake (approved or rejected) is
 * left alone unless the customer has spoken since — a follow-up order after an approval is a new
 * proposal, not an edit of a closed one.
 */
export function shouldReextract(existing: OrderIntake | null, latestMessageAt: string): boolean {
  if (!existing) return true;
  if (existing.status === 'pending_review') return true;
  if (!existing.reviewed_at) return true;
  return new Date(latestMessageAt).getTime() > new Date(existing.reviewed_at).getTime();
}

export interface IntakeRunResult {
  ran: boolean;
  reason?: string;
  intake?: OrderIntake;
}

/**
 * Read the conversation and store a proposal. Returns `ran:false` with a reason for every path
 * that deliberately does nothing — the caller logs it, so "intake never fires" is diagnosable
 * instead of silent.
 *
 * Billing: the classifier is a sub-cent Haiku call and runs free, exactly as the agent's own
 * decision to reply does. Credits are debited once we are committed to the expensive extraction
 * (invariant 10 — before the upstream call), and refunded when it yields nothing.
 */
export async function runOrderIntake(
  db: DbClient,
  args: {
    threadId: string;
    workspaceId: string;
    channel: string;
    /** Billed party — the workspace owner, same as the agent reply. */
    ownerUserId: string;
    contactId: string | null;
    companyId: string | null;
    settings: OrderIntakeSettings;
  },
): Promise<IntakeRunResult> {
  const { data: history } = await db
    .from('inbox_messages')
    .select('id, body, message_type, attachments, created_at')
    .eq('thread_id', args.threadId)
    .is('deleted_at', null)
    .neq('message_type', 'note')
    .order('created_at', { ascending: false })
    .limit(TRANSCRIPT_LIMIT);

  const rows = (history || []) as Array<{
    id: string; body: string | null; message_type: string;
    attachments: Array<Record<string, unknown>>; created_at: string;
  }>;
  const latest = rows[0];
  if (!latest) return { ran: false, reason: 'no messages' };

  const { data: threadRow } = await db
    .from('inbox_threads').select('metadata').eq('id', args.threadId).maybeSingle();
  const existing = readIntake((threadRow as { metadata?: unknown } | null)?.metadata);
  if (!shouldReextract(existing, latest.created_at)) {
    return { ran: false, reason: `intake already ${existing?.status}` };
  }

  const ordered = rows.slice().reverse();
  const transcript = buildTranscript(ordered);

  const intent = await classifyOrderIntent(transcript);
  if (intent.intent === 'other') {
    return { ran: false, reason: `not an order: ${intent.reason}` };
  }

  // Debit now that we are committed to the extraction call.
  const { data: debit } = await db.rpc('debit_credits', {
    p_user_id: args.ownerUserId,
    p_amount: args.settings.cost,
    p_operation_type: 'order_intake_extract',
    p_description: 'Order intake — read an order from a conversation',
    p_metadata: { thread_id: args.threadId, channel: args.channel, billing_type: 'order_intake' },
    p_workspace_id: args.workspaceId,
  });
  const debitRes = Array.isArray(debit) ? debit[0] : debit;
  if (!debitRes?.success) return { ran: false, reason: 'insufficient credits' };

  const refund = () => db.rpc('refund_credits', {
    p_user_id: args.ownerUserId,
    p_amount: args.settings.cost,
    p_operation_type: 'order_intake_extract_refund',
    p_description: 'Refund — order intake produced no lines',
    p_metadata: { thread_id: args.threadId },
    p_workspace_id: args.workspaceId,
    // A PostgREST builder is PromiseLike: it implements `then` but NOT `catch`, so `.catch(...)`
    // throws a synchronous TypeError and the refund never issues. Same trap as the reply path.
  }).then(() => {}, () => {});

  // Images on the triggering message — "2 boxes of this" (#342 §3a).
  const imageBase64 = await firstImageBase64(db, latest.attachments || []);

  let extracted;
  try {
    extracted = await extractOrderLines(transcript, { hasImages: Boolean(imageBase64) });
  } catch (err) {
    await refund();
    throw err;
  }

  if (!extracted.items.length) {
    await refund();
    return { ran: false, reason: 'no order lines found' };
  }

  const vatPercent = await defaultVatPercent(db, args.workspaceId);
  const items: IntakeItem[] = [];

  for (const [i, line] of extracted.items.entries()) {
    // A line pointing at a photo is matched by the photo; everything else by its words.
    const match = (line.refers_to_image && imageBase64)
      ? await matchByImage(db, args.workspaceId, imageBase64, line.description)
      : await matchByText(db, args.workspaceId, line.description);

    let unitPrice: number | null = null;
    let unitCost: number | null = null;
    let unit: string | null = line.unit ?? null;

    if (match.product_id) {
      const priced = await resolveLinePrice(db, {
        workspaceId: args.workspaceId,
        productId: match.product_id,
        companyId: args.companyId,
        contactId: args.contactId,
      });
      unitPrice = priced.unit_price;
      unitCost = priced.unit_cost;
      unit = priced.measurement_unit_code ?? unit;
    }

    items.push({
      line_no: i,
      raw_text: line.raw_text,
      product_id: match.product_id,
      match_method: match.method,
      match_confidence: match.confidence,
      candidates: match.candidates.length ? match.candidates : undefined,
      description: match.name || line.description,
      quantity: line.quantity,
      unit_price: unitPrice,
      unit_cost: unitCost,
      measurement_unit_code: unit,
      vat_percent: vatPercent,
      unit_price_source: 'resolver',
      // A visual match always gets a human look: the picture says WHAT, never how many, and a
      // confidently wrong product is worse than an unmatched line someone fixes in seconds.
      needs_review: !match.product_id || unitPrice == null || match.method === 'visual',
    });
  }

  const now = new Date().toISOString();
  const intake: OrderIntake = {
    status: 'pending_review',
    channel: args.channel,
    source_message_id: latest.id,
    // Seeded from the thread's own customer; the reviewer can retarget it before approving.
    customer_contact_id: args.contactId,
    customer_company_id: args.companyId,
    currency: extracted.currency || args.settings.currency,
    confidence: intent.confidence,
    requested_delivery_date: extracted.requested_delivery_date,
    notes: extracted.notes,
    order_id: null,
    reviewed_by: null,
    reviewed_at: null,
    confirmation: null,
    items,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await writeIntake(db, args.threadId, intake);
  return { ran: true, intake };
}
