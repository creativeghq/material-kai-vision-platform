/**
 * Flow Engine Edge Function
 *
 * Executes workflow automations by walking the xyflow graph definition.
 * Actions:
 * - execute-flow: Run a flow with trigger data
 * - test-flow: Dry-run (actions resolve templates but don't fire)
 * - trigger-event: Auto-dispatch from DB triggers (Phase 4)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

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

    default:
      return { output: {}, branch: 'output' };
  }
}

// =====================================================
// ACTION EXECUTORS
// =====================================================

async function executeAction(
  supabase: SupabaseClient,
  node: FlowNode,
  context: ExecutionContext,
  isTestRun: boolean,
  userId?: string,
): Promise<{ output: Record<string, unknown> }> {
  const { actionType, config } = node.data;
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
    case 'send_sms': {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send',
          channel: 'sms',
          to: resolved.to,
          content: resolved.message,
          channelId: resolved.channel_id || undefined,
        },
      });
      if (error) throw new Error(`SMS failed: ${error.message}`);
      if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'twilio-sms', 'flow_send_sms', 1, { to: resolved.to });
      return { output: { sent: true, ...(data || {}) } };
    }

    case 'send_email': {
      // Same migration safety guard as create_notification: if the recipient
      // template didn't resolve (older client predating the notification→flow
      // migration), skip rather than send a broken email.
      const emailTo = String(resolved.to ?? '');
      if (!emailTo || emailTo.includes('{{')) {
        return { output: { skipped: true, reason: 'unresolved_to' } };
      }
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          to: emailTo,
          from: resolved.from || undefined,
          subject: resolved.subject,
          html: resolved.body,
          template_id: resolved.template_id || undefined,
        },
      });
      if (error) throw new Error(`Email failed: ${error.message}`);
      return { output: { sent: true, ...(data || {}) } };
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
            agent_type: resolved.agent_type || 'kai',
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
        product_id: resolved.product_id,
        notes: resolved.notes || '',
        position: nextPosition,
      });
      if (error) throw new Error(`Add to moodboard failed: ${error.message}`);
      return { output: { added: true, position: nextPosition } };
    }

    case 'web_search':
    case 'perplexity_search': {
      const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';
      if (!ANTHROPIC_API_KEY()) throw new Error('ANTHROPIC_API_KEY not configured');

      const country = String(resolved.country || '');
      const regionId = String(resolved.region || '');
      const category = String(resolved.category || '');
      const limit = Number(resolved.limit) || 30;

      if (!category) throw new Error('Category is required');

      const scope = country
        ? `in ${country}`
        : regionId
        ? `in the ${regionId} region`
        : 'across Europe and major global manufacturing hubs';

      const query = `Find B2B manufacturers of ${category} ${scope}. I need actual production companies (not distributors) with their own manufacturing facilities. For each company provide: name, website URL, city/country, main products. Return up to ${limit} results as a structured list.`;

      const { textContent } = await withRetry(async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY(),
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
            messages: [{ role: 'user', content: query }],
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Web search failed: ${response.status} - ${errText}`);
        }
        const data = await response.json();
        const textContent = (data.content as any[])
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n') || '';
        return { textContent };
      });

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

      if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'firecrawl-scrape', 'flow_firecrawl_scrape', 1, { url });

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
      if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'apollo-enrich', 'flow_apollo_enrich', 1, { company_name: companyName });

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

        if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'hunter-email-finder', 'flow_hunter_find_contacts', 1, { domain, person: `${firstName} ${lastName}`.trim() });

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

      if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'hunter-domain-search', 'flow_hunter_find_contacts', 1, { domain });

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

      if (isRealUserId(userId)) await debitExternalServiceCredits(supabase, userId!, 'zerobounce-validate', 'flow_zerobounce_validate', 1, { email });

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

    default:
      return { output: { skipped: true, reason: `Unknown action type: ${actionType}` } };
  }
}

// =====================================================
// GRAPH WALKER (BFS)
// =====================================================

async function executeFlowGraph(
  supabase: SupabaseClient,
  graph: FlowGraph,
  runId: string,
  triggerData: Record<string, unknown>,
  isTestRun: boolean,
  userId?: string,
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
        output = { ...triggerData };
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
        const result = await executeAction(supabase, node, context, isTestRun, userId);
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

      // Update run as failed (single authoritative write — outer handler will skip its own write)
      await supabase
        .from('flow_runs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          error_node_id: nodeId,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - stepStartTime,
        })
        .eq('id', runId);

      // Tag the error so the outer handler knows the run record is already updated
      (error as any).__runAlreadyFailed = true;
      throw error;
    }
  }
}

// =====================================================
// REQUEST HANDLERS
// =====================================================

async function handleExecuteFlow(
  supabase: SupabaseClient,
  body: { flow_id: string; trigger_data?: Record<string, unknown> },
  isTestRun: boolean,
  initiatedBy: string,
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

  try {
    // Execute the graph
    await executeFlowGraph(supabase, graph, run.id, trigger_data, isTestRun, initiatedBy);

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

async function handleTriggerEvent(
  supabase: SupabaseClient,
  body: { event_type: string; data: Record<string, unknown> },
): Promise<Response> {
  const { event_type, data } = body;

  // Find all active flows with matching trigger type
  const { data: flows, error } = await supabase
    .from('flows')
    .select('id')
    .eq('trigger_type', event_type)
    .eq('status', 'active');

  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }

  if (!flows || flows.length === 0) {
    return jsonResponse({ success: true, data: { triggered: 0 } });
  }

  // Execute each matching flow
  const results = await Promise.allSettled(
    flows.map((flow) =>
      handleExecuteFlow(supabase, { flow_id: flow.id, trigger_data: data }, false, 'system')
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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(withApiLogging('flow-engine', async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req);
    if (!auth.success) {
      return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
    }

    const { action, ...body } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case 'execute-flow':
        return handleExecuteFlow(supabase, body, false, auth.userId || 'system');

      case 'test-flow':
        if (!auth.userId) return jsonResponse({ success: false, error: 'User auth required' }, 401);
        return handleExecuteFlow(supabase, body, true, auth.userId);

      case 'trigger-event':
        // Allow both server-to-server (secret) and authenticated user calls
        return handleTriggerEvent(supabase, body);

      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Flow engine error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }
}));
