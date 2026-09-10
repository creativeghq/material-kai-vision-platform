import type { DbClient } from './supabase-client.ts';

/** Is this workspace a test fixture? If so, nothing outbound may leave the platform for it. */
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
