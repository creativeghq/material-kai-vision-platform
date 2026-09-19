// Shared fixtures for live-system integration tests (run against PROD, same philosophy as
// scripts/smoke). A service-role key creates throwaway users / workspaces / rows; each test
// user gets a REAL signed-in client (anon key + signInWithPassword) so queries run under that
// user's JWT and exercise the actual RLS policies — not a service-role bypass.
// All test users use an `e2e-…@materialshub.gr` email so cleanup_test_artifacts reaps any
// leftover if afterAll cleanup is interrupted (see [[project_test_artifact_cleanup_2026_06_22]]).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Integration tests need BOTH keys: service-role to build the fixture, anon to sign users in.
// Absent either, the suites self-SKIP (so `npm test` / a no-secret checkout stays green).
export const hasCreds = Boolean(SERVICE_KEY && ANON_KEY);

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, noPersist);
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, noPersist);
}

// A short, collision-resistant id shared across one test run's fixture names.
export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient; // signed in AS this user — queries run under their RLS context
}

export async function createUser(svc: SupabaseClient, label: string, rid: string): Promise<TestUser> {
  const email = `e2e-${label}-${rid}@materialshub.gr`;
  const password = `E2e!${rid}Aa1`;
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser(${label}): ${error?.message}`);
  const client = anonClient();
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`signIn(${label}): ${signErr.message}`);
  return { id: data.user.id, email, client };
}

export async function createWorkspace(svc: SupabaseClient, label: string, rid: string, ownerId: string): Promise<string> {
  const { data, error } = await svc
    .from('workspaces')
    // is_fixture is what stops outbound paths (email, WhatsApp, webhooks) from reaching a real
    // provider for this tenant. This tier runs against PRODUCTION on purpose — that is how it
    // covers real RLS — and on 2026-07-28 a test flipping a delivery note to `issued` fired the
    // seeded Order-Dispatched flow and produced 134 attempted sends from the production domain.
    .insert({
      name: `E2E ${label} ${rid}`,
      slug: `e2e-${label}-${rid}`.toLowerCase(),
      created_by: ownerId,
      is_fixture: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createWorkspace(${label}): ${error.message}`);
  return data.id;
}

/**
 * Put the fixture's owner on an unlimited plan. **Opt-in — call it only from a suite that needs
 * more than ten catalog products.**
 */
export async function grantUnlimitedPlan(svc: SupabaseClient, userId: string): Promise<void> {
  const { data: plan, error: planErr } = await svc
    .from('subscription_plans')
    .select('id')
    .eq('name', 'enterprise')
    .maybeSingle();
  // Fail loudly. Silently skipping leaves the suite to die 20 lines later on a quota error that
  // says nothing about the plan lookup that actually went wrong.
  if (planErr) throw new Error(`grantUnlimitedPlan(plan lookup): ${planErr.message}`);
  if (!plan) throw new Error("grantUnlimitedPlan: no 'enterprise' plan — fixtures would hit the free-plan cap");

  const { error } = await svc
    .from('user_subscriptions')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      status: 'active',
      current_period_start: new Date().toISOString(),
      // A year out: a suite running across a period boundary must not start failing on quota.
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  if (error) throw new Error(`grantUnlimitedPlan: ${error.message}`);
}

// is_workspace_member() requires status='active', so set it explicitly. Upsert because a
// future auto-membership trigger must not turn the fixture into a flaky unique-violation.
export async function addMember(svc: SupabaseClient, wsId: string, userId: string, role = 'owner'): Promise<void> {
  const { error } = await svc
    .from('workspace_members')
    .upsert({ workspace_id: wsId, user_id: userId, role, status: 'active' }, { onConflict: 'workspace_id,user_id' });
  if (error) throw new Error(`addMember: ${error.message}`);
}

// Paid modules refuse with 402 unless the workspace holds an entitlement (assertEntitled →
// is_workspace_entitled). A fixture workspace is never the operator root, so it must be granted
// explicitly before any hr / sales-finance / stock endpoint will answer.
export async function grantModule(svc: SupabaseClient, wsId: string, moduleSlug: string): Promise<void> {
  const { error } = await svc
    .from('workspace_module_entitlements')
    .upsert({ workspace_id: wsId, module_slug: moduleSlug, enabled: true }, { onConflict: 'workspace_id,module_slug' });
  if (error) throw new Error(`grantModule(${moduleSlug}): ${error.message}`);
}

// Best-effort teardown: ONE call to public.cleanup_test_fixture — fixture workspaces (including
// the personal one each test user gets at signup), the reseller mirror, the child rows no cascade
// takes, the users. One call because it was a dozen and the tier runs its files CONCURRENTLY: a
// workspace delete cascades 349 FKs, so they contended and died on the PostgREST statement
// timeout, leaking the fixture. Fenced by NAME, so a real workspace id deletes nothing.
// Never throws, but MUST NOT be silent.
export async function teardown(svc: SupabaseClient, opts: { wsIds?: string[]; userIds?: string[] }): Promise<void> {
  const wsIds = (opts.wsIds || []).filter(Boolean);
  const userIds = (opts.userIds || []).filter(Boolean);
  if (wsIds.length === 0 && userIds.length === 0) return;

  const problems: string[] = [];
  const { data, error } = await svc
    .rpc('cleanup_test_fixture', { p_ws_ids: wsIds, p_user_ids: userIds })
    .then((r) => r, (e: Error) => ({ data: null, error: { message: e.message } }));

  if (error) {
    problems.push(`cleanup_test_fixture: ${error.message}`);
  } else {
    // Check the WORLD, not the return value: a delete can report no error and still leave the
    // row. That is the check that would have caught the leak on run #1 rather than after 3,057.
    const report = (data ?? {}) as {
      errors?: Record<string, string>;
      survivors?: Array<{ id: string; name: string }>;
    };
    for (const [where, why] of Object.entries(report.errors ?? {})) problems.push(`${where}: ${why}`);
    for (const w of report.survivors ?? []) problems.push(`workspace ${w.id} (${w.name}) SURVIVED deletion`);
  }

  if (problems.length > 0) {
    // Deliberately a warning, not a throw: teardown must never turn a green suite red. But it is
    // now impossible for a silently-failing teardown to look identical to a working one.
    console.warn(
      `[teardown] ${problems.length} step(s) failed — fixtures leaked into the live database:\n  ` +
      problems.join('\n  '),
    );
  }
}
