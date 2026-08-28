/**
 * A published moodboard is reached by a token that can expire and be rotated (#360 CB-15).
 *
 * The public read was `is_public = true` for role `public`, keyed on the board's own id. Two
 * consequences, and the second is the one that bites: the share never expired, and it could not be
 * ROTATED — the URL was the board's identity, so revoking one recipient's link meant un-publishing
 * for everybody, which is why nobody did it.
 *
 * The pattern already existed twice here: `moodboard_sheets.public_share_token` in this very
 * feature, and `inbox_thread_tokens` with its 30-day TTL. The board was the odd one out.
 *
 * The SQL half is verified by a rolled-back fixture recorded in the commit (anon with a valid
 * token sees 1 row; expired 0; unpublished 0; rotation changes the token). What this file pins is
 * the checkout: that the client reads through the token function and nothing reintroduces the
 * blanket read.
 */
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
