import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { parseAuthResults, dkimAlignedWith } from '../../supabase/functions/_shared/email-auth';

/**
 * A DKIM pass must be a pass FOR THE CLAIMED SENDER (#357 AE-5).
 *
 * The spoofing gate read `auth.dkim !== 'pass'` — a pass for ANY domain. An attacker signs a
 * message with a domain they own, sets `From: someone@yourcustomer.test`, and DMARC fails while
 * DKIM passes, so the gate opened and the agent could auto-reply as though the claimed sender
 * were verified.
 *
 * Inbound email is the most attacker-friendly surface in the platform: anyone can send one and
 * every header is theirs to choose. The signature domain is the one thing that is not.
 */

const ROOT = join(__dirname, '..', '..');

/** A realistic Cloudflare `Authentication-Results` header. */
const hdr = (s: string) => `mx.cloudflare.com; ${s}`;

describe('#357 AE-5 — the attack, and that it no longer works', () => {
  it('the spoof: signed by the attacker, From the victim', () => {
    // dkim=pass, but for a domain the attacker owns. The OLD gate saw only `dkim=pass`.
    const auth = parseAuthResults(hdr('spf=fail; dkim=pass header.d=attacker.test; dmarc=fail'));
    expect(auth.dkim).toBe('pass');
    expect(dkimAlignedWith('ceo@bigcustomer.test', auth)).toBe(false);
  });

  it('the legitimate case: signed by the sender\'s own domain', () => {
    const auth = parseAuthResults(hdr('spf=fail; dkim=pass header.d=bigcustomer.test; dmarc=fail'));
    expect(dkimAlignedWith('ceo@bigcustomer.test', auth)).toBe(true);
  });

  it('a forwarded message still gets through — the reason DKIM rescues at all', () => {
    // Forwarding rewrites the envelope sender, so SPF fails every time. DKIM survives, and "use
    // my own address" is a forwarding flow by design.
    const auth = parseAuthResults(hdr('spf=fail; dkim=pass header.d=bigcustomer.test; dmarc=fail'));
    expect(auth.spf).toBe('fail');
    expect(dkimAlignedWith('ceo@bigcustomer.test', auth)).toBe(true);
  });
});

describe('#357 AE-5 — alignment follows DMARC\'s relaxed rule', () => {
  it('a sending subdomain vouches for the parent, and vice versa', () => {
    const sub = parseAuthResults(hdr('dkim=pass header.d=mail.example.test'));
    expect(dkimAlignedWith('a@example.test', sub)).toBe(true);
    const parent = parseAuthResults(hdr('dkim=pass header.d=example.test'));
    expect(dkimAlignedWith('a@mail.example.test', parent)).toBe(true);
  });

  it('a shared public suffix is NOT alignment', () => {
    // The trap a naive `endsWith` falls into. Requiring a DOT-delimited suffix refuses it
    // without needing the public-suffix list.
    const auth = parseAuthResults(hdr('dkim=pass header.d=evil.co.uk'));
    expect(dkimAlignedWith('press@bbc.co.uk', auth)).toBe(false);
  });

  it('a lookalike prefix is not a subdomain', () => {
    const auth = parseAuthResults(hdr('dkim=pass header.d=notexample.test'));
    expect(dkimAlignedWith('a@example.test', auth)).toBe(false);
  });
});

describe('#357 AE-5 — multiple signatures are read per segment', () => {
  it('a FAILING signature for the sender does not borrow a pass from another domain', () => {
    // The header carries one signature per `;` segment. Reading one verdict and one domain out
    // of the whole string would pair the attacker's pass with the victim's domain — which is
    // the spoof, not a defence against it.
    const auth = parseAuthResults(
      hdr('dkim=fail header.d=bigcustomer.test; dkim=pass header.d=attacker.test'),
    );
    expect(auth.dkimDomains).toEqual(['attacker.test']);
    expect(dkimAlignedWith('ceo@bigcustomer.test', auth)).toBe(false);
  });

  it('a passing signature among several is found', () => {
    const auth = parseAuthResults(
      hdr('dkim=fail header.d=other.test; dkim=pass header.d=bigcustomer.test'),
    );
    expect(dkimAlignedWith('ceo@bigcustomer.test', auth)).toBe(true);
  });
});

describe('#357 AE-5 — it fails closed on nonsense', () => {
  it('no header, no signature, no From', () => {
    const empty = parseAuthResults(null);
    expect(empty.dkimDomains).toEqual([]);
    expect(dkimAlignedWith('a@b.test', empty)).toBe(false);
    const auth = parseAuthResults(hdr('dkim=pass header.d=b.test'));
    expect(dkimAlignedWith(null, auth)).toBe(false);
    expect(dkimAlignedWith('no-at-sign', auth)).toBe(false);
    expect(dkimAlignedWith('trailing@', auth)).toBe(false);
  });

  it('a pass with NO header.d vouches for nobody', () => {
    const auth = parseAuthResults(hdr('dkim=pass'));
    expect(auth.dkim).toBe('pass');
    expect(auth.dkimDomains).toEqual([]);
    expect(dkimAlignedWith('a@b.test', auth)).toBe(false);
  });
});

describe('#357 AE-5 — the gate actually uses it', () => {
  const src = stripComments(
    readFileSync(join(ROOT, 'supabase/functions/email-webhooks/index.ts'), 'utf8').replace(/\r\n/g, '\n'),
  );

  it('the spoofing gate reads alignment, not the bare verdict', () => {
    expect(src).toContain('dkimAlignedWith(fromAddress, auth)');
    expect(
      src,
      "the gate is back to `auth.dkim !== 'pass'` — a pass for any domain rescues a DMARC fail",
    ).not.toContain("auth.dkim !== 'pass'");
  });

  it('a DMARC fail with no aligned signature is still quarantined', () => {
    const gate = src.slice(src.indexOf('const dmarcFailed'), src.indexOf('// Loop gate'));
    expect(gate).toContain('quarantined_auth_fail');
  });
});
