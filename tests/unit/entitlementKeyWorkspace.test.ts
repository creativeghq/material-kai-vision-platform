import { describe, expect, it } from 'vitest';
import { resolveEntitledWorkspace } from '../../supabase/functions/_shared/entitlement';
import { requestContext } from '../../supabase/functions/_shared/request-context';

function membershipClient(ids: string[]) {
  let reads = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: ids.map((workspace_id) => ({ workspace_id })) }),
  };
  return {
    get reads() { return reads; },
    from: (table: string) => {
      if (table === 'workspace_members') reads++;
      return chain;
    },
    rpc: () => Promise.resolve({ data: true, error: null }),
  };
}

describe('a kai_ key acts in the workspace it is bound to (#496)', () => {
  it('resolves to the key workspace and never reads memberships', async () => {
    const db = membershipClient(['newest-entitled', 'bound']);
    const ws = await requestContext.run({ keyWorkspaceId: 'bound' }, () =>
      resolveEntitledWorkspace(db, 'user-1', 'seo-toolkit'));
    expect(ws).toBe('bound');
    expect(db.reads).toBe(0);
  });

  it('a session caller still resolves from memberships', async () => {
    const db = membershipClient(['newest-entitled', 'other']);
    const ws = await requestContext.run({}, () => resolveEntitledWorkspace(db, 'user-1', 'seo-toolkit'));
    expect(ws).toBe('newest-entitled');
    expect(db.reads).toBe(1);
  });
});
