/**
 * Flow Engine Edge Function
 *
 * Executes workflow automations by walking the xyflow graph definition.
 * Actions:
 * - execute-flow: Run a flow with trigger data
 * - test-flow: Dry-run (actions resolve templates but don't fire)
 * - trigger-event: Auto-dispatch from DB triggers (Phase 4)
 */

import { loadPrompt, renderPromptTemplate, getToolPrompt } from '../_shared/prompt-utils.ts';
import { callClaudeMessages } from '../_shared/ai-client.ts';
import { buildMarketScope, loadVocabulary } from '../_shared/vocabularies.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse } from '../_shared/http.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isCronAuthorized, userCanAccessWorkspace, type AuthResult } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { debitExternalServiceCredits, checkCreditBalance } from '../_shared/credit-utils.ts';
import { priceWhatsAppMessage } from '../_shared/whatsapp-rates.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
// One answer to "which sender does this workspace use" (#357 AE-1).
import { resolveWorkspaceEmailSender } from '../_shared/email-sender.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// =====================================================
// TYPES
// =====================================================

interface FlowNode {
  id: string;
  type: 'triggerNode' | 'conditionNode' | 'actionNode';
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    category: 'trigger' | 'condition' | 'action';
    triggerType?: string;
    conditionType?: string;
    actionType?: string;
    config: Record<string, unknown>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };
}

interface ExecutionContext {
  trigger: { data: Record<string, unknown> };
  [nodeId: string]: unknown;
}

/**
 * The owning scope of the flow currently executing. Threaded from the flow row down
 * to each action so tenant flows resolve the workspace's OWN Resend (BYOK) sender and the
 * per-workspace daily cap, while operator/global flows send as the platform (unmetered),
 * exactly as system/transactional mail does today.
 */
interface FlowScope {
  workspaceId: string | null;
  isGlobal: boolean;
  /** The flow owner (flows.created_by) — the acting user for workspace-pool debits when a
   *  tenant flow runs off a 'system' trigger (no real acting user). */
  ownerUserId: string | null;
  /** Delivery channels the EVENT's workspace has muted on this (global) flow — see
   *  `workspace_flow_preferences`. Empty/absent means deliver everything, which is the
   *  platform default. Applied in executeAction, the one place every action passes through. */
  mutedActions?: Set<string>;
}

// Every TENANT flow RUN costs a base fee (billed to the workspace credit pool),
// plus any per-action external/AI cost. Operator/global flows and test runs are free.
// 1 credit = $0.01 in this system, so $0.20 = 20 credits.
const FLOW_RUN_BASE_CREDITS = 20;

/**
 * Resolve who/what to bill for an action-level debit. Returns null when the run must not be
 * charged (operator/global/system flows — same as today). For a real user run, bill that user
 * (+ their workspace pool if known). For a tenant flow fired by a 'system' trigger, bill the
 * flow owner against the flow's workspace pool.
 */
/**
 * Does this workspace have a usable BYOK Resend sender?
 *
 * ASKS THE RESOLVER rather than re-deriving it (#357 AE-1). This used to be a hand-written copy
 * of `resolveWorkspaceEmailSender`'s `source === 'workspace'` condition — its own comment said
 * "mirrors", which is the word that precedes a drift. It was the third copy of that rule; the
 * other two lived in `email-api` and are gone too.
 *
 * It matters more here than it looks: a wrong answer decides whether a tenant flow's email goes
 * out on the tenant's domain or the operator's, and the resolver now REFUSES the second case
 * outright, so a divergent copy would report "no BYOK" and then send anyway.
 */
async function workspaceHasByok(supabase: DbClient, workspaceId: string): Promise<boolean> {
  const sender = await resolveWorkspaceEmailSender(supabase, workspaceId);
  return sender.source === 'workspace';
}

/** Global platform admin/super_admin — allowed to run operator (is_global) flows on demand. */
async function isPlatformAdmin(supabase: DbClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('roles!user_profiles_role_id_fkey(name)')
    .eq('user_id', userId)
    .maybeSingle();
  const role = (data as { roles?: { name?: string } } | null)?.roles?.name;
  return role === 'admin' || role === 'super_admin';
}

// Flat charge for the web_search / perplexity_search action (Anthropic Haiku + web_search
// server-tool surcharge, max_uses=5 ≈ $0.05 + tokens → ~$0.08 billed → ~8 credits). Debited
// up front on tenant flows and refunded on failure; operator/global flows stay free.
const FLOW_WEB_SEARCH_COST = 8;

// Preflight affordability gate for an ext-service flow action: block a 0-credit tenant flow
// owner BEFORE the paid upstream call. Operator/global flows resolve to null → not gated.
// Returns an error string when the caller can't afford `serviceName`, else null.
async function assertFlowCanAfford(
  supabase: DbClient,
  userId: string | undefined,
  scope: FlowScope | undefined,
  serviceName: string,
): Promise<string | null> {
  const dt = resolveFlowDebit(userId, scope);
  if (!dt) return null; // operator/global flow — stays free, not gated
  const chk = await checkCreditBalance(supabase, dt.userId, serviceName, 1, dt.workspaceId);
  return chk.sufficient ? null : 'insufficient_credits: not enough credits to run this automation action';
}

function resolveFlowDebit(
  userId: string | undefined,
  scope: FlowScope | undefined,
): { userId: string; workspaceId: string | null } | null {
  if (isRealUserId(userId)) return { userId: userId!, workspaceId: scope?.workspaceId ?? null };
  if (scope && scope.workspaceId && !scope.isGlobal && scope.ownerUserId) {
    return { userId: scope.ownerUserId, workspaceId: scope.workspaceId };
  }
  return null;
}

// =====================================================
// TEMPLATE RESOLVER
// =====================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path: string) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined ? String(value) : match;
  });
}

function resolveAllTemplates(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      resolved[key] = resolveTemplate(value, context);
    } else if (Array.isArray(value)) {
      resolved[key] = value.map((item) =>
        typeof item === 'string'
          ? resolveTemplate(item, context)
          : typeof item === 'object' && item !== null
          ? resolveAllTemplates(item as Record<string, unknown>, context)
          : item,
      );
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveAllTemplates(value as Record<string, unknown>, context);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

// Only debit credits for real authenticated users, never for 'system' or internal triggers
const isRealUserId = (id?: string): boolean =>
  !!id && id !== 'system' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Retry wrapper for transient external API failures (non-mutating operations only)
async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 600): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

// =====================================================
// CONDITION EVALUATOR
// =====================================================

function evaluateComparison(
  fieldValue: unknown,
  operator: string,
  testValue: unknown,
): boolean {
  const a = String(fieldValue ?? '');
  const b = String(testValue ?? '');

  switch (operator) {
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'contains': return a.includes(b);
    case 'not_contains': return !a.includes(b);
    case 'starts_with': return a.startsWith(b);
    case 'ends_with': return a.endsWith(b);
    case 'gt': return Number(a) > Number(b);
    case 'gte': return Number(a) >= Number(b);
    case 'lt': return Number(a) < Number(b);
    case 'lte': return Number(a) <= Number(b);
    case 'is_empty': return a === '' || a === 'undefined' || a === 'null';
    case 'is_not_empty': return a !== '' && a !== 'undefined' && a !== 'null';
    default: return false;
  }
}

async function executeCondition(
  node: FlowNode,
  context: ExecutionContext,
): Promise<{ output: Record<string, unknown>; branch: string }> {
  const { conditionType, config } = node.data;

  switch (conditionType) {
    case 'if_else': {
      const { field, operator, value } = config as { field: string; operator: string; value: string };
      const fieldValue = getNestedValue(context as unknown as Record<string, unknown>, resolveTemplate(field, context as unknown as Record<string, unknown>));
      const testValue = resolveTemplate(String(value), context as unknown as Record<string, unknown>);
      const result = evaluateComparison(fieldValue, operator, testValue);
      return { output: { result, fieldValue, testValue }, branch: result ? 'true' : 'false' };
    }

    case 'switch': {
      const { field, cases } = config as { field: string; cases: Array<{ value: string; label: string }> };
      const fieldValue = String(getNestedValue(context as unknown as Record<string, unknown>, resolveTemplate(field, context as unknown as Record<string, unknown>)) ?? '');
      const matchedCase = (cases || []).findIndex((c: { value: string }) => c.value === fieldValue);
      if (matchedCase >= 0) {
        return { output: { matchedCase, fieldValue }, branch: `case_${matchedCase}` };
      }
      return { output: { matchedCase: -1, fieldValue }, branch: 'default' };
    }

    case 'filter': {
      const { conditions, logic } = config as {
        conditions: Array<{ field: string; operator: string; value: string }>;
        logic: 'and' | 'or';
      };
      const results = (conditions || []).map((cond) => {
        const fv = getNestedValue(context as unknown as Record<string, unknown>, resolveTemplate(cond.field, context as unknown as Record<string, unknown>));
        return evaluateComparison(fv, cond.operator, resolveTemplate(cond.value, context as unknown as Record<string, unknown>));
      });
      const passed = logic === 'and' ? results.every(Boolean) : results.some(Boolean);
      return { output: { passed, results }, branch: passed ? 'output' : '__stop__' };
    }

    case 'delay': {
      const { duration, unit } = config as { duration: number; unit: string };
      const ms = duration * ({ seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 }[unit] || 60000);
      // Cap at 25s to stay within edge function timeout budget
      const cappedMs = Math.min(ms, 25000);
      await new Promise((resolve) => setTimeout(resolve, cappedMs));
      return { output: { delayed: true, requested_ms: ms, actual_ms: cappedMs }, branch: 'output' };
    }

    case 'stop': {
      // Hard short-circuit of this branch. Placed after an if_else/filter false
      // branch to halt a flow (e.g. "already notified in last 7d → stop").
      return { output: { stopped: true }, branch: '__stop__' };
    }

    case 'ab_split': {
      // Random A/B branch. Handles are 'a' / 'b' (see ConditionNode). split_percentage is the % going
      // to branch A. Deterministic-free by design — each run rolls independently.
      const pct = Math.max(0, Math.min(100, Number((config as { split_percentage?: number }).split_percentage ?? 50)));
      const roll = Math.random() * 100;
      const branch = roll < pct ? 'a' : 'b';
      return { output: { branch, roll: Math.round(roll * 100) / 100, split_percentage: pct }, branch };
    }

    default:
      return { output: {}, branch: 'output' };
  }
}

// =====================================================
// ACTION EXECUTORS
// =====================================================

