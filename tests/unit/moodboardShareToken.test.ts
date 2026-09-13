/** A published moodboard is reached by a token that can expire and be rotated (#360 CB-15). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const api = stripComments(readFileSync(join(ROOT, 'src/services/moodboardAPI.ts'), 'utf8').replace(/\r\n/g, '\n'));

describe('#360 CB-15 — the public read goes through the token', () => {
  it('there is a token-addressed read', () => {
    // #410 folded the board and its items into ONE reader. `get_public_moodboard` resolves the
    // token half by delegating to `moodboard_by_share_token`, so the expiry rule still lives in
    // one place; the legacy id is accepted only until the board is given a token.
    expect(api).toMatch(/async getPublicMoodBoard\(key: string\)/);
    expect(api).toMatch(/rpc\('get_public_moodboard', \{ p_key: key \}\)/);
  });

  it('it does not hand back the owner', () => {
    // A public viewer is told what the board IS, not whose it is. "Am I the owner" is answered
    // in SQL from the caller's own JWT, so no viewer is handed the owner's id.
    const fn = api.slice(api.indexOf('async getPublicMoodBoard'), api.indexOf('async getMoodBoard'));
    expect(fn).toMatch(/viewer_is_owner: boolean/);
    expect(fn, 'the public read exposes the owner again').not.toMatch(/user_id/);
    const page = stripComments(
      readFileSync(join(ROOT, 'src/pages/PublicMoodBoardPage.tsx'), 'utf8').replace(/\r\n/g, '\n'),
    );
    expect(page, 'the public page reads the owner id again').not.toMatch(/board.*\.user_id/);
  });

  it('the board has an ADDRESS, so revoking is possible at all', () => {
    // Until #410 the share link was `/board/<id>` gated on `is_public`, so rotating the token
    // changed a value nothing read and revoked nothing.
    expect(api).toMatch(/async ensureShareToken\(id: string\)/);
    const detail = stripComments(
      readFileSync(join(ROOT, 'src/components/business/moodboard/MoodBoardDetailPage.tsx'), 'utf8')
        .replace(/\r\n/g, '\n'),
    );
    expect(detail, 'nothing mints an address when a board is first shared').toContain('ensureShareToken');
    expect(detail, 'there is no revoke control').toContain('rotatePublicShareToken');
    expect(detail, 'the share link must be the token, not the id')
      .toMatch(/shareUrl\(moodboard\.publicShareToken \?\? moodboard\.id\)/);
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
