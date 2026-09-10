/**
 * SPF / DKIM / DMARC verdicts, and whether they vouch for the sender the message CLAIMS.
 *
 * IMPORT-FREE, ON PURPOSE. This lived in `inbound-email.ts`, which pulls in `flow-events.ts` and
 * therefore reads `Deno.env` at module load — so no unit test could import it, and the one piece
 * of logic here that most needs a test (does a DKIM pass actually belong to the From domain?) had
 * none. Extracting it is what makes `tests/unit/inboundDkimAlignment.test.ts` possible.
 *
 * `inbound-email.ts` re-exports both, so every existing import site keeps working.
 */

export interface AuthResults {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  /**
   * The domains of every PASSING DKIM signature (`header.d=`), lowercased.
   *
   * Without this a `dkim=pass` verdict says only "some signature verified", not "the sender's own
   * domain signed this" — and anyone can obtain a passing signature for a domain they own
   * (#357 AE-5).
   */
  dkimDomains: string[];
}

/**
 * SPF/DKIM/DMARC verdicts out of the `Authentication-Results` header Cloudflare adds.
 *
 * The gate is **DKIM-based**, not SPF-based, and that is deliberate: forwarding rewrites the
 * envelope sender, so a legitimate forwarded message ("use my own address", §8 of #229) fails SPF
 * every time. DKIM survives forwarding as long as the body is not rewritten.
 */
export function parseAuthResults(headerValue: string | null | undefined): AuthResults {
  const v = String(headerValue || '').toLowerCase();
  const pick = (k: string) => {
    const m = v.match(new RegExp(`\\b${k}=([a-z]+)`));
    return m ? m[1] : null;
  };
  // A message can carry SEVERAL DKIM signatures, each its own `;`-delimited method segment with
  // its own `header.d`. Reading one verdict and one domain out of the whole header would pair a
  // pass from one signature with a domain from another — which IS the spoof, not a defence.
  const dkimDomains: string[] = [];
  for (const segment of v.split(';')) {
    const verdict = segment.match(/\bdkim=([a-z]+)/);
    if (!verdict || verdict[1] !== 'pass') continue;
    const d = segment.match(/\bheader\.d=([a-z0-9.-]+)/);
    if (d) dkimDomains.push(d[1].replace(/^\.+|\.+$/g, ''));
  }
  return { spf: pick('spf'), dkim: pick('dkim'), dmarc: pick('dmarc'), dkimDomains };
}

/** Is there a passing DKIM signature FOR THE DOMAIN THE MESSAGE CLAIMS TO BE FROM (#357 AE-5)? */
export function dkimAlignedWith(fromAddress: string | null | undefined, auth: AuthResults): boolean {
  const from = String(fromAddress || '').toLowerCase();
  const at = from.lastIndexOf('@');
  if (at === -1) return false;
  const fromDomain = from.slice(at + 1).replace(/^\.+|\.+$/g, '');
  if (!fromDomain) return false;
  return auth.dkimDomains.some((d) => (
    d === fromDomain
    || fromDomain.endsWith(`.${d}`)   // parent domain signed for a subdomain sender
    || d.endsWith(`.${fromDomain}`)   // subdomain (a sending service) signed for the parent
  ));
}