// Allowlisted columns for the update_contact / update_product actions — identity/trust/tenancy fields
// (id, workspace_id, user_id, created_by, embeddings, cost provenance, …) are NEVER writable via a flow.
const CONTACT_UPDATABLE = [
  'name', 'email', 'phone', 'mobile', 'position', 'department', 'company', 'website', 'industry',
  'address', 'city', 'state', 'postal_code', 'country', 'country_code', 'lead_source', 'lead_status',
  'status', 'notes', 'profession', 'contact_group',
];
const PRODUCT_UPDATABLE = [
  'name', 'description', 'long_description', 'status', 'sku', 'external_sku', 'category',
  'barcode', 'measurement_unit_code', 'work_category',
];

async function executeAction(
  supabase: DbClient,
  node: FlowNode,
  context: ExecutionContext,
  isTestRun: boolean,
  userId?: string,
  scope?: FlowScope,
): Promise<{ output: Record<string, unknown> }> {
  const { actionType, config } = node.data;

  // The workspace this event belongs to has switched this channel off (Automations → Platform
  // defaults). Checked HERE because executeAction is the single point every action passes through —
  // the BFS walk and the loop-node body both call it, and a check at either call site alone would
  // let a looped send straight past. Recorded as a skipped step so a run still shows WHY nothing
  // was sent; an action that silently no-ops is indistinguishable from one that failed.
  if (actionType && scope?.mutedActions?.has(actionType)) {
    return { output: { skipped: true, reason: 'muted_by_workspace', action: actionType } };
  }

  const resolved = resolveAllTemplates(
    config as Record<string, unknown>,
    context as unknown as Record<string, unknown>,
  );

  // In test mode, return resolved config without executing
  if (isTestRun) {
    return {
      output: {
        test_mode: true,
        action: actionType,
        resolved_config: resolved,
      },
    };
  }

  switch (actionType) {
    // 'send_sms' kept as a legacy alias — SMS is gone, both now send WhatsApp via Zernio.
    case 'send_sms':
    case 'send_whatsapp': {
      // Fail-closed affordability gate: block a 0-credit tenant flow owner before the send.
      // Priced before the affordability gate so the gate asks about the RIGHT amount: a template
      // send can cost an order of magnitude more than a service reply, and checking the cheap
      // one lets a tenant who cannot afford the send through it.
      const waPrice = await priceWhatsAppMessage(supabase, {
        // `resolved` is the flow's config after variable substitution, so every field is unknown
        // to the compiler; the send below coerces the same way.
        to: String(resolved.to ?? ''),
        isTemplate: Boolean(resolved.template_id || resolved.template_slug),
        category: null,
      });
      { const g = await assertFlowCanAfford(supabase, userId, scope, waPrice.serviceKey); if (g) throw new Error(g); }
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send',
          to: resolved.to,
          content: resolved.message,
          templateId: resolved.template_id || resolved.template_slug || undefined,
          from: resolved.from || undefined,
        },
      });
      if (error) throw new Error(`WhatsApp send failed: ${error.message}`);
      {
        const dt = resolveFlowDebit(userId, scope);
        if (dt) {
          await debitExternalServiceCredits(
            supabase, dt.userId, waPrice.serviceKey, 'flow_send_whatsapp', 1,
            { to: resolved.to, rate_country: waPrice.country, rate_category: waPrice.category, rate_wildcard: waPrice.usedWildcard },
            dt.workspaceId, {}, waPrice.costPerUnit,
          );
        }
      }
      return { output: { sent: true, ...(data || {}) } };
    }

    case 'send_email': {
      // Guard the recipient. There are TWO ways `to` arrives broken and only one was caught:
      //   • the template never resolved            -> still contains "{{…}}"   (caught)
      //   • the template resolved to JSON null     -> String() yields the LITERAL "null",
      //     which is non-empty and brace-free, so it sailed through and got handed to Resend.
      // The seeded "Order Dispatched" flow does exactly this whenever the customer has no
      // email on file (`_notify_order_dispatched` passes customer_email: null): every dispatch
      // then produced a 500 from email-api and a permanently `queued` row in email_logs, retried
      // on every re-run. Anything not email-shaped is an upstream payload bug — skip it, and put
      // the offending value in the run output so the flow run says WHY instead of failing blind.
      const emailTo = String(resolved.to ?? '').trim();
      const emailParts = emailTo.split(',').map((p) => p.trim()).filter(Boolean);
      const emailToValid = emailParts.length > 0
        && emailParts.every((p) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(p));
      if (!emailTo || emailTo.includes('{{') || !emailToValid) {
        return { output: { skipped: true, reason: 'unresolved_to', to: emailTo || null } };
      }
      // `variables` lets a flow fill an email template's {{tag}} placeholders.
      // The config holds it as a JSON object (templated values already resolved
      // by resolveAllTemplates), so an operator can map trigger.data → template tags.
      let emailVariables: Record<string, unknown> | undefined;
      if (resolved.variables && typeof resolved.variables === 'object') {
        emailVariables = resolved.variables as Record<string, unknown>;
      } else if (typeof resolved.variables === 'string' && resolved.variables.trim()) {
        try {
          emailVariables = JSON.parse(resolved.variables);
        } catch {
          // leave undefined — a malformed map shouldn't block the send
        }
      }

      // The "from" identity follows the WORKSPACE the email is ABOUT, so a tenant's
      // customer-facing mail carries the tenant's own domain, not the platform's:
      //  • TENANT flow (is_global=false): strict BYOK from the flow's workspace — 503 if unset
      //    (never silently fall back to the platform domain for a tenant's own automation).
      //  • OPERATOR/global flow: use the EVENT's workspace when it carries one (invoice/payment/
      //    receipt events do) AND that workspace has BYOK → sends from that tenant's domain;
      //    otherwise (no event workspace, or no BYOK — e.g. platform subscription/role emails)
      //    fall back to the platform sender. requireWorkspaceSender is false here, so it degrades
      //    gracefully rather than failing.
      const emailIsTenant = !!scope?.workspaceId && !scope?.isGlobal;
      let emailWorkspaceId: string | null = null;
      // WHOSE email this is, which is a different question from whose SENDER goes out. An
      // operator flow reacting to a tenant event sends from the platform address (unmetered,
      // by design) but the mail still belongs to that tenant's history.
      let eventWorkspaceId: string | null = null;
      if (emailIsTenant) {
        // A tenant automation MUST send from the workspace's own domain. If no BYOK sender is
        // connected, FAIL LOUDLY with an actionable reason (stored on flow_runs.error_message)
        // AND raise the seeded email_sender_not_configured bell so the owner knows to fix it —
        // never silently fall back to the platform domain for a tenant's own mail.
        if (!(await workspaceHasByok(supabase, scope!.workspaceId))) {
          if (scope!.ownerUserId) {
            await emitFlowEvent('email_sender_not_configured', {
              workspace_id: scope!.workspaceId,
              user_id: scope!.ownerUserId,
              feature: 'automations',
              action_url: '/profile?tab=keys',
              title: 'Connect your email to send',
              body: 'An automation tried to send an email, but this workspace hasn\'t connected its own email sender yet. Connect Resend under Profile → Keys to start sending from your own address.',
              type: 'email_sender_not_configured',
            }).catch(() => { /* best-effort bell */ });
          }
          throw new Error('email_sender_not_configured: This automation can\'t send email because your workspace has no email sender connected. Connect your Resend account under Profile → Keys, then re-run this automation.');
        }
        emailWorkspaceId = scope!.workspaceId; // strict BYOK below
      } else {
        // Operator flow: divert to the event's workspace sender ONLY when that workspace has BYOK
        // (so a no-BYOK / platform-level email stays platform-sent AND unmetered — no daily cap).
        const eventWs = (context.trigger as { data?: Record<string, unknown> } | undefined)?.data?.workspace_id;
        if (typeof eventWs === 'string' && eventWs) eventWorkspaceId = eventWs;
        if (typeof eventWs === 'string' && eventWs && await workspaceHasByok(supabase, eventWs)) {
          emailWorkspaceId = eventWs;
        }
      }
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          to: emailTo,
          from: resolved.from || undefined,
          subject: resolved.subject,
          html: resolved.body,
          // email-api expects templateSlug (not template_id); template fields
          // (subject/body) are rendered from `variables` server-side.
          templateSlug: resolved.template_id || resolved.template_slug || undefined,
          variables: emailVariables,
          // Attribution travels even when the SENDER does not. An operator flow emailing a
          // tenant's customer from the platform address still belongs to that tenant's history —
          // and until now it was logged against nobody, so the tenant could not see the order and
          // payment mail going out in their name. Ignored by email-api when `workspace_id` is set.
          ...(eventWorkspaceId ? { attribution_workspace_id: eventWorkspaceId } : {}),
          ...(emailWorkspaceId
            ? {
                workspace_id: emailWorkspaceId,
                requireWorkspaceSender: emailIsTenant, // strict only for tenant flows
                ...(emailIsTenant ? { emailType: 'marketing' } : {}),
              }
            : {}),
        },
      });
      if (error) throw new Error(`Email failed: ${error.message}`);
      return { output: { sent: true, ...(data || {}) } };
    }

    case 'send_campaign': {
      // Bridge a flow to the Email Marketing module. The action names an
      // existing email campaign owned by THIS flow's workspace; we flip it to 'sending' so
      // campaign-processor fans it out via the workspace's BYOK Resend. Tenant-only: refuse
      // when the flow has no workspace scope, and only ever touch a campaign that belongs to
      // the flow's own workspace (no cross-tenant dispatch).
      const campaignId = String(resolved.campaign_id ?? '');
      if (!campaignId || campaignId.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_campaign_id' } };
      }
      if (!scope?.workspaceId || scope.isGlobal) {
        return { output: { skipped: true, reason: 'send_campaign_requires_tenant_scope' } };
      }
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .select('id, workspace_id, status, channel_type')
        .eq('id', campaignId)
        .maybeSingle();
      if (campErr) throw new Error(`send_campaign lookup failed: ${campErr.message}`);
      if (!campaign || campaign.workspace_id !== scope.workspaceId) {
        // 404-style: never reveal another tenant's campaign existence.
        return { output: { skipped: true, reason: 'campaign_not_found_in_workspace' } };
      }
      if (!['draft', 'paused', 'scheduled'].includes(String(campaign.status))) {
        return { output: { skipped: true, reason: `campaign_not_dispatchable (${campaign.status})` } };
      }
      const { error: updErr } = await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaignId)
        .eq('workspace_id', scope.workspaceId);
      if (updErr) throw new Error(`send_campaign failed: ${updErr.message}`);
      return { output: { dispatched: true, campaign_id: campaignId } };
    }

    case 'http_request': {
      const method = String(resolved.method || 'POST');
      const timeoutMs = Number(resolved.timeout_ms) || 30000;

      const doRequest = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          // Use resolved headers so template variables in header values are substituted
          if (resolved.headers && typeof resolved.headers === 'object') {
            Object.assign(headers, resolved.headers);
          }

          const response = await fetch(String(resolved.url), {
            method,
            headers,
            body: method !== 'GET' ? String(resolved.body || '{}') : undefined,
            signal: controller.signal,
          });

          let responseBody: unknown;
          try {
            responseBody = await response.json();
          } catch {
            responseBody = await response.text();
          }

          return { status: response.status, ok: response.ok, body: responseBody };
        } finally {
          clearTimeout(timer);
        }
      };

      // Retry once on network-level failures (abort/connection errors), not on HTTP error codes
      const result = await withRetry(doRequest);
      return { output: result };
    }

    case 'create_notification': {
      // Safety guard for the notification→flow migration: if the trigger
      // payload predates the migration (older client still emitting id-only
      // events), the templates won't resolve. Skip rather than insert a row
      // with literal "{{trigger.data.x}}" text. Makes the cutover safe in any
      // deploy order (the legacy hardcoded insert still delivers until the
      // enriched-emit client ships).
      const notifUserId = String(resolved.user_id ?? '');
      if (!notifUserId || notifUserId.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_user_id' } };
      }
      const notifTitle = String(resolved.title ?? '');
      if (!notifTitle || notifTitle.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_title' } };
      }
      const notifBody = String(resolved.body ?? '');

      // N4: honor the notifications module toggle (was cosmetic — rows were written regardless, so
      // disabling only hid the bell). Skip delivery when the module row exists AND is explicitly
      // disabled; a missing row means default-on (never accidentally silence all notifications).
      const { data: notifModule } = await supabase
        .from('modules').select('enabled').eq('slug', 'notifications').maybeSingle();
      if (notifModule && notifModule.enabled === false) {
        return { output: { skipped: true, reason: 'module_disabled' } };
      }

      const { error } = await supabase.from('user_notifications').insert({
        user_id: notifUserId,
        title: notifTitle,
        body: notifBody.includes('{{') ? '' : notifBody,
        type: resolved.type || 'info',
        action_url: (resolved.action_url && !String(resolved.action_url).includes('{{')) ? resolved.action_url : null,
        metadata: resolved.metadata || {},
        is_read: false,
      });
      if (error) throw new Error(`Notification failed: ${error.message}`);
      return { output: { created: true } };
    }

    case 'send_price_alert': {
      // Module-gated price alert via the dispatcher service. The flow engine
      // delegates the actual fan-out to the Python backend so credit metering,
      // dedupe, and channel resolution stay in one place.
      // Required resolved fields:
      //   alert_type: 'price_drop' | 'new_retailer' | 'promo_started' | 'anomaly_detected'
      //   product_id  OR  tracked_query_id
      //   retailer_name, retailer_domain, title, body, payload, action_url
      const { data: moduleRow } = await supabase
        .from('modules')
        .select('enabled')
        .eq('slug', 'price-monitoring-notifications')
        .maybeSingle();
      if (!moduleRow?.enabled) {
        return { output: { skipped: true, reason: 'module_disabled' } };
      }

      // Direct insert path — keeps the flow engine self-contained without
      // a Python round-trip. Credit metering for non-bell channels happens
      // in the dispatcher; flows hit the bell only by default.
      const { error } = await supabase.from('user_notifications').insert({
        user_id: resolved.user_id,
        title: resolved.title || 'Price alert',
        body: resolved.body || '',
        type: resolved.alert_type || 'price_drop',
        action_url: resolved.action_url || null,
        metadata: {
          source_module: 'price-monitoring-notifications',
          product_id: resolved.product_id,
          tracked_query_id: resolved.tracked_query_id,
          retailer_name: resolved.retailer_name,
          retailer_domain: resolved.retailer_domain,
          payload: resolved.payload || {},
          via: 'flow-engine',
        },
        is_read: false,
      });
      if (error) throw new Error(`Price alert failed: ${error.message}`);

      // Mirror the alert in price_alert_log for audit + dedupe parity with
      // the Python dispatcher.
      await supabase.from('price_alert_log').insert({
        user_id: resolved.user_id,
        product_id: resolved.product_id || null,
        tracked_query_id: resolved.tracked_query_id || null,
        alert_type: resolved.alert_type || 'price_drop',
        retailer_name: resolved.retailer_name || null,
        retailer_domain: resolved.retailer_domain || null,
        payload: resolved.payload || {},
        channels_fired: ['bell'],
        channels_skipped: [],
        credits_charged: 0,
      });
      return { output: { sent: true } };
    }

    case 'send_quote': {
      // Invoke quote PDF generation and send
      const { data, error } = await supabase.functions.invoke('generate-quote-pdf', {
        body: {
          quote_id: resolved.quote_id,
          send_email: resolved.send_email,
          send_sms: resolved.send_sms,
        },
      });
      if (error) throw new Error(`Quote send failed: ${error.message}`);
      return { output: { sent: true, ...(data || {}) } };
    }

    case 'build_quote': {
      // Look up the user's workspace_id so the quote isn't orphaned
      let workspaceId: string | null = null;
      if (resolved.user_id) {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', resolved.user_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        workspaceId = member?.workspace_id ?? null;
      }

      const { data, error } = await supabase.from('quotes').insert({
        user_id: resolved.user_id,
        workspace_id: workspaceId,
        name: resolved.name || 'Auto-generated Quote',
        status: 'draft',
      }).select().single();
      if (error) throw new Error(`Build quote failed: ${error.message}`);
      return { output: { quote_id: data.id, created: true } };
    }

    case 'send_agent_message': {
      // Determine conversation ID
      let conversationId = String(resolved.conversation_id || '');
      if (resolved.use_active_conversation && resolved.target_user_id) {
        // Find most recent conversation for the target user
        const { data: convos } = await supabase
          .from('agent_chat_conversations')
          .select('id')
          .eq('user_id', resolved.target_user_id)
          .order('last_message_at', { ascending: false })
          .limit(1);
        conversationId = convos?.[0]?.id || '';
      }
      // If still no conversation, create one rather than failing the entire flow
      if (!conversationId && resolved.target_user_id) {
        const { data: newConvo, error: convoErr } = await supabase
          .from('agent_chat_conversations')
          .insert({
            user_id: resolved.target_user_id,
            // column is `agent_id` (text), not `agent_type` — the wrong name made this
            // insert fail, and since the block then throws, the very fallback written to
            // stop a missing conversation from killing the flow was itself killing it.
            agent_id: resolved.agent_type || 'kai',
            title: 'Flow-initiated conversation',
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (convoErr) throw new Error(`Failed to create conversation: ${convoErr.message}`);
        conversationId = newConvo.id;
      }
      if (!conversationId) throw new Error('No conversation found and no target_user_id provided to create one');

      // Insert message
      const { error: msgError } = await supabase.from('agent_chat_messages').insert({
        conversation_id: conversationId,
        role: resolved.role || 'user',
        content: resolved.message,
        metadata: { source: 'flow_engine', flow_injected: true },
      });
      if (msgError) throw new Error(`Agent message failed: ${msgError.message}`);

      // Update conversation timestamp
      await supabase
        .from('agent_chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return { output: { sent: true, conversation_id: conversationId } };
    }

    case 'create_moodboard': {
      const { data, error } = await supabase.from('moodboards').insert({
        user_id: resolved.user_id,
        title: resolved.title || 'Untitled Moodboard',
        description: resolved.description || '',
        is_public: resolved.is_public ?? false,
      }).select().single();
      if (error) throw new Error(`Create moodboard failed: ${error.message}`);
      return { output: { moodboard_id: data.id, created: true } };
    }

    case 'add_to_moodboard': {
      // Calculate next position
      const { data: existing } = await supabase
        .from('moodboard_items')
        .select('position')
        .eq('moodboard_id', resolved.moodboard_id)
        .order('position', { ascending: false })
        .limit(1);
      const nextPosition = (existing?.[0]?.position ?? -1) + 1;

      const { error } = await supabase.from('moodboard_items').insert({
        moodboard_id: resolved.moodboard_id,
        // moodboard_items keys products as `material_id`, not `product_id` — the wrong
        // name made every add_to_moodboard node throw and take the rest of the flow
        // run down with it.
        material_id: resolved.product_id,
        notes: resolved.notes || '',
        position: nextPosition,
      });
      if (error) throw new Error(`Add to moodboard failed: ${error.message}`);
      return { output: { added: true, position: nextPosition } };
    }

    case 'web_search':
    case 'perplexity_search': {
      const country = String(resolved.country || '');
      const regionId = String(resolved.region || '');
      const category = String(resolved.category || '');
      const limit = Number(resolved.limit) || 30;

      if (!category) throw new Error('Category is required');

      // Meter tenant flows only (operator/global flows resolve to null → stay free). Debit BEFORE
      // the Anthropic web_search call (invariant #10); refunded below if the call fails.
      // `scope` here is the outer FlowScope —
      // the geo string is `geoScope` to avoid shadowing it.
      const webSearchDebit = resolveFlowDebit(userId, scope);
      if (webSearchDebit) {
        const { data: wsDbt } = await supabase.rpc('debit_credits', {
          p_user_id: webSearchDebit.userId,
          p_amount: FLOW_WEB_SEARCH_COST,
          p_operation_type: 'flow_web_search',
          p_description: `Flow web search (${category})`,
          p_metadata: { category, country, region: regionId, limit },
          p_workspace_id: webSearchDebit.workspaceId,
        });
        const wsRow = Array.isArray(wsDbt) ? wsDbt[0] : wsDbt;
        if (wsRow && wsRow.success === false) {
          throw new Error(wsRow.error_message || 'Insufficient credits for web search');
        }
      }

      // Same derivation b2b-tools uses. This copy had drifted twice over: it emitted the raw
      // region KEY (`in the cee region`, meaningless to a web search) and, with nothing set, the
      // vague `across Europe and major global manufacturing hubs` instead of the platform's 30
      // named markets — so an identical request answered differently depending on which caller
      // ran it (issue #370, Class A).
      const geoScope = buildMarketScope(
        await loadVocabulary(supabase, 'sourcing_markets'),
        { country, region: regionId },
      );

      // Same row b2b-tools reads. This copy had drifted from it (#347 phase 3P).
      const query = renderPromptTemplate(
        await loadPrompt(supabase, 'tool', 'b2b_manufacturer_query'),
        { category, scope: geoScope, limit },
      );
      const systemPrompt = await getToolPrompt(supabase, 'b2b_manufacturer_search');

      let textContent = '';
      try {
        const searchRes = await withRetry(async () => {
          // Through the shared client — this was the highest-volume of the calls that reached
          // no cost ledger at all, and it runs inside automations nobody is watching live. The
          // key also came off Deno.env, which the platform_secrets bootstrap cannot populate on
          // edge, so a DB-only key failed every flow that used this action.
          const data = await callClaudeMessages({
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            system: systemPrompt,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
            messages: [{ role: 'user', content: query }],
          }, {
            task: 'flow_web_search',
            userId: webSearchDebit?.userId,
            workspaceId: webSearchDebit?.workspaceId ?? null,
            headers: { 'anthropic-beta': 'web-search-2025-03-05' },
          });
          const text = (data.content as any[])
            ?.filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('\n') || '';
          return { textContent: text };
        });
        textContent = searchRes.textContent;
      } catch (err) {
        // Refund the tenant flow's debit — the search produced nothing.
        if (webSearchDebit) {
          await supabase.rpc('refund_credits', {
            p_user_id: webSearchDebit.userId,
            p_amount: FLOW_WEB_SEARCH_COST,
            p_operation_type: 'flow_web_search_refund',
            p_description: 'Refund: flow web search failed',
            p_metadata: { category, error: String(err) },
            p_workspace_id: webSearchDebit.workspaceId,
          }).then(() => {}, () => {});
        }
        throw err;
      }

      return {
        output: {
          success: !!textContent,
          search_results: textContent || 'No results found.',
          query: { country, category, limit },
          source: 'claude_web_search',
        },
      };
    }

    case 'firecrawl_scrape': {
      const FIRECRAWL_API_KEY = () => Deno.env.get('FIRECRAWL_API_KEY') || '';
      if (!FIRECRAWL_API_KEY()) throw new Error('FIRECRAWL_API_KEY not configured');

      const url = String(resolved.url || '');
      if (!url) throw new Error('URL is required');
      // Fail-closed affordability gate: block a 0-credit tenant flow owner before the scrape.
      { const g = await assertFlowCanAfford(supabase, userId, scope, 'firecrawl-scrape'); if (g) throw new Error(g); }

      const { markdown, metadata } = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Firecrawl API error ${response.status}: ${errText}`);
          }
          const data = await response.json();
          return { markdown: data.data?.markdown || '', metadata: data.data?.metadata || {} };
        } finally {
          clearTimeout(timer);
        }
      });

      { const dt = resolveFlowDebit(userId, scope); if (dt) await debitExternalServiceCredits(supabase, dt.userId, 'firecrawl-scrape', 'flow_firecrawl_scrape', 1, { url }, dt.workspaceId); }

      return {
        output: {
          success: true,
          url,
          content: markdown.slice(0, 10000),
          title: metadata.title || '',
          description: metadata.description || '',
        },
      };
    }

    case 'apollo_enrich': {
      const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
      if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not configured');

      const companyName = String(resolved.company_name || '');
      if (!companyName) throw new Error('Company name is required');
      // Fail-closed affordability gate: block a 0-credit tenant flow owner before the enrichment.
      { const g = await assertFlowCanAfford(supabase, userId, scope, 'apollo-enrich'); if (g) throw new Error(g); }

      const body: Record<string, unknown> = {
        q_organization_name: companyName,
        page: 1,
        per_page: 5,
      };
      if (resolved.country) {
        body.organization_locations = [String(resolved.country)];
      }
      if (resolved.domain) {
        body.organization_domains = [String(resolved.domain)];
      }

      const apolloResult = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
            method: 'POST',
            headers: {
              'X-Api-Key': APOLLO_API_KEY,
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Apollo API error ${response.status}: ${errText}`);
          }
          return await response.json();
        } finally {
          clearTimeout(timer);
        }
      });

      const org = apolloResult.organizations?.[0] || apolloResult.accounts?.[0];
      { const dt = resolveFlowDebit(userId, scope); if (dt) await debitExternalServiceCredits(supabase, dt.userId, 'apollo-enrich', 'flow_apollo_enrich', 1, { company_name: companyName }, dt.workspaceId); }

      if (!org) {
        return { output: { success: true, found: false, company_name: companyName } };
      }

      return {
        output: {
          success: true,
          found: true,
          company: {
            name: org.name,
            domain: org.primary_domain || org.website_url,
            industry: org.industry,
            employee_count: org.estimated_num_employees,
            founded_year: org.founded_year,
            linkedin_url: org.linkedin_url,
            headquarters: { city: org.city, state: org.state, country: org.country },
            phone: org.phone,
            keywords: org.keywords || [],
            annual_revenue: org.annual_revenue_printed,
          },
        },
      };
    }

    case 'hunter_find_contacts': {
      const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
      if (!HUNTER_API_KEY) throw new Error('HUNTER_API_KEY not configured');

      const domain = String(resolved.domain || '');
      const companyName = String(resolved.company_name || '');
      const firstName = String(resolved.first_name || '');
      const lastName = String(resolved.last_name || '');

      if (!domain && !companyName) throw new Error('Domain or company name is required');
      // Fail-closed affordability gate: block a 0-credit tenant flow owner before the Hunter call
      // (email-finder + domain-search are priced the same, so one gate covers both branches).
      { const g = await assertFlowCanAfford(supabase, userId, scope, 'hunter-email-finder'); if (g) throw new Error(g); }

      // Person-specific search
      if (firstName || lastName) {
        const personData = await withRetry(async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          try {
            const params = new URLSearchParams({ api_key: HUNTER_API_KEY });
            if (domain) params.set('domain', domain);
            if (companyName) params.set('company', companyName);
            if (firstName) params.set('first_name', firstName);
            if (lastName) params.set('last_name', lastName);
            const response = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, { signal: controller.signal });
            return await response.json();
          } finally {
            clearTimeout(timer);
          }
        });

        { const dt = resolveFlowDebit(userId, scope); if (dt) await debitExternalServiceCredits(supabase, dt.userId, 'hunter-email-finder', 'flow_hunter_find_contacts', 1, { domain, person: `${firstName} ${lastName}`.trim() }, dt.workspaceId); }

        return {
          output: {
            success: true,
            mode: 'person',
            email: personData.data?.email || null,
            score: personData.data?.score || 0,
            position: personData.data?.position || '',
          },
        };
      }

      // Domain-wide search
      // Gated like every other paid branch. The person-search branch above has carried this check
      // since it was added; this one was missed, so a tenant flow with no credits still ran the
      // Hunter domain query on our account and only discovered it could not bill for it after the
      // fact. Same shape, same action, one branch apart. (audit #312)
      { const g = await assertFlowCanAfford(supabase, userId, scope, 'hunter-domain-search'); if (g) throw new Error(g); }

      const domainData = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const params = new URLSearchParams({ api_key: HUNTER_API_KEY, domain: domain || companyName, limit: '10' });
          const response = await fetch(`https://api.hunter.io/v2/domain-search?${params}`, { signal: controller.signal });
          return await response.json();
        } finally {
          clearTimeout(timer);
        }
      });

      const emails = (domainData.data?.emails || []).map((e: Record<string, unknown>) => ({
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        email: e.value,
        position: e.position,
        department: e.department,
        confidence: e.confidence,
      }));

      const rolesStr = String(resolved.roles || '');
      if (rolesStr && emails.length > 0) {
        const priorityRoles = rolesStr.split(',').map((r: string) => r.trim().toLowerCase());
        emails.sort((a: { position?: string }, b: { position?: string }) => {
          const aIdx = priorityRoles.findIndex((r: string) => (a.position || '').toLowerCase().includes(r));
          const bIdx = priorityRoles.findIndex((r: string) => (b.position || '').toLowerCase().includes(r));
          return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
        });
      }

      { const dt = resolveFlowDebit(userId, scope); if (dt) await debitExternalServiceCredits(supabase, dt.userId, 'hunter-domain-search', 'flow_hunter_find_contacts', 1, { domain }, dt.workspaceId); }

      return {
        output: {
          success: true,
          mode: 'domain',
          organization: domainData.data?.organization || '',
          pattern: domainData.data?.pattern || '',
          contacts: emails,
          total: emails.length,
        },
      };
    }

    case 'zerobounce_validate': {
      const ZEROBOUNCE_API_KEY = Deno.env.get('ZEROBOUNCE_API_KEY');
      if (!ZEROBOUNCE_API_KEY) throw new Error('ZEROBOUNCE_API_KEY not configured');

      const email = String(resolved.email || '');
      if (!email) throw new Error('Email is required');
      // Fail-closed affordability gate: block a 0-credit tenant flow owner before the validation.
      { const g = await assertFlowCanAfford(supabase, userId, scope, 'zerobounce-validate'); if (g) throw new Error(g); }

      const zbData = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const params = new URLSearchParams({ api_key: ZEROBOUNCE_API_KEY, email });
          const response = await fetch(`https://api.zerobounce.net/v2/validate?${params}`, { signal: controller.signal });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`ZeroBounce API error ${response.status}: ${errText}`);
          }
          return await response.json();
        } finally {
          clearTimeout(timer);
        }
      });

      { const dt = resolveFlowDebit(userId, scope); if (dt) await debitExternalServiceCredits(supabase, dt.userId, 'zerobounce-validate', 'flow_zerobounce_validate', 1, { email }, dt.workspaceId); }

      return {
        output: {
          success: true,
          email,
          status: zbData.status || 'unknown',
          sub_status: zbData.sub_status || '',
          valid: zbData.status === 'valid',
          free_email: zbData.free_email === 'true' || zbData.free_email === true,
          mx_found: zbData.mx_found === 'true' || zbData.mx_found === true,
          firstname: zbData.firstname || '',
          lastname: zbData.lastname || '',
        },
      };
    }

    case 'send_push': {
      // Resolve the target user's active web-push subscriptions, then dispatch
      // through the notification-dispatcher (which holds the VAPID keys).
      const pushUserId = String(resolved.user_id || '');
      if (!pushUserId) throw new Error('send_push requires user_id');

      const { data: subs, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh_key, auth_key')
        .eq('user_id', pushUserId)
        .eq('is_active', true);
      if (subErr) throw new Error(`Push subscription lookup failed: ${subErr.message}`);
      if (!subs || subs.length === 0) {
        return { output: { sent: false, reason: 'no_active_subscriptions' } };
      }

      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          action: 'send-push',
          subscriptions: subs,
          notification: {
            title: resolved.title,
            body: resolved.body,
            icon: resolved.icon || undefined,
            badge: resolved.badge || undefined,
            data: resolved.data || { action_url: resolved.action_url || null },
          },
        },
      });
      if (error) throw new Error(`Push failed: ${error.message}`);
      return { output: { sent: true, ...(data || {}) } };
    }

    case 'log_event': {
      // Generic audit / dedup-marker insert. Lets a flow write a row (e.g. a
      // "reminder already sent" marker) so a later `if_else` + `stop` can
      // de-duplicate recurring scheduled flows.
      // config: { table: string, row: string(JSON) | object }
      const table = String(resolved.table || '');
      if (!table) throw new Error('log_event requires a table name');
      let row: Record<string, unknown> = {};
      if (typeof resolved.row === 'string' && resolved.row.trim()) {
        try {
          row = JSON.parse(resolved.row);
        } catch {
          throw new Error('log_event: row is not valid JSON');
        }
      } else if (resolved.row && typeof resolved.row === 'object') {
        row = resolved.row as Record<string, unknown>;
      }
      const { error } = await supabase.from(table).insert(row);
      if (error) throw new Error(`log_event insert failed: ${error.message}`);
      return { output: { logged: true, table } };
    }

    case 'run_edge_function': {
      // Invoke another edge function from a flow (e.g. catalog-send-to-customers,
      // finance-send-statement) without reimplementing it in the graph.
      // config: { function_name: string, payload: string(JSON) | object }
      const fnName = String(resolved.function_name || '');
      if (!fnName) throw new Error('run_edge_function requires function_name');
      let payload: Record<string, unknown> = {};
      if (typeof resolved.payload === 'string' && resolved.payload.trim()) {
        try {
          payload = JSON.parse(resolved.payload);
        } catch {
          throw new Error('run_edge_function: payload is not valid JSON');
        }
      } else if (resolved.payload && typeof resolved.payload === 'object') {
        payload = resolved.payload as Record<string, unknown>;
      }
      const { data, error } = await supabase.functions.invoke(fnName, { body: payload });
      if (error) throw new Error(`run_edge_function(${fnName}) failed: ${error.message}`);
      return { output: { invoked: true, function_name: fnName, result: data ?? null } };
    }

    // ── CRM / commerce mutations. Operator/global-flow only (NOT in the tenant action allowlist).
    // Run under the service role; every write is scoped to scope.workspaceId for a tenant flow, and
    // operates on the entity in its own workspace for a global/operator flow. Unsupported entity
    // types return an explicit skip reason (honest no-op), never a silent one. ──
    case 'approve_quote': {
      const quoteId = String(resolved.quote_id ?? '');
      if (!quoteId) return { output: { skipped: true, reason: 'no_quote_id' } };
      let q = supabase.from('quotes')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', quoteId);
      if (scope?.workspaceId) q = q.eq('workspace_id', scope.workspaceId);
      const { data, error } = await q.select('id').maybeSingle();
      if (error) throw new Error(`approve_quote failed: ${error.message}`);
      return { output: { approved: !!data, quote_id: quoteId } };
    }

    case 'assign_user': {
      const kind = String(resolved.entity_type ?? 'contact');
      const id = String(resolved.entity_id ?? '');
      const assignee = String(resolved.assign_to ?? '');
      if (!id || !assignee) return { output: { skipped: true, reason: 'missing_entity_or_assignee' } };
      // contact → responsible_sales_user_ids (the CRM ownership model); quote → user_id.
      const target = kind === 'contact' ? { table: 'crm_contacts', patch: { responsible_sales_user_ids: [assignee] } }
        : kind === 'quote' ? { table: 'quotes', patch: { user_id: assignee } }
        : null;
      if (!target) return { output: { skipped: true, reason: `assign_user does not support entity_type '${kind}'` } };
      let u = supabase.from(target.table).update(target.patch).eq('id', id);
      if (scope?.workspaceId) u = u.eq('workspace_id', scope.workspaceId);
      const { data, error } = await u.select('id').maybeSingle();
      if (error) throw new Error(`assign_user failed: ${error.message}`);
      return { output: { assigned: !!data, entity_type: kind, entity_id: id, assigned_to: assignee } };
    }

    case 'add_tag': {
      const kind = String(resolved.entity_type ?? 'contact');
      const id = String(resolved.entity_id ?? '');
      const tag = String(resolved.tag ?? '').trim();
      if (!id || !tag) return { output: { skipped: true, reason: 'missing_entity_or_tag' } };
      if (kind !== 'contact') return { output: { skipped: true, reason: `add_tag supports contacts only (got '${kind}')` } };
      let sel = supabase.from('crm_contacts').select('id, tags').eq('id', id);
      if (scope?.workspaceId) sel = sel.eq('workspace_id', scope.workspaceId);
      const { data: c } = await sel.maybeSingle();
      if (!c) return { output: { skipped: true, reason: 'contact not found' } };
      const tags: string[] = Array.isArray((c as Record<string, unknown>).tags) ? (c as Record<string, string[]>).tags : [];
      if (tags.includes(tag)) return { output: { added: false, reason: 'already_tagged', tag } };
      const { error } = await supabase.from('crm_contacts').update({ tags: [...tags, tag] }).eq('id', id);
      if (error) throw new Error(`add_tag failed: ${error.message}`);
      return { output: { added: true, tag, entity_id: id } };
    }

    case 'add_note': {
      const kind = String(resolved.entity_type ?? 'contact');
      const id = String(resolved.entity_id ?? '');
      const note = String(resolved.note ?? '').trim();
      if (!id || !note) return { output: { skipped: true, reason: 'missing_entity_or_note' } };
      // crm_notes.target_kind is 'contact' | 'company' by convention.
      if (kind !== 'contact' && kind !== 'company') return { output: { skipped: true, reason: `add_note supports contact/company (got '${kind}')` } };
      const table = kind === 'contact' ? 'crm_contacts' : 'crm_companies';
      let sel = supabase.from(table).select('id, workspace_id').eq('id', id);
      if (scope?.workspaceId) sel = sel.eq('workspace_id', scope.workspaceId);
      const { data: ent } = await sel.maybeSingle();
      if (!ent) return { output: { skipped: true, reason: `${kind} not found` } };
      const { error } = await supabase.from('crm_notes').insert({
        target_kind: kind, target_id: id, body: note,
        workspace_id: (ent as Record<string, unknown>).workspace_id, created_by: userId ?? null,
      });
      if (error) throw new Error(`add_note failed: ${error.message}`);
      return { output: { added: true, entity_type: kind, entity_id: id } };
    }

    case 'update_contact': {
      const id = String(resolved.contact_id ?? '');
      const fields = (resolved.fields && typeof resolved.fields === 'object') ? resolved.fields as Record<string, unknown> : {};
      if (!id) return { output: { skipped: true, reason: 'no_contact_id' } };
      const patch: Record<string, unknown> = {};
      for (const k of CONTACT_UPDATABLE) if (k in fields) patch[k] = fields[k];
      if (!Object.keys(patch).length) return { output: { skipped: true, reason: 'no allowed fields to update' } };
      let u = supabase.from('crm_contacts').update(patch).eq('id', id);
      if (scope?.workspaceId) u = u.eq('workspace_id', scope.workspaceId);
      const { data, error } = await u.select('id').maybeSingle();
      if (error) throw new Error(`update_contact failed: ${error.message}`);
      return { output: { updated: !!data, fields: Object.keys(patch) } };
    }

    case 'update_product': {
      const id = String(resolved.product_id ?? '');
      const fields = (resolved.fields && typeof resolved.fields === 'object') ? resolved.fields as Record<string, unknown> : {};
      if (!id) return { output: { skipped: true, reason: 'no_product_id' } };
      const patch: Record<string, unknown> = {};
      for (const k of PRODUCT_UPDATABLE) if (k in fields) patch[k] = fields[k];
      if (!Object.keys(patch).length) return { output: { skipped: true, reason: 'no allowed fields to update' } };
      let u = supabase.from('products').update(patch).eq('id', id);
      if (scope?.workspaceId) u = u.eq('workspace_id', scope.workspaceId);
      const { data, error } = await u.select('id').maybeSingle();
      if (error) throw new Error(`update_product failed: ${error.message}`);
      return { output: { updated: !!data, fields: Object.keys(patch) } };
    }

    /**
     * Put work on somebody's list (#378 Phase 4).
     *
     * The first action that creates a business record outside quotes and moodboards. Until this
     * existed the action vocabulary was communication and enrichment only, so every automation —
     * however good its trigger — ended the same way: a human is told, and the human does the work.
     * `run_edge_function` and `http_request` were the escape hatches, which meant the automation
     * that DID exist was code, and invisible to the admin who is supposed to own it in Flows.
     *
     * A task deliberately, and not an invoice. Money-moving and legally-numbered documents produce
     * a PREFILL and never a finished record — an invoice conjured behind the operator skips
     * numbering, buyer-risk and myDATA classification. A task is the safe end of that spectrum:
     * reversible, owned by a person, and worthless to forge.
     *
     * The project is looked up scoped to the flow's workspace BEFORE the insert. flow-engine runs
     * with the service role, so RLS is not the boundary here — this check is (invariant 1). A flow
     * whose config names a project in another tenant writes nothing and says why.
     */
    case 'create_task': {
      const projectId = String(resolved.project_id ?? '');
      const title = String(resolved.title ?? '').trim();
      if (!projectId || projectId.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_project_id' } };
      }
      if (!title || title.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_title' } };
      }

      let sel = supabase.from('projects').select('id, workspace_id').eq('id', projectId);
      if (scope?.workspaceId) sel = sel.eq('workspace_id', scope.workspaceId);
      const { data: proj } = await sel.maybeSingle();
      if (!proj) return { output: { skipped: true, reason: 'project not found in this workspace' } };

      // `client_visible` puts the task on the customer's view of the job. Default internal: a flow
      // that silently starts showing work to the client is the wrong direction to be wrong in.
      const visibility = resolved.visibility === 'client_visible' ? 'client_visible' : 'internal';
      // Only ever a plain date the operator (or the trigger payload) supplied. Nothing here
      // derives "today" — the DB session runs in UTC and would file it to yesterday for a Greek
      // workspace between local midnight and 02:00-03:00.
      const dueDate = typeof resolved.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(resolved.due_date)
        ? resolved.due_date
        : null;
      const assignee = typeof resolved.assignee_id === 'string' && !resolved.assignee_id.includes('{{')
        ? resolved.assignee_id
        : null;

      const { data, error } = await supabase.from('project_tasks').insert({
        project_id: projectId,
        title,
        description: typeof resolved.description === 'string' ? resolved.description : null,
        status: 'todo',
        visibility,
        due_date: dueDate,
        assignee_id: assignee,
        created_by: userId ?? null,
      }).select('id').maybeSingle();
      if (error) throw new Error(`create_task failed: ${error.message}`);
      return { output: { created: true, task_id: (data as { id?: string } | null)?.id ?? null, project_id: projectId } };
    }

    /**
     * Move a deal along the pipeline (#378 Phase 4).
     *
     * "Quote accepted -> Won", "invoice paid -> Closed" — the moves a salesperson makes by hand
     * after something that already fired an event. No money, fully reversible, and the DB refuses
     * an illegal destination on its own: stages are per deal TYPE, enforced by a composite FK on
     * (deal_type_id, stage), so a construction deal physically cannot be moved into
     * "Conveyancing". That rule lives in the schema rather than in this caller's good intentions.
     *
     * Scoped to the flow's workspace before the write, for the same reason create_task is:
     * flow-engine holds the service role, so RLS is not the boundary here.
     */
    case 'advance_deal_stage': {
      const dealId = String(resolved.deal_id ?? '');
      const stage = String(resolved.stage ?? '').trim();
      if (!dealId || dealId.includes('{{')) return { output: { skipped: true, reason: 'unresolved_deal_id' } };
      if (!stage || stage.includes('{{')) return { output: { skipped: true, reason: 'unresolved_stage' } };

      let sel = supabase.from('crm_deals').select('id, stage, deal_type_id').eq('id', dealId);
      if (scope?.workspaceId) sel = sel.eq('workspace_id', scope.workspaceId);
      const { data: deal } = await sel.maybeSingle();
      if (!deal) return { output: { skipped: true, reason: 'deal not found in this workspace' } };

      const from = (deal as { stage?: string }).stage ?? null;
      // Already there: report it rather than writing, so a flow that fires twice does not look
      // like it moved the deal twice in the run log.
      if (from === stage) return { output: { skipped: true, reason: 'already_in_stage', stage } };

      let u = supabase.from('crm_deals').update({ stage }).eq('id', dealId);
      if (scope?.workspaceId) u = u.eq('workspace_id', scope.workspaceId);
      const { data, error } = await u.select('id').maybeSingle();
      // The composite FK refuses a stage that does not belong to this deal's type. Surfaced, not
      // swallowed: a flow silently failing to move a deal is worse than one that reports why.
      if (error) throw new Error(`advance_deal_stage failed: ${error.message}`);
      return { output: { moved: !!data, deal_id: dealId, from, to: stage } };
    }

    /**
     * Schedule money that is expected to move (#378 Phase 4).
     *
     * Allowed under the prefill rule where create_expense and raise_purchase_order are not, and the
     * distinction is not a technicality: a planned payment MOVES NO MONEY. It is an entry in the
     * cash-flow forecast, and `planned_payments.paid_payment_id` is what links it to the real
     * payment if and when one happens. Nothing is numbered, nothing is transmitted to AADE, and
     * deleting one costs nothing. An invoice or a supplier bill conjured behind the operator is a
     * different animal entirely — those stay prefills.
     *
     * "Invoice issued -> schedule the chase" and "bill received -> schedule the payment" are the
     * two this exists for, which is why the settlement target is accepted and verified.
     */
    case 'create_planned_payment': {
      const title = String(resolved.title ?? '').trim();
      const amount = Number(resolved.amount);
      const direction = resolved.direction === 'out' ? 'out' : resolved.direction === 'in' ? 'in' : null;
      const scheduledFor = typeof resolved.scheduled_for === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(resolved.scheduled_for)
        ? resolved.scheduled_for : null;

      if (!scope?.workspaceId) return { output: { skipped: true, reason: 'no_workspace_scope' } };
      if (!title || title.includes('{{')) return { output: { skipped: true, reason: 'unresolved_title' } };
      if (!Number.isFinite(amount) || amount <= 0) return { output: { skipped: true, reason: 'amount must be a positive number' } };
      if (!direction) return { output: { skipped: true, reason: "direction must be 'in' or 'out'" } };
      // No fallback to "today": the DB session runs in UTC, so a derived date files a Greek
      // workspace's payment to yesterday. A schedule with no date is not a schedule.
      if (!scheduledFor) return { output: { skipped: true, reason: 'scheduled_for must be a YYYY-MM-DD date' } };

      // A settlement target is optional, but if one is named it must belong to this workspace —
      // flow-engine holds the service role, so nothing else checks that.
      const invoiceId = typeof resolved.invoice_id === 'string' && !resolved.invoice_id.includes('{{')
        ? resolved.invoice_id : null;
      const billId = typeof resolved.supplier_bill_id === 'string' && !resolved.supplier_bill_id.includes('{{')
        ? resolved.supplier_bill_id : null;
      for (const [table, id] of [['invoices', invoiceId], ['supplier_bills', billId]] as const) {
        if (!id) continue;
        const { data: found } = await supabase.from(table).select('id')
          .eq('id', id).eq('workspace_id', scope.workspaceId).maybeSingle();
        if (!found) return { output: { skipped: true, reason: `${table} not found in this workspace` } };
      }

      const { data, error } = await supabase.from('planned_payments').insert({
        workspace_id: scope.workspaceId,
        title,
        amount,
        direction,
        scheduled_for: scheduledFor,
        currency: typeof resolved.currency === 'string' && resolved.currency ? resolved.currency : 'EUR',
        notes: typeof resolved.notes === 'string' ? resolved.notes : null,
        invoice_id: invoiceId,
        supplier_bill_id: billId,
        created_by: userId ?? null,
      }).select('id').maybeSingle();
      if (error) throw new Error(`create_planned_payment failed: ${error.message}`);
      return { output: { created: true, planned_payment_id: (data as { id?: string } | null)?.id ?? null, direction, amount } };
    }

    /**
     * Attach a document to the job or the deal it belongs to (#378 Phase 4).
     *
     * Creates nothing and moves nothing: it writes one foreign key that already exists on the
     * document. The partner to the link work in #378 — "quote accepted -> attach it to the deal",
     * "invoice issued -> file it under the job".
     *
     * The project half is usually unnecessary, and that is deliberate: since Phase 1 the SQL chain
     * functions carry `project_id` down from the parent themselves, so a flow should not be
     * re-doing what `generate_invoice_from_order` already did. This exists for the links nothing
     * derives — chiefly the DEAL, which no chain function knows about.
     *
     * BOTH ends are checked against the flow's workspace. flow-engine holds the service role, so a
     * config naming another tenant's deal would otherwise attach this document to it.
     */
    case 'link_document': {
      const docKind = String(resolved.document_kind ?? '');
      const docId = String(resolved.document_id ?? '');
      const targetKind = String(resolved.target_kind ?? '');
      const targetId = String(resolved.target_id ?? '');

      if (!scope?.workspaceId) return { output: { skipped: true, reason: 'no_workspace_scope' } };
      if (!docId || docId.includes('{{')) return { output: { skipped: true, reason: 'unresolved_document_id' } };

      const DOC_TABLES: Record<string, string> = {
        invoice: 'invoices', order: 'orders', quote: 'quotes', expense: 'supplier_bills',
      };
      const docTable = DOC_TABLES[docKind];
      if (!docTable) return { output: { skipped: true, reason: `link_document does not support document_kind '${docKind}'` } };

      // Which column the target writes, and which table proves it exists. `supplier_bills` has no
      // deal_id — a supplier's bill is a cost, not something a pipeline deal was won on — so that
      // combination is refused by name rather than silently writing nothing.
      const TARGETS: Record<string, { column: string; table: string }> = {
        project: { column: 'project_id', table: 'projects' },
        deal: { column: 'deal_id', table: 'crm_deals' },
      };
      const target = TARGETS[targetKind];
      if (!target) return { output: { skipped: true, reason: `link_document does not support target_kind '${targetKind}'` } };
      if (target.column === 'deal_id' && docTable === 'supplier_bills') {
        return { output: { skipped: true, reason: 'a supplier bill has no deal — it is a cost, not something a deal was won on' } };
      }

      // Clearing is legitimate: "deal lost -> detach the quote".
      const clearing = !targetId || targetId.includes('{{');
      if (!clearing) {
        const { data: found } = await supabase.from(target.table).select('id')
          .eq('id', targetId).eq('workspace_id', scope.workspaceId).maybeSingle();
        if (!found) return { output: { skipped: true, reason: `${targetKind} not found in this workspace` } };
      }

      const { data, error } = await supabase.from(docTable)
        .update({ [target.column]: clearing ? null : targetId })
        .eq('id', docId).eq('workspace_id', scope.workspaceId)
        .select('id').maybeSingle();
      if (error) throw new Error(`link_document failed: ${error.message}`);
      if (!data) return { output: { skipped: true, reason: `${docKind} not found in this workspace` } };
      return { output: { linked: !clearing, document_kind: docKind, target_kind: targetKind } };
    }

    default:
      return { output: { skipped: true, reason: `Unknown action type: ${actionType}` } };
  }
}

