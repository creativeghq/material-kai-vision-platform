/**
 * Binding a customer share link to the person it was issued for (#357 AE-12).
 *
 * `/i/:token` authorises by possession of a URL. That is fine for READING — the link is an
 * invitation, and challenging someone before they can see the conversation they were invited to
 * would make the feature useless. It is not fine for WRITING: `token_send_message` posts as the
 * contact the token is bound to, so a forwarded mail, a quoted reply chain or a shared mailbox
 * hands a stranger the ability to speak as the customer.
 *
 * So writing costs a one-time code, sent to the address the link was issued for, and the browser
 * then holds a short-lived proof. The proof is an HMAC rather than a stored session: there is no
 * row to leak and no table to reap, it expires on its own, and rotating the secret revokes every
 * outstanding one at once.
 *
 * The proof travels in the request body, NOT in the URL — the whole defect being fixed is a
 * credential that survives being pasted into an email.
 */

/** How long a verified browser may keep writing before it is challenged again. */
export const SENDER_PROOF_TTL_HOURS = 12;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

/** Length-independent equality. A `===` on a signature leaks its prefix through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A proof that THIS browser verified control of the contact's mailbox for THIS token.
 *
 * The token is inside the signed payload, so a proof minted for one conversation cannot be
 * replayed against another — which matters because a customer may hold links to several.
 */
export async function mintSenderProof(secret: string, token: string, nowMs: number): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SENDER_PROOF_TTL_HOURS * 3600;
  return `${exp}.${await hmac(secret, `inbox_thread_sender:${token}:${exp}`)}`;
}

export async function verifySenderProof(
  secret: string, token: string, proof: string | null | undefined, nowMs: number,
): Promise<boolean> {
  if (!proof) return false;
  const dot = proof.indexOf('.');
  if (dot <= 0) return false;
  const expPart = proof.slice(0, dot);
  const sig = proof.slice(dot + 1);
  if (!/^\d+$/.test(expPart) || !sig) return false;
  const exp = Number(expPart);
  // Expiry is checked BEFORE the signature so an expired-but-valid proof cannot be replayed by
  // an attacker who simply keeps presenting it.
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return false;
  return timingSafeEqual(sig, await hmac(secret, `inbox_thread_sender:${token}:${exp}`));
}

/**
 * A uniformly random numeric code.
 *
 * Rejection sampling, not `% 10`: taking a byte modulo ten makes 0–5 more likely than 6–9, and a
 * skewed code is a smaller keyspace than it looks.
 */
export function generateNumericCode(digits = 6): string {
  const out: number[] = [];
  const buf = new Uint8Array(digits * 2);
  while (out.length < digits) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= 250) continue;   // 250 = 25 * 10, so 0..249 maps evenly onto 0..9
      out.push(b % 10);
      if (out.length === digits) break;
    }
  }
  return out.join('');
}

/**
 * `maria@kithara.gr` → `m•••a@k•••.gr`.
 *
 * The screen has to name the address so the customer knows which inbox to open, and must not
 * disclose it to whoever is holding the link — they may be the very person being defended against.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const maskLocal = local.length <= 2 ? `${local[0] ?? ''}•••` : `${local[0]}•••${local[local.length - 1]}`;
  return `${maskLocal}@${host[0] ?? ''}•••${tld}`;
}
