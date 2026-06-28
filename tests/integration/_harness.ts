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

// Best-effort teardown. Data first (FK), then memberships, workspaces, users. Never throws —
// the email-prefix cron is the backstop if anything here fails.
export async function teardown(svc: SupabaseClient, opts: { wsIds?: string[]; userIds?: string[] }): Promise<void> {
  const wsIds = (opts.wsIds || []).filter(Boolean);
  const userIds = (opts.userIds || []).filter(Boolean);
  for (const ws of wsIds) await svc.from('crm_companies').delete().eq('workspace_id', ws).then(() => {}, () => {});
  for (const ws of wsIds) await svc.from('workspace_members').delete().eq('workspace_id', ws).then(() => {}, () => {});
  for (const ws of wsIds) await svc.from('workspaces').delete().eq('id', ws).then(() => {}, () => {});
  for (const u of userIds) await svc.auth.admin.deleteUser(u).then(() => {}, () => {});
}