// =====================================================
// GRAPH WALKER (BFS)
// =====================================================

async function executeFlowGraph(
  supabase: DbClient,
  graph: FlowGraph,
  runId: string,
  triggerData: Record<string, unknown>,
  isTestRun: boolean,
  userId?: string,
  scope?: FlowScope,
): Promise<void> {
  const { nodes, edges } = graph;
  const context: ExecutionContext = { trigger: { data: triggerData } };

  // Find the trigger node
  const triggerNode = nodes.find((n) => n.type === 'triggerNode');
  if (!triggerNode) throw new Error('No trigger node found in flow');

  // BFS queue
  const queue: Array<{ nodeId: string; incomingBranch: string | null }> = [
    { nodeId: triggerNode.id, incomingBranch: null },
  ];
  const visited = new Set<string>();
  let executionOrder = 0;
  // A node failure must NOT abort independent (sibling) branches — e.g. a best-effort
  // send_email failure can't be allowed to block the reliable create_notification on a
  // parallel branch. We remember the first error, skip only the failed node's subtree,
  // finish the rest of the walk, then surface the error afterwards.
  let pendingError: (Error & { __runAlreadyFailed?: boolean }) | null = null;
  let pendingErrorNodeId: string | null = null;

  while (queue.length > 0) {
    const { nodeId } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const stepStartTime = Date.now();

    // Create step record
    const { data: step, error: stepError } = await supabase
      .from('flow_run_steps')
      .insert({
        flow_run_id: runId,
        node_id: node.id,
        node_type: node.data.category,
        node_label: node.data.label,
        node_config: node.data.config,
        status: 'running',
        input_data: node.type === 'triggerNode' ? triggerData : {},
        execution_order: executionOrder++,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (stepError) {
      console.error('Failed to create step:', stepError);
      continue;
    }

    try {
      let output: Record<string, unknown> = {};
      let branch: string | undefined;

      if (node.type === 'triggerNode') {
        // Keep BOTH shapes reachable from downstream templates. The run context
        // is initialised as { trigger: { data: triggerData } } (so seeded system
        // flows can template {{trigger.data.X}}), but storing this node's output
        // below (`context[nodeId] = output`) overwrites context.trigger. If we
        // only spread the fields flat here, {{trigger.data.X}} stops resolving and
        // every create_notification skips with "unresolved_user_id" — which had
        // silently broken hire_me / profile / moodboard notifications. Re-nest
        // `data` while also keeping the flat fields for any {{trigger.X}} usage.
        output = { ...triggerData, data: triggerData };
      } else if (node.type === 'conditionNode' && node.data.conditionType === 'loop') {
        // Fan-out: run the directly-connected downstream action node(s) once per
        // item in a collection. config: { collection_field: 'trigger.data.items',
        // item_variable: 'item', max_iterations: 100 }. Single-level body (direct
        // action children); each iteration exposes context[item_variable] +
        // context.loop_index, so an action can template {{item}} or {{item.field}}.
        const loopCfg = node.data.config as {
          collection_field?: string;
          item_variable?: string;
          max_iterations?: number;
        };
        const loopPath = String(loopCfg.collection_field || '').replace(/\{\{|\}\}/g, '').trim();
        const loopRaw = getNestedValue(context as unknown as Record<string, unknown>, loopPath);
        const hardCap = Math.min(Number(loopCfg.max_iterations) || 100, 1000);
        const loopItems = Array.isArray(loopRaw) ? loopRaw.slice(0, hardCap) : [];
        const itemVar = loopCfg.item_variable || 'item';
        const loopChildIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);

        for (let i = 0; i < loopItems.length; i++) {
          (context as Record<string, unknown>)[itemVar] = loopItems[i];
          (context as Record<string, unknown>).loop_index = i;
          for (const cid of loopChildIds) {
            const child = nodes.find((n) => n.id === cid);
            if (!child || child.type !== 'actionNode') continue;
            const iterStart = Date.now();
            const res = await executeAction(supabase, child, context, isTestRun, userId, scope);
            await supabase.from('flow_run_steps').insert({
              flow_run_id: runId,
              node_id: child.id,
              node_type: 'action',
              node_label: `${child.data.label} [#${i}]`,
              node_config: child.data.config,
              status: 'completed',
              output_data: res.output,
              execution_order: executionOrder++,
              started_at: new Date(iterStart).toISOString(),
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - iterStart,
            });
          }
        }
        delete (context as Record<string, unknown>)[itemVar];
        delete (context as Record<string, unknown>).loop_index;
        // Children ran inline — mark visited so the BFS doesn't re-run them.
        for (const cid of loopChildIds) visited.add(cid);
        output = { looped: true, item_count: loopItems.length };
      } else if (node.type === 'conditionNode') {
        const result = await executeCondition(node, context);
        output = result.output;
        branch = result.branch;

        // If filter says stop, mark as skipped and don't continue
        if (branch === '__stop__') {
          await supabase
            .from('flow_run_steps')
            .update({
              status: 'skipped',
              output_data: output,
              branch_taken: 'filtered_out',
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - stepStartTime,
            })
            .eq('id', step.id);
          continue;
        }
      } else if (node.type === 'actionNode') {
        const result = await executeAction(supabase, node, context, isTestRun, userId, scope);
        output = result.output;
      }

      // Store output in context
      context[nodeId] = output;

      // Update step as completed
      await supabase
        .from('flow_run_steps')
        .update({
          status: 'completed',
          output_data: output,
          branch_taken: branch || null,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - stepStartTime,
        })
        .eq('id', step.id);

      // Determine next nodes
      if (node.type === 'conditionNode' && branch) {
        // For conditions, only follow the taken branch
        const branchEdges = edges.filter(
          (e) => e.source === nodeId && e.sourceHandle === branch,
        );
        for (const edge of branchEdges) {
          queue.push({ nodeId: edge.target, incomingBranch: branch });
        }
      } else {
        // For triggers/actions, follow all outgoing edges
        const outEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outEdges) {
          queue.push({ nodeId: edge.target, incomingBranch: null });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update step as failed
      await supabase
        .from('flow_run_steps')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - stepStartTime,
        })
        .eq('id', step.id);

      // Record the first failure but KEEP DRAINING the queue so sibling branches still run.
      // Crucially we do NOT enqueue this node's downstream edges here, so the failed node's
      // subtree is skipped while parallel branches (already queued) execute.
      if (!pendingError) {
        pendingError = (error instanceof Error ? error : new Error(errorMessage)) as Error & {
          __runAlreadyFailed?: boolean;
        };
        pendingErrorNodeId = nodeId;
      }
    }
  }

  // A node failed mid-walk: every independent branch has now run (so the bell still went
  // out even if the email branch failed). Record the run as failed — single authoritative
  // write, then surface the error so the outer handler skips its own write.
  if (pendingError) {
    await supabase
      .from('flow_runs')
      .update({
        status: 'failed',
        error_message: pendingError.message,
        error_node_id: pendingErrorNodeId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);
    pendingError.__runAlreadyFailed = true;
    throw pendingError;
  }
}

// =====================================================
// REQUEST HANDLERS
// =====================================================

// Max runs/minute for one flow before we treat it as a runaway loop and refuse (backstop only —
// a legit high-volume flow should stay far below this).
const MAX_FLOW_RUNS_PER_MINUTE = 120;

async function handleExecuteFlow(
  supabase: DbClient,
  body: { flow_id: string; trigger_data?: Record<string, unknown> },
  isTestRun: boolean,
  initiatedBy: string,
  access?: { trusted: boolean; callerUserId: string | null },
  /** Channels the EVENT's workspace muted on this flow (trigger-event dispatch only — a manual
   *  admin Run has no tenant context and is never muted). */
  mutedActions?: string[],
): Promise<Response> {
  const { flow_id, trigger_data = {} } = body;

  // Load the flow
  const { data: flow, error: flowError } = await supabase
    .from('flows')
    .select('*')
    .eq('id', flow_id)
    .single();

  if (flowError || !flow) {
    return jsonResponse({ success: false, error: 'Flow not found' }, 404);
  }

  // SECURITY (BOLA): the direct execute-flow / test-flow entrypoints run under the service role,
  // so without this check any authenticated user could run ANOTHER tenant's flow by id — billing their
  // credit pool and sending mail/WhatsApp from their BYOK sender. A caller may run a workspace flow
  // only if they belong to that workspace; a global/operator flow only if they are a platform admin
  // (so the admin builder's Run/Test still works). Internal trigger-event dispatch passes no `access`
  // (it already scoped the match), so it is unaffected.
  if (access && !access.trusted) {
    const globalFlow = flow.is_global === true || !flow.workspace_id;
    const denied = !access.callerUserId
      || (globalFlow
        ? !(await isPlatformAdmin(supabase, access.callerUserId))
        : !(await userCanAccessWorkspace(supabase, access.callerUserId, flow.workspace_id as string)));
    if (denied) return jsonResponse({ success: false, error: 'Flow not found' }, 404);
  }

  if (!isTestRun && flow.status !== 'active' && flow.status !== 'draft') {
    return jsonResponse({
      success: false,
      error: `Flow is ${flow.status} and cannot be executed`,
    }, 400);
  }

  const graph = flow.graph_definition as FlowGraph;
  if (!graph.nodes || graph.nodes.length === 0) {
    return jsonResponse({ success: false, error: 'Flow has no nodes' }, 400);
  }

  // Runaway-loop backstop: flows can re-trigger OUT of process (an action mutates a row → a DB trigger
  // emits a new event → this flow matches again), so an in-graph depth counter can't see the chain.
  // Instead cap how often a single flow may run — a tight self-retrigger loop blows past this in
  // seconds, while a normal high-volume flow stays well under it. Complements the per-loop-node cap.
  if (!isTestRun) {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recentRuns } = await supabase
      .from('flow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('flow_id', flow_id)
      .gte('started_at', since);
    if ((recentRuns ?? 0) >= MAX_FLOW_RUNS_PER_MINUTE) {
      console.warn(`[flow-engine] flow ${flow_id} exceeded ${MAX_FLOW_RUNS_PER_MINUTE} runs/min — suspected loop, refusing`);
      return jsonResponse({ success: false, error: 'run_rate_exceeded', data: { flow_id } }, 429);
    }
  }

  const runStartTime = Date.now();

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('flow_runs')
    .insert({
      flow_id,
      flow_version: flow.version,
      status: 'running',
      trigger_type: flow.trigger_type,
      trigger_event_data: trigger_data,
      initiated_by: initiatedBy,
      is_test_run: isTestRun,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) {
    return jsonResponse({ success: false, error: `Failed to create run: ${runError.message}` }, 500);
  }

  // The flow's own scope drives BYOK sender resolution AND per-run credit metering.
  const scope: FlowScope = {
    workspaceId: (flow.workspace_id as string | null) ?? null,
    isGlobal: flow.is_global === true,
    ownerUserId: (flow.created_by as string | null) ?? null,
    mutedActions: mutedActions && mutedActions.length ? new Set(mutedActions) : undefined,
  };

  // Every TENANT flow RUN costs a base fee billed to the workspace credit pool
  // (operator/global flows and test runs are free). Debit BEFORE running (invariant #10):
  // if the workspace pool can't cover it, don't do the work — mark the run failed.
  const isTenantRun = !isTestRun && !!scope.workspaceId && !scope.isGlobal;
  if (isTenantRun && scope.ownerUserId) {
    try {
      const { data: debitRes } = await supabase.rpc('debit_credits', {
        p_user_id: scope.ownerUserId,
        p_amount: FLOW_RUN_BASE_CREDITS,
        p_operation_type: 'flow_run',
        p_description: `Automation "${flow.name}" run`,
        p_metadata: { flow_id, run_id: run.id, trigger_type: flow.trigger_type },
        p_workspace_id: scope.workspaceId,
      });
      const debit = Array.isArray(debitRes) ? debitRes[0] : debitRes;
      if (!debit?.success) {
        await supabase.from('flow_runs').update({
          status: 'failed',
          error_message: `insufficient_credits: ${debit?.error_message || 'workspace credit pool exhausted'}`,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStartTime,
        }).eq('id', run.id);
        return jsonResponse({ success: false, error: 'insufficient_credits', data: { run_id: run.id } }, 402);
      }
    } catch (e) {
      // A debit RPC failure is fail-closed for a paid run: don't perform the work uncharged.
      await supabase.from('flow_runs').update({
        status: 'failed',
        error_message: `credit_debit_error: ${(e as Error).message}`,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - runStartTime,
      }).eq('id', run.id);
      return jsonResponse({ success: false, error: 'credit_debit_error', data: { run_id: run.id } }, 402);
    }
  }

  try {
    // Execute the graph
    await executeFlowGraph(supabase, graph, run.id, trigger_data, isTestRun, initiatedBy, scope);

    // Update run as completed
    const durationMs = Date.now() - runStartTime;
    await supabase
      .from('flow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', run.id);

    // Atomic increment — avoids race condition when concurrent runs update run_count
    await supabase.rpc('increment_flow_run_stats', { p_flow_id: flow_id });

    // Return the run with steps
    const { data: steps } = await supabase
      .from('flow_run_steps')
      .select('*')
      .eq('flow_run_id', run.id)
      .order('execution_order', { ascending: true });

    return jsonResponse({
      success: true,
      data: {
        ...run,
        status: 'completed',
        duration_ms: durationMs,
        steps: steps || [],
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - runStartTime;

    // Only write failure if the graph walker hasn't already done so (avoids double-write)
    if (!(error as any).__runAlreadyFailed) {
      await supabase
        .from('flow_runs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', run.id);
    }

    return jsonResponse({
      success: false,
      error: errorMessage,
      data: { run_id: run.id },
    }, 500);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SECURITY: these events assert a financial/trust/system fact (payment settled, role approved,
// invoice issued, a backend job finished). They are emitted ONLY by trusted server code
// (emitFlowEvent from edge functions / DB triggers), NEVER by the browser. A plain authenticated
// user must not be able to POST trigger-event with one of these and drive a global notification/email
// flow with attacker-chosen data (e.g. fake "invoice_paid" / "role_upgrade_approved" to any recipient).
// The frontend's own event set (profile_followed, moodboard_commented, review_submitted, …) is
// intentionally NOT here, so legitimate user-initiated notifications keep working.
const SERVER_ONLY_EVENTS = new Set<string>([
  'invoice_paid', 'invoice_issued', 'receipt_issued',
  'stripe_payment_succeeded', 'stripe_payment_failed',
  'role_upgrade_approved', 'role_upgrade_rejected', 'role_upgrade_request_submitted',
  'finance_follow_up', 'finance_document_requested', 'module_access_requested',
  // A self-hosting enquiry emails the platform operator. Server-only, or any authenticated
  // user could POST a forged one and put attacker-chosen text in that mailbox.
  'self_hosting_requested',
  // #193 — both assert a fact about a LEGAL document / the operator's provider account.
  'fiscal_document_rejected', 'fiscal_credits_low',
  'hr_late_checkin', 'hr.applicant_stage_changed', 'background_agent_failed',
  'material_alert', 'inventory_low_stock', 'freight_quote_requested', 'order_dispatched', 'marketplace_want_match',
  'purchase_order.sent', 'quote_pdf_generated',
  'video_generation_completed', 'video_generation_failed',
  'vr_world_created', 'vr_world_failed', 'virtual_staging_completed', 'svbrdf_extraction_complete',
  'agent_search_completed', 'inbox.message_received', 'inbox.thread_assigned',
  'seo.ranking_movement', 'seo.backlink_movement', 'seo.site_health_changed',
  'seo.article_refresh_due',
]);

/**
 * Queue this event for every active tenant endpoint that opted into its type (#330).
 *
 * Queue, not deliver: a tenant's endpoint can be slow, down, or hostile, and none of that may
 * be allowed to slow or fail the emit that triggered it. `workspace-webhook-dispatcher` does
 * the actual POST, with the SSRF guard, the signature and the retry schedule.
 *
 * Subscriptions are matched by explicit opt-in (`event_types` contains this type). There is no
 * "all events" option on purpose — an endpoint that silently starts receiving newly-added event
 * types leaks data by default.
 */
async function enqueueTenantWebhooks(
  supabase: DbClient,
  workspaceId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: hooks, error } = await supabase
      .from('workspace_webhooks')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .contains('event_types', [eventType]);
    if (error || !hooks?.length) return;

    await supabase.from('workspace_webhook_deliveries').insert(
      hooks.map((h: { id: string }) => ({
        webhook_id: h.id,
        workspace_id: workspaceId,
        event_type: eventType,
        // A stable envelope, so a tenant parser does not break when we add fields to `data`.
        payload: { type: eventType, workspace_id: workspaceId, data },
      })),
    );
  } catch (err) {
    // Never fail the emit over a webhook enqueue — the caller is mid-business-transaction.
    console.error('[flow-engine] webhook enqueue failed', { workspaceId, eventType, err });
  }
}

async function handleTriggerEvent(
  supabase: DbClient,
  body: { event_type: string; data: Record<string, unknown> },
  auth: AuthResult,
  req: Request,
): Promise<Response> {
  const { event_type, data } = body;

  // Resolve the AUTHORITATIVE workspace for this event. Trust the payload's
  // workspace_id ONLY from a trusted server emitter (service-role bearer or the cron
  // secret — how emitFlowEvent / DB triggers dispatch). A plain authenticated user may
  // only scope to a workspace they actually belong to (verified via userCanAccessWorkspace),
  // so a caller can never spoof another tenant's context. When no trustworthy workspace is
  // established, only is_global flows run (today's behavior) — never another tenant's flow.
  const bodyWs = typeof data?.workspace_id === 'string' && UUID_RE.test(data.workspace_id)
    ? data.workspace_id
    : null;
  const trustedServer = auth.level === 'secret' || isCronAuthorized(req);

  // A browser/user caller may not forge server-asserted trust/financial events (see SERVER_ONLY_EVENTS).
  if (!trustedServer && SERVER_ONLY_EVENTS.has(event_type)) {
    return jsonResponse({ success: false, error: 'This event can only be emitted by the server.' }, 403);
  }
  let workspaceId: string | null = null;
  if (bodyWs) {
    if (trustedServer) {
      workspaceId = bodyWs;
    } else if (auth.userId && await userCanAccessWorkspace(supabase, auth.userId, bodyWs)) {
      workspaceId = bodyWs;
    }
  }

  // ── Outbound tenant webhooks (#330) ────────────────────────────────────────────────────
  // Deliberately BEFORE the flows lookup and its early return: most events match no flow, so
  // enqueuing after that `return` would deliver nothing for exactly the events tenants most
  // want (invoice issued, order created) while every call still returned 200 — the silent-zero
  // shape. Requires a resolved workspace: an event we cannot attribute to one tenant must
  // never be fanned out to a tenant's endpoint.
  if (workspaceId) {
    await enqueueTenantWebhooks(supabase, workspaceId, event_type, data);
  }

  // Match active flows on trigger_type, scoped: all is_global flows PLUS this workspace's
  // own non-global flows. Never another tenant's rows.
  let query = supabase
    .from('flows')
    .select('id, workspace_id, is_global, trigger_config')
    .eq('trigger_type', event_type)
    .eq('status', 'active');
  query = workspaceId
    ? query.or(`is_global.eq.true,and(is_global.eq.false,workspace_id.eq.${workspaceId})`)
    : query.eq('is_global', true);

  const { data: allFlows, error } = await query;

  /**
   * `trigger_config` narrows an event flow to a subset of its events — "only when the deal reaches
   * Estimate", not "on every stage move". Until this existed the column was decorative: matching
   * was trigger_type + active only, so a stage-triggered email fired on EVERY move.
   *
   * The rule is generic on purpose, so it works for any trigger type without the engine learning
   * anyone's domain: every key in trigger_config must EQUAL the same-named key in the event data.
   * A blank value means "any", and scheduling keys are not filters. Compared as strings because
   * the config comes from a form and the payload from code, so 5 and "5" must agree.
   */
  const SCHEDULING_KEYS = new Set(['cron', 'timezone']);
  const matchesConfig = (cfg: Record<string, unknown> | null | undefined): boolean => {
    if (!cfg) return true;
    for (const [key, want] of Object.entries(cfg)) {
      if (SCHEDULING_KEYS.has(key)) continue;
      if (want === null || want === undefined || want === '') continue;
      if (Array.isArray(want)) {
        if (want.length === 0) continue;
        if (!want.map(String).includes(String((data as Record<string, unknown>)?.[key]))) return false;
        continue;
      }
      if (String((data as Record<string, unknown>)?.[key] ?? '') !== String(want)) return false;
    }
    return true;
  };

  const configMatched = (allFlows ?? []).filter((f) =>
    matchesConfig((f as { trigger_config?: Record<string, unknown> }).trigger_config));

  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }

  /**
   * Per-workspace overrides on the OPERATOR's seeded defaults (`workspace_flow_preferences`).
   *
   * A global flow runs inside every workspace, so before this the seeded "Inbox Message → Notify
   * Recipient" mailed every member on every WhatsApp reply with no off switch anywhere — the flow
   * is invisible to the tenant by design (is_global is the operator's), so there was nothing to
   * pause. The overlay is read here rather than baked into the match query because it is SPARSE:
   * no row means the platform default, and the overwhelmingly common case is no rows at all.
   *
   * Only global flows are subject to it — a tenant's OWN flow is already theirs to pause.
   */
  const mutedByFlow = new Map<string, string[]>();
  let flows = configMatched;
  if (workspaceId && configMatched.length) {
    const globalIds = configMatched
      .filter((f) => (f as { is_global?: boolean }).is_global === true)
      .map((f) => f.id as string);
    if (globalIds.length) {
      const { data: prefs } = await supabase
        .from('workspace_flow_preferences')
        .select('flow_id, enabled, muted_actions')
        .eq('workspace_id', workspaceId)
        .in('flow_id', globalIds);
      const disabled = new Set<string>();
      for (const p of (prefs ?? []) as Array<{ flow_id: string; enabled: boolean; muted_actions: string[] | null }>) {
        if (p.enabled === false) disabled.add(p.flow_id);
        else if (p.muted_actions?.length) mutedByFlow.set(p.flow_id, p.muted_actions);
      }
      if (disabled.size) flows = configMatched.filter((f) => !disabled.has(f.id as string));
    }
  }

  if (!flows || flows.length === 0) {
    return jsonResponse({ success: true, data: { triggered: 0 } });
  }

  // Execute each matching flow
  const results = await Promise.allSettled(
    flows.map((flow) =>
      handleExecuteFlow(
        supabase,
        { flow_id: flow.id, trigger_data: data },
        false,
        'system',
        undefined,
        mutedByFlow.get(flow.id as string),
      )
    ),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return jsonResponse({
    success: true,
    data: { triggered: flows.length, succeeded, failed },
  });
}

// =====================================================
// MAIN HANDLER
// =====================================================


Deno.serve(withApiLogging('flow-engine', async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req);
    const { action, ...body } = await req.json();

    // `trigger-event` is internal server-to-server dispatch (DB triggers, pg_cron).
    // Accept the stable cron secret (x-cron-secret → CRON_SECRET) in addition to a normal
    // authenticated caller, so DB-trigger notifications keep working independently of the
    // rotating service-role key the trigger sends (which can drift to a stale/placeholder
    // vault value). Every other action still requires a real authenticated caller.
    if (!auth.success && !(action === 'trigger-event' && isCronAuthorized(req))) {
      return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const callerTrusted = auth.level === 'secret' || isCronAuthorized(req);

    switch (action) {
      case 'execute-flow':
        return handleExecuteFlow(supabase, body, false, auth.userId || 'system', { trusted: callerTrusted, callerUserId: auth.userId ?? null });

      case 'test-flow':
        if (!auth.userId) return jsonResponse({ success: false, error: 'User auth required' }, 401);
        return handleExecuteFlow(supabase, body, true, auth.userId, { trusted: callerTrusted, callerUserId: auth.userId });

      case 'trigger-event':
        // Allow both server-to-server (secret) and authenticated user calls. The workspace
        // scope is resolved authoritatively inside (never trusts a spoofable body id).
        return handleTriggerEvent(supabase, body, auth, req);

      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Flow engine error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }
}));
