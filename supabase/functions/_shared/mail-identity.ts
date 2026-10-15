import type { DbClient } from './supabase-client.ts';
import { runInBackground } from './background.ts';

export interface MailIdentityImage { url: string; kind: 'photo' | 'logo' }

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.gr', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.gr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.de', 'gmx.net', 'yandex.com', 'yandex.ru', 'mail.ru', 'zoho.com',
  'otenet.gr', 'hol.gr', 'forthnet.gr', 'windowslive.com', 'web.de', 'libero.it', 'orange.fr',
]);
const RECHECK_DAYS = 30;
const RESOLVE_PER_CALL = 12;
const RESOLVE_PARALLEL = 4;
const CLAIM_MINUTES = 10;
const EMAIL_RE = /^[^\s@<>()"]{1,64}@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)$/;

type Row = { subject: string; url: string | null; kind: string | null; checked_at: string };

export function emailAddressOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /<([^>]+)>/.exec(raw);
  const addr = (m ? m[1] : raw).trim().toLowerCase();
  return EMAIL_RE.test(addr) ? addr : null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function get(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'follow' });
  } catch {
    return null;
  }
}

async function gravatarFor(email: string): Promise<string | null> {
  const url = `https://gravatar.com/avatar/${await sha256Hex(email)}?d=404&s=160`;
  const r = await get(url);
  if (!r) throw new Error('gravatar unreachable');
  await r.body?.cancel();
  return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/') ? url : null;
}

async function logoFor(domain: string): Promise<string | null> {
  const dns = await get(`https://dns.google/resolve?name=default._bimi.${domain}&type=TXT`);
  if (!dns) throw new Error('dns unreachable');
  if (dns.ok) {
    const body = await dns.json().catch(() => null) as { Answer?: Array<{ data?: string }> } | null;
    for (const a of body?.Answer ?? []) {
      const rec = String(a.data ?? '').replace(/"/g, '');
      const l = /(?:^|;)\s*l=(https:\/\/[^;\s]+\.svg)/i.exec(rec);
      // Only a certified mark (a=), as Gmail shows: an uncertified l= is any URL the sender likes.
      if (l && /(?:^|;)\s*a=https:\/\//i.test(rec)) return l[1];
    }
  }
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const r = await get(url);
  if (!r) throw new Error('favicon unreachable');
  // A miss answers 404 WITH a globe image, so only the status tells; a 16px icon upscaled is a smudge.
  if (!r.ok) { await r.body?.cancel(); return null; }
  if (!(r.headers.get('content-type') ?? '').startsWith('image/')) { await r.body?.cancel(); return null; }
  const bytes = new Uint8Array(await r.arrayBuffer());
  const isPng = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50;
  return (isPng ? new DataView(bytes.buffer).getUint32(16) >= 64 : bytes.length > 2000) ? url : null;
}

export async function resolveImage(subject: string): Promise<MailIdentityImage | null> {
  const isEmail = subject.includes('@');
  const url = isEmail ? await gravatarFor(subject) : await logoFor(subject);
  return url ? { url, kind: isEmail ? 'photo' : 'logo' } : null;
}

async function resolveOne(db: DbClient, subject: string): Promise<void> {
  try {
    const img = await resolveImage(subject);
    const { error } = await db.from('mail_identity_images').upsert(
      { subject, url: img?.url ?? null, kind: img?.kind ?? null, checked_at: new Date().toISOString() },
      { onConflict: 'subject' },
    );
    if (error) console.error('[mail-identity] cache write failed', error.message);
  } catch (e) {
    // Unreachable is not "has none": the claim lapses and the next request tries again.
    console.warn('[mail-identity] lookup failed', subject, (e as Error).message);
  }
}

async function resolveAndStore(db: DbClient, absent: string[], stale: string[]): Promise<void> {
  const claimAt = new Date(Date.now() - RECHECK_DAYS * 86_400_000 + CLAIM_MINUTES * 60_000).toISOString();
  if (absent.length) {
    await db.from('mail_identity_images')
      .upsert(absent.map((subject) => ({ subject, url: null, kind: null, checked_at: claimAt })), { onConflict: 'subject', ignoreDuplicates: true });
  }
  if (stale.length) await db.from('mail_identity_images').update({ checked_at: claimAt }).in('subject', stale);
  const queue = [...absent, ...stale];
  await Promise.all(Array.from({ length: RESOLVE_PARALLEL }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) await resolveOne(db, s);
  }));
}

/** Cached picture per address (Gravatar, else company logo); unchecked ones resolve in the background. */
export async function mailIdentityImages(db: DbClient, rawEmails: Array<string | null | undefined>): Promise<Map<string, MailIdentityImage>> {
  const emails = [...new Set(rawEmails.map(emailAddressOf).filter((e): e is string => !!e))].slice(0, 200);
  const out = new Map<string, MailIdentityImage>();
  if (!emails.length) return out;
  const domainOf = (e: string) => e.split('@')[1];
  const domains = [...new Set(emails.map(domainOf).filter((d) => !PERSONAL_DOMAINS.has(d)))];
  const subjects = [...emails, ...domains];

  const bySubject = new Map<string, Row>();
  for (let i = 0; i < subjects.length; i += 80) {
    const { data, error } = await db.from('mail_identity_images')
      .select('subject, url, kind, checked_at').in('subject', subjects.slice(i, i + 80));
    if (error) { console.error('[mail-identity] cache read failed', error.message); return out; }
    for (const r of (data ?? []) as Row[]) bySubject.set(r.subject, r);
  }

  for (const e of emails) {
    const own = bySubject.get(e);
    const org = bySubject.get(domainOf(e));
    const hit = own?.url ? own : org?.url ? org : null;
    if (hit?.url) out.set(e, { url: hit.url, kind: hit.kind === 'logo' ? 'logo' : 'photo' });
  }

  const staleBefore = Date.now() - RECHECK_DAYS * 86_400_000;
  const absent = subjects.filter((s) => !bySubject.has(s)).slice(0, RESOLVE_PER_CALL);
  const stale = subjects.filter((s) => bySubject.has(s) && Date.parse(bySubject.get(s)!.checked_at) < staleBefore)
    .slice(0, Math.max(0, RESOLVE_PER_CALL - absent.length));
  if (absent.length || stale.length) runInBackground(resolveAndStore(db, absent, stale), 'mail-identity');
  return out;
}
