/** Guard (#495): sync-channels binds only accounts on the workspace's own Zernio profile. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const api = stripComments(readFileSync(join(ROOT, 'supabase', 'functions', 'messaging-api', 'index.ts'), 'utf8'));

function syncBlock(): string {
  const start = api.indexOf("case 'sync-channels':");
  expect(start, 'sync-channels action not found').toBeGreaterThan(-1);
  const end = api.indexOf('\n      case ', start + 10);
  return api.slice(start, end === -1 ? undefined : end);
}

describe('sync-channels never claims another tenant\'s WhatsApp account', () => {
  it('resolves and checks the workspace profile BEFORE listing accounts', () => {
    const block = syncBlock();
    const resolveAt = block.indexOf('resolveWorkspaceProfile(');
    const assertAt = block.indexOf('assertOwnProfile(');
    const listAt = block.indexOf("'/accounts");
    const listAtTpl = block.indexOf('`/accounts');
    const list = Math.max(listAt, listAtTpl);
    expect(resolveAt).toBeGreaterThan(-1);
    expect(assertAt).toBeGreaterThan(resolveAt);
    expect(list).toBeGreaterThan(assertAt);
  });

  it('filters the listing to that profile and skips rows owned by another workspace', () => {
    const block = syncBlock();
    expect(block).toMatch(/profileId=\$\{encodeURIComponent\(syncProfileId\)\}/);
    expect(block).toMatch(/accProfileId !== syncProfileId\) continue/);
    expect(block).toMatch(/existing\.workspace_id !== syncWsId\) continue/);
  });
});
