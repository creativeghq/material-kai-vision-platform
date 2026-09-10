/** A published moodboard is reached by a token that can expire and be rotated (#360 CB-15). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const api = stripComments(readFileSync(join(ROOT, 'src/services/moodboardAPI.ts'), 'utf8').replace(/\r\n/g, '\n'));

describe('#360 CB-15 — the public read goes through the token', () => {
  it('there is a token-addressed read', () => {
    expect(api).toMatch(/async getPublicMoodBoard\(shareToken: string\)/);
    expect(api).toMatch(/rpc\('moodboard_by_share_token', \{ p_token: shareToken \}\)/);
  });

  it('it does not hand back the owner', () => {
    // A public viewer is told what the board IS, not whose it is. The RPC does not return
    // `user_id`; this pins that the client does not invent one either.
    const fn = api.slice(api.indexOf('async getPublicMoodBoard'), api.indexOf('async rotatePublicShareToken'));
    expect(fn).toMatch(/userId: '',/);
    expect(fn, 'the public read exposes the owner again').not.toMatch(/userId: row\.user_id/);
  });

  it('rotating is the revoke, and it is a server call', () => {
    expect(api).toMatch(/async rotatePublicShareToken\(id: string\)/);
    expect(api).toMatch(/rpc\('rotate_moodboard_share_token'/);
    // Never a client-side UPDATE: ownership is checked in SQL, and a token minted in a browser is
    // a token the browser chose.
    const fn = api.slice(api.indexOf('async rotatePublicShareToken'));
    expect(fn.slice(0, 400)).not.toMatch(/from\('moodboards'\)\s*\.update/);
  });

  it('the authenticated single-board read is unchanged', () => {
    // `getMoodBoard` is for somebody signed in; RLS narrows it to their own boards and the
    // collaborator rule. The token path is additional, not a replacement.
    expect(api).toMatch(/async getMoodBoard\(id: string\)/);
  });
});
