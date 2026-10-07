// GENERATED MIRROR of src/utils/emailSignature.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

type Escape = (s: string) => string;

export interface SignatureCard {
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  tagline: string;
  logo_url: string;
  confidentiality: boolean;
}

export const SIGNATURE_TEXT_FIELDS = ['name', 'title', 'company', 'phone', 'email', 'website', 'address', 'tagline', 'logo_url'] as const;

const MAX_LEN: Record<(typeof SIGNATURE_TEXT_FIELDS)[number], number> = {
  name: 80, title: 80, company: 120, phone: 40, email: 120, website: 120, address: 160, tagline: 160, logo_url: 500,
};

const EMAIL = /^[^\s@<>"'?&#/]+@[^\s@<>"'?&#/]+\.[a-z]{2,}$/i;
const HTTPS = /^https:\/\/[^\s<>"']+$/i;

export const SIGNATURE_PALETTE = {
  ink: '#1a0f07', text: '#25170e', muted: '#6a5a4e', primary: '#604734', rule: '#cbb490', faint: '#9a8c80',
} as const;

export function normalizeSignatureCard(raw: unknown): SignatureCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const card = { confidentiality: src.confidentiality === true } as SignatureCard;
  for (const k of SIGNATURE_TEXT_FIELDS) {
    card[k] = typeof src[k] === 'string' ? (src[k] as string).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_LEN[k]) : '';
  }
  if (card.email && !EMAIL.test(card.email)) card.email = '';
  if (card.logo_url && !HTTPS.test(card.logo_url)) card.logo_url = '';
  return card.name ? card : null;
}

export function websiteHref(website: string): string | null {
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s<>"']*)?$/i.test(url) ? url : null;
}

function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null;
}

export function signatureDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#fff">${html}</body></html>`;
}

export const CONFIDENTIALITY_NOTE =
  'This email and any attachments are confidential and intended only for the named recipient. '
  + 'If you received it in error, please let the sender know and delete it.';

export function renderSignatureText(card: SignatureCard): string {
  return [
    card.name,
    [card.title, card.company].filter(Boolean).join(', '),
    card.phone && `M ${card.phone}`,
    card.email && `E ${card.email}`,
    card.website && `W ${card.website}`,
    card.address && `A ${card.address}`,
    card.tagline,
    card.confidentiality && `\n${CONFIDENTIALITY_NOTE}`,
  ].filter(Boolean).join('\n');
}

export function renderSignatureHtml(card: SignatureCard, escape: Escape): string {
  const P = SIGNATURE_PALETTE;
  const F = 'font-family:Arial,Helvetica,sans-serif;';
  const link = (href: string | null, text: string, style: string) =>
    href ? `<a href="${escape(href)}" style="${style}text-decoration:none;">${escape(text)}</a>` : escape(text);
  const row = (label: string, value: string) =>
    `<tr><td style="${F}font-size:10px;font-weight:bold;letter-spacing:1px;color:${P.primary};padding:0 10px 4px 0;vertical-align:top;line-height:18px;">${label}</td>`
    + `<td style="${F}font-size:13px;color:${P.text};padding:0 0 4px 0;line-height:18px;">${value}</td></tr>`;
  const web = card.website ? websiteHref(card.website) : null;
  const rows = [
    card.phone && row('M', link(telHref(card.phone), card.phone, `color:${P.text};`)),
    card.email && row('E', link(`mailto:${card.email}`, card.email, `color:${P.text};`)),
    card.website && row('W', link(web, card.website, `color:${P.primary};font-weight:bold;`)),
    card.address && row('A', escape(card.address)),
  ].filter(Boolean).join('');
  const logo = card.logo_url
    ? `<img src="${escape(card.logo_url)}" height="20" alt="${escape(card.company || card.name)}" style="display:block;border:0;height:20px;width:auto;">`
    : '';
  const extra = [
    logo && `<tr><td colspan="2" style="padding-top:16px;">${web ? `<a href="${escape(web)}" style="text-decoration:none;">${logo}</a>` : logo}</td></tr>`,
    card.tagline && `<tr><td colspan="2" style="${F}font-size:11px;color:${P.muted};line-height:16px;padding-top:6px;">${escape(card.tagline)}</td></tr>`,
    card.confidentiality && `<tr><td colspan="2" style="${F}font-size:10px;line-height:14px;color:${P.faint};padding-top:14px;">${escape(CONFIDENTIALITY_NOTE)}</td></tr>`,
  ].filter(Boolean).join('');
  return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:18px;">'
    + `<tr><td style="vertical-align:top;padding:0 18px 0 0;border-right:2px solid ${P.rule};">`
    + `<div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${P.ink};line-height:23px;">${escape(card.name)}</div>`
    + (card.title ? `<div style="${F}font-size:13px;color:${P.primary};line-height:18px;padding-top:3px;">${escape(card.title)}</div>` : '')
    + (card.company ? `<div style="${F}font-size:13px;color:${P.text};line-height:18px;">${escape(card.company)}</div>` : '')
    + `</td><td style="vertical-align:top;padding:0 0 0 18px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${rows}</table></td></tr>`
    + extra
    + '</table>';
}
