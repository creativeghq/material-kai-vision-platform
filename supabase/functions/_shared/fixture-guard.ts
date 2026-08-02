import type { DbClient } from './supabase-client.ts';

/**
 * Is this workspace a test fixture? If so, nothing outbound may leave the platform for it.
 *
 * `tests/integration/_harness.ts` runs against PRODUCTION on purpose — that is how the suite
 * covers real RLS instead of a mock's opinion of it. The cost showed up on 2026-07-28: a test
 * flipping a delivery note to `issued` fired trg_delivery_notes_dispatched, which fired the seeded
 * Order-Dispatched flow, which produced 134 attempted sends from the production domain.
 *
 * The guards added then reject a literal "null" recipient, which closes that one case because the
 * address rendered as the string "null". They do not close the class. The next one will be a VALID
 * address belonging to a real person — the fixtures are realistic on purpose — and nothing about
 * the payload will look wrong.
 *
 * Deliberately keyed on an explicit column, not on the `e2e-` naming convention. That convention
 * exists so `cleanup_test_artifacts` can reap rows; promoting it to an egress signal would
 * silently mute a real customer who happened to pick a matching slug. A security-relevant check
 * must not piggyback on a housekeeping convention.
 *
 * FAILS OPEN, deliberately, and this is the one place that deserves an argument. Every other gate
 * in this platform fails closed. Here, "closed" means a real tenant stops receiving their invoices
 * because a lookup blipped — the guard would cause the outage it exists to prevent. The blast
 * radius of failing open is bounded to the test suite, which is monitored and re-run; the blast
 * radius of failing closed is every customer. `is_fixture` also defaults false, so an unreadable
 * row and a real tenant are the same answer.
 */
export async function isFixtureWorkspace(
  supabase: DbClient,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  if (!workspaceId) return false;
  try {
    const { data } = await supabase
      .from('workspaces')
      .select('is_fixture')
      .eq('id', workspaceId)
      .maybeSingle();
    return data?.is_fixture === true;
  } catch (e) {
    console.warn('[fixture-guard] could not read is_fixture, treating as real:', e);
    return false;
  }
}
