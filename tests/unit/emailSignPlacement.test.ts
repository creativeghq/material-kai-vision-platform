import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORWARD_MARKER, signEmail } from '../../supabase/functions/_shared/email-signature';

const sig = { text: 'Maria · Keros', html: '<div class="sig">Maria · Keros</div>' };
const plain = () => null;

describe('an outgoing email is signed in one place, the same way for Inbox and Gmail', () => {
  it('signs below our words', () => {
    const out = signEmail('Thanks, see attached.', sig, plain);
    expect(out.text).toBe('Thanks, see attached.\n\n-- \nMaria · Keros');
    expect(out.html.indexOf('Thanks')).toBeLessThan(out.html.indexOf('class="sig"'));
  });

  it('puts the signature above a forwarded message, never under it', () => {
    const body = `FYI below.\n\n${FORWARD_MARKER}\nFrom: Nikos <n@x.gr>\n\nOriginal text`;
    const out = signEmail(body, sig, plain);
    expect(out.text.indexOf('Maria · Keros')).toBeLessThan(out.text.indexOf(FORWARD_MARKER));
    expect(out.text.indexOf('FYI below.')).toBeLessThan(out.text.indexOf('Maria · Keros'));
    expect(out.html.indexOf('class="sig"')).toBeLessThan(out.html.indexOf('Original text'));
  });

  it('appends after a ready-made body (catalog cards)', () => {
    const out = signEmail('text', sig, plain, '<table>cards</table>');
    expect(out.html).toBe('<table>cards</table><div class="sig">Maria · Keros</div>');
  });

  it('is the only signing code in both senders', () => {
    // A second hand-rolled "\n\n-- \n" join is how the two mailboxes would start signing differently.
    for (const f of ['supabase/functions/inbox-api/index.ts', 'supabase/functions/_shared/gmail-client.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('signEmail(');
      expect(src, f).not.toMatch(/\\n\\n-- \\n\$\{/);
    }
  });
});
