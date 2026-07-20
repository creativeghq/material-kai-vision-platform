// Shared fixtures for live-system integration tests (run against PROD, same philosophy as
// scripts/smoke). A service-role key creates throwaway users / workspaces / rows; each test
// user gets a REAL signed-in client (anon key + signInWithPassword) so queries run under that
// user's JWT and exercise the actual RLS policies — not a service-role bypass.
//
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
    .insert({ name: `E2E ${label} ${rid}`, slug: `e2e-${label}-${rid}`.toLowerCase(), created_by: ownerId })
    .select('id')
    .single();
  if (error) throw new Error(`createWorkspace(${label}): ${error.message}`);
  return data.id;
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

// Best-effort teardown. Data first (FK), then memberships, workspaces, users. Never throws —
// the email-prefix cron is the backstop if anything here fails.
export async function teardown(svc: SupabaseClient, opts: { wsIds?: string[]; userIds?: string[] }): Promise<void> {
  const explicitWs = (opts.wsIds || []).filter(Boolean);
  const userIds = (opts.userIds || []).filter(Boolean);

  // EVERY test user is auto-provisioned a personal "<email>'s workspace" at signup
  // (handle_new_user_workspace_assignment: a child of root with created_by = user, which in turn
  // spawns a "(reseller)" crm_companies mirror in the parent via _autolink_dealer_crm). Deleting
  // the auth user does NOT remove it — created_by → SET NULL, not cascade — so it and its mirror
  // would linger until the name-cron backstop (visible in the CRM Companies list for up to the
  // cron's grace window). Collect each user's owned workspaces here so we delete them outright.
  const wsIds = new Set<string>(explicitWs);
  for (const u of userIds) {
    const { data } = await svc.from('workspaces').select('id').eq('created_by', u)
      .then((r) => r, () => ({ data: [] as Array<{ id: string }> }));
    for (const w of (data ?? [])) wsIds.add(w.id);
  }

  // The reseller mirror lives in the PARENT workspace, not the child, so `delete where
  // workspace_id = child` never touches it. Deleting the child fires the cleanup trigger, but
  // delete the mirror explicitly too so teardown never depends on the trigger being enabled.
  for (const ws of wsIds) {
    const { data } = await svc.from('workspaces').select('parent_crm_company_id').eq('id', ws).maybeSingle()
      .then((r) => r, () => ({ data: null as { parent_crm_company_id: string | null } | null }));
    if (data?.parent_crm_company_id) await svc.from('crm_companies').delete().eq('id', data.parent_crm_company_id).then(() => {}, () => {});
  }
  for (const ws of wsIds) await svc.from('crm_companies').delete().eq('workspace_id', ws).then(() => {}, () => {});
  for (const ws of wsIds) await svc.from('workspace_members').delete().eq('workspace_id', ws).then(() => {}, () => {});
  for (const ws of wsIds) await svc.from('workspaces').delete().eq('id', ws).then(() => {}, () => {});
  for (const u of userIds) await svc.auth.admin.deleteUser(u).then(() => {}, () => {});
}
