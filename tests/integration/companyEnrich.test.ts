// Live end-to-end test for the `company-enrich` edge function.
// Requires BOTH SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY in env (self-skips
// otherwise, like every suite here). It creates a throwaway e2e user + workspace,
// grants a credit balance (the function reserves credits per invariant #10), then
// calls company-enrich AS that user with a real business name and asserts the web
// search half actually filled something. Tears the fixture down afterwards.
// Run:  SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… npx vitest run tests/integration/companyEnrich.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, SUPABASE_URL } from './_harness';

// Paid test (spends real Anthropic web_search + Apollo credits) — never auto-runs in CI.
// Opt in explicitly: RUN_ENRICH_LIVE=1 alongside the two Supabase keys.
const enabled = hasCreds && process.env.RUN_ENRICH_LIVE === '1';
const d = enabled ? describe : describe.skip;

d('company-enrich (live)', () => {
  const svc = hasCreds ? serviceClient() : (null as any);
  const rid = runId();
  const created: { userIds: string[]; wsIds: string[] } = { userIds: [], wsIds: [] };

  afterAll(async () => {
    if (hasCreds) await teardown(svc, created);
  });

  it('fills business info for a real company via web search', async () => {
    const user = await createUser(svc, 'enrich', rid);
    created.userIds.push(user.id);
    const wsId = await createWorkspace(svc, 'enrich', rid, user.id);
    created.wsIds.push(wsId);
    await addMember(svc, wsId, user.id, 'owner');

    // Give the wallet enough to clear the reserve ceiling (12 cr).
    await svc.rpc('credit_user_credits', {
      p_user_id: user.id, p_amount: 100, p_operation_type: 'e2e_seed',
      p_description: 'e2e enrich seed', p_metadata: {}, p_workspace_id: null,
    }).then(() => {}, async () => {
      // Fallback if the grant RPC name differs — some deployments expose refund_credits only.
      await svc.rpc('refund_credits', {
        p_user_id: user.id, p_amount: 100, p_operation_type: 'e2e_seed',
        p_description: 'e2e enrich seed', p_metadata: {}, p_workspace_id: null,
      }).then(() => {}, () => {});
    });

    const token = (await user.client.auth.getSession()).data.session!.access_token;

    // Real business we already verified via VIES: GLUESOLUTIONS ΙΚΕ (EL803111788).
    const res = await fetch(`${SUPABASE_URL}/functions/v1/company-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'GlueSolutions', country_name: 'Greece', vat_number: 'EL803111788', workspace_id: wsId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Log the actual payload so the run shows exactly what was filled.
    // eslint-disable-next-line no-console
    console.log('[company-enrich] result:', JSON.stringify(body, null, 2));

    expect(body.ok).toBe(true);
    expect(Array.isArray(body.sources)).toBe(true);
    // web_search should have run (ANTHROPIC_API_KEY is configured on the platform).
    expect(body.sources).toContain('web_search');
    // At least one soft field should be populated for a real, findable business.
    const f = body.fields || {};
    const filled = ['website', 'phone', 'email', 'description', 'linkedin', 'city']
      .filter((k) => f[k]);
    expect(filled.length).toBeGreaterThan(0);
  }, 90_000);
});
