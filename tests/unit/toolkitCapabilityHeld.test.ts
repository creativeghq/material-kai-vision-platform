import { describe, expect, it } from 'vitest';

import { TOOLKITS } from '@/components/features/ai/agentToolsCatalog';
import { WORKSPACE_ROLE_CAPABILITIES } from '@/auth/roleCapabilities';

describe('every toolkit capability is held by some workspace role', () => {
  it('no cluster is gated on a capability no role can hold', () => {
    const held = new Set(Object.values(WORKSPACE_ROLE_CAPABILITIES).flat());
    const orphaned = TOOLKITS.flatMap((t) => {
      const caps = t.capability === undefined ? [] : Array.isArray(t.capability) ? t.capability : [t.capability];
      return caps.length > 0 && !caps.some((c) => held.has(c)) ? [`${t.id} (${caps.join(', ')})`] : [];
    });
    expect(orphaned, 'agent-chat binds a cluster only when the caller's workspace ROLE holds its capability, so these can never bind. Gate on a role capability and check the operator at the push site.').toEqual([]);
  });
});
