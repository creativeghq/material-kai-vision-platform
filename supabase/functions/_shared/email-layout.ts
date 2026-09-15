/**
 * The one shell every outbound email is delivered in, filled per sender identity. Declared
 * once: 21 templates each carried their own <html> and disagreed on ground, ink and accent.
 */

import { escapeHtml } from './html.ts';

export type LayoutSource =
  | 'operator_custom'
  | 'workspace_custom'
  | 'default'
  | 'skipped_full_document'
  | 'none';

export interface LayoutBrand {
  brandName: string;
  brandUrl: string;
  logoUrl: string;
  senderName: string;
  senderEmail: string;
  /** Postal address. Required by CAN-SPAM on a marketing send. */
  footerNote: string;
}

export interface WrapOptions {
  layoutHtml?: string | null;
  /**
   * A tenant never inherits the operator's shell, for the same reason it never inherits the
   * operator's Resend key — it would put our name on their customer's mail.
   */
  kind: 'operator' | 'workspace';
  brand: LayoutBrand;
  preheader?: string;
  /** Marketing only. Absent = no opt-out block, correct for transactional mail. */
  unsubscribeUrl?: string;
}

export interface WrapResult {
  html: string;
  source: LayoutSource;
}

export class LayoutHasNoContentSlot extends Error {
  constructor() {
    super('The email layout has no {{content}} slot, so the message body would be dropped. Refusing to send.');
    this.name = 'LayoutHasNoContentSlot';
  }
}

const CONTENT_SLOT = '{{content}}';

const RAW_SLOTS = new Set(['content', 'brand_logo', 'unsubscribe_block', 'colophon']);

export function isFullDocument(html: string): boolean {
  return /<\s*(?:!doctype\s+html|html)\b/i.test(html);
}

export function layoutHasContentSlot(layout: string): boolean {
  return layout.includes(CONTENT_SLOT);
}

/** One pass: replacement text is never rescanned, so a literal {{token}} in the body survives. */
export function renderLayout(layout: string, slots: Record<string, string>): string {
  return layout.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const value = slots[key];
    if (value === undefined) return '';
    return RAW_SLOTS.has(key) ? value : escapeHtml(value);
  });
}

function brandLogoSlot(brand: LayoutBrand): string {
  const label = escapeHtml(brand.brandName);
  const inner = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${label}" height="28" style="height:28px;width:auto;display:block;border:0;">`
    : `<span class="mk-wordmark" style="font-size:16px;font-weight:600;letter-spacing:-0.01em;color:#1c1b20;">${label}</span>`;
  return brand.brandUrl
    ? `<a href="${escapeHtml(brand.brandUrl)}" style="text-decoration:none;color:#1c1b20;">${inner}</a>`
    : inner;
}

function unsubscribeSlot(url: string | undefined): string {
  if (!url) return '';
  return `<p class="mk-fine" style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#6b6875;">`
    + `<a href="${escapeHtml(url)}" style="color:#6b6875;text-decoration:underline;">Unsubscribe</a>`
    + ` from these emails.</p>`;
}

function colophonSlot(kind: WrapOptions['kind'], brand: LayoutBrand, year: string): string {
  if (kind !== 'operator') return '';
  return `<p class="mk-colophon" style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#8d8a97;text-align:center;">`
    + `&copy; ${escapeHtml(year)} ${escapeHtml(brand.brandName)}</p>`;
}

const PREHEADER_STYLE = 'display:none;max-height:0;overflow:hidden;mso-hide:all;'
  + 'font-size:1px;line-height:1px;color:#f1f0f3;opacity:0;';

function preheaderDiv(text: string): string {
  return `<div style="${PREHEADER_STYLE}">${escapeHtml(text)}</div>`;
}

/** Inside <body>, where clients read it — returning early dropped every campaign's preview line. */
function injectPreheader(doc: string, preheader: string): string {
  if (!preheader) return doc;
  const bodyOpen = /<body\b[^>]*>/i.exec(doc);
  if (!bodyOpen) return preheaderDiv(preheader) + doc;
  const at = bodyOpen.index + bodyOpen[0].length;
  return doc.slice(0, at) + preheaderDiv(preheader) + doc.slice(at);
}

/** Substitute WITHOUT escaping — the caller escapes once. Both put `Tiles &amp; Stone` in the preview. */
export function fillPlain(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
    const v = variables[key];
    return v === undefined || v === null ? m : String(v);
  });
}

/**
 * A body that is already a complete document keeps its own chrome and SAYS SO through
 * `source` — silently exempting it is how the per-template branding drifted.
 */
export function wrapInLayout(content: string, opts: WrapOptions): WrapResult {
  if (!content || !content.trim()) return { html: content, source: 'none' };
  if (isFullDocument(content)) {
    return { html: injectPreheader(content, opts.preheader ?? ''), source: 'skipped_full_document' };
  }

  const override = (opts.layoutHtml ?? '').trim();
  const layout = override || DEFAULT_LAYOUT_HTML;
  if (!layoutHasContentSlot(layout)) throw new LayoutHasNoContentSlot();

  const source: LayoutSource = override
    ? (opts.kind === 'operator' ? 'operator_custom' : 'workspace_custom')
    : 'default';

  const year = String(new Date().getFullYear());
  const html = renderLayout(layout, {
    content,
    preheader: opts.preheader ?? '',
    brand_logo: brandLogoSlot(opts.brand),
    brand_name: opts.brand.brandName,
    brand_url: opts.brand.brandUrl,
    sender_name: opts.brand.senderName,
    sender_email: opts.brand.senderEmail,
    footer_note: opts.brand.footerNote,
    unsubscribe_block: unsubscribeSlot(opts.unsubscribeUrl),
    colophon: colophonSlot(opts.kind, opts.brand, year),
    current_year: year,
  });

  return { html, source };
}

/** Derive from the UNWRAPPED body: over the wrapped document the <style> block lands in the text part. */
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '');

  // &amp; LAST, or `&amp;lt;` decodes twice into a real `<`. Numeric forms go generically:
  // a body written as `&euro;4,820` otherwise reaches text readers literally.
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&(?:euro|#8364);/gi, '€')
    .replace(/&(?:middot|#183);/gi, '·')
    .replace(/&(?:copy|#169);/gi, '©')
    .replace(/&(?:mdash|#8212);/gi, '—')
    .replace(/&(?:ndash|#8211);/gi, '–')
    .replace(/&(?:hellip|#8230);/gi, '…')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  return text
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Exercises every element the shell styles, so a missing rule shows up here, not in a real send. */
export const LAYOUT_PREVIEW_SAMPLE = `<h1>Your December statement is ready</h1>
<p>Hi Maria,</p>
<p>Here is the summary for <strong>Keros Hellas</strong>. Nothing needs your attention unless a figure below looks wrong.</p>
<table role="presentation">
  <tr><th>Document</th><th>Issued</th><th style="text-align:right;">Amount</th></tr>
  <tr><td>Invoice INV-2026-0412</td><td>3 Dec 2026</td><td style="text-align:right;">&euro;4,820.00</td></tr>
  <tr><td>Invoice INV-2026-0418</td><td>11 Dec 2026</td><td style="text-align:right;">&euro;1,140.50</td></tr>
  <tr><td><strong>Outstanding</strong></td><td></td><td style="text-align:right;"><strong>&euro;5,960.50</strong></td></tr>
</table>
<p><a class="mk-btn" href="https://app.materialshub.gr">Open the statement</a></p>
<h2>What changed this month</h2>
<ul>
  <li>Two invoices issued, one credit note applied.</li>
  <li>Payment terms unchanged at <code>NET 30</code>.</li>
</ul>
<blockquote>A quoted note from the account manager sits here, set apart from the body.</blockquote>
<hr>
<p>Questions? Reply to this email and it lands in the same thread, or <a href="https://app.materialshub.gr">open it in the app</a>.</p>`;

/**
 * Descendant selectors under .mk-content are what dress an unstyled fragment: the body
 * arrives from 22 callers, so it cannot be styled inline at the source.
 */
export const DEFAULT_LAYOUT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{brand_name}}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body, table, td, p, a, h1, h2, h3, h4 { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; max-width:100%; }
  a { color:#c9256b; }

  .mk-content { font-size:15px; line-height:1.62; color:#1c1b20; }
  .mk-content > *:first-child { margin-top:0 !important; }
  .mk-content > *:last-child { margin-bottom:0 !important; }
  .mk-content p { margin:0 0 14px; }
  .mk-content h1 { margin:0 0 12px; font-size:21px; line-height:1.3; font-weight:600; letter-spacing:-0.01em; color:#1c1b20; }
  .mk-content h2 { margin:22px 0 10px; font-size:17px; line-height:1.35; font-weight:600; color:#1c1b20; }
  .mk-content h3, .mk-content h4 { margin:20px 0 8px; font-size:14px; font-weight:600; color:#1c1b20; }
  .mk-content a { color:#c9256b; text-decoration:underline; }
  .mk-content strong { font-weight:600; }
  .mk-content ul, .mk-content ol { margin:0 0 14px; padding-left:20px; }
  .mk-content li { margin:0 0 6px; }
  .mk-content hr { border:0; border-top:1px solid #e5e3e8; margin:22px 0; }
  .mk-content blockquote { margin:0 0 14px; padding:2px 0 2px 14px; border-left:2px solid #e5e3e8; color:#6b6875; }
  .mk-content table { width:100%; font-size:14px; margin:0 0 16px; }
  .mk-content th { padding:8px 10px; text-align:left; font-size:11px; font-weight:600; color:#6b6875; background:#faf9fb; border-bottom:1px solid #e5e3e8; }
  .mk-content td { padding:8px 10px; border-bottom:1px solid #e5e3e8; vertical-align:top; font-variant-numeric:tabular-nums; }
  .mk-content code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:13px; background:#faf9fb; border:1px solid #e5e3e8; border-radius:3px; padding:1px 4px; }
  .mk-content .mk-btn, .mk-content a.mk-btn { display:inline-block; background:#c9256b; color:#ffffff !important; font-size:15px; font-weight:600; line-height:1; text-decoration:none !important; padding:12px 20px; border-radius:4px; }

  @media only screen and (max-width:620px) {
    .mk-card { width:100% !important; }
    .mk-pad { padding-left:20px !important; padding-right:20px !important; }
  }

  @media (prefers-color-scheme: dark) {
    .mk-body, .mk-ground { background:#0f0d14 !important; }
    .mk-card { background:#17141d !important; border-color:#2a2532 !important; }
    .mk-rule { border-color:#2a2532 !important; }
    .mk-sunken { background:#13101a !important; }
    .mk-content, .mk-content p, .mk-content li, .mk-content td { color:#ece9f0 !important; }
    .mk-content h1, .mk-content h2, .mk-content h3, .mk-content h4, .mk-wordmark { color:#ffffff !important; }
    .mk-content a { color:#f487b6 !important; }
    .mk-content th { background:#13101a !important; color:#a49fb0 !important; border-color:#2a2532 !important; }
    .mk-content td { border-color:#2a2532 !important; }
    .mk-content code { background:#13101a !important; border-color:#2a2532 !important; }
    .mk-content hr, .mk-content blockquote { border-color:#2a2532 !important; }
    .mk-content blockquote { color:#a49fb0 !important; }
    .mk-fine, .mk-fine a { color:#a49fb0 !important; }
    .mk-colophon { color:#7d7889 !important; }
  }
</style>
</head>
<body class="mk-body" style="margin:0;padding:0;width:100%;background:#f1f0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="${PREHEADER_STYLE}">{{preheader}}</div>
<table role="presentation" class="mk-ground" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f0f3;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" class="mk-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e3e8;border-radius:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td class="mk-pad mk-rule" style="padding:18px 32px;border-bottom:1px solid #e5e3e8;">{{brand_logo}}</td>
        </tr>
        <tr>
          <td class="mk-pad mk-content" style="padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.62;color:#1c1b20;">{{content}}</td>
        </tr>
        <tr>
          <td class="mk-pad mk-rule mk-sunken" style="padding:16px 32px;border-top:1px solid #e5e3e8;background:#faf9fb;border-radius:0 0 4px 4px;">
            <p class="mk-fine" style="margin:0;font-size:12px;line-height:1.5;color:#6b6875;">{{sender_name}} &middot; <a href="mailto:{{sender_email}}" style="color:#6b6875;text-decoration:underline;">{{sender_email}}</a></p>
            <p class="mk-fine" style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#6b6875;">{{footer_note}}</p>
            {{unsubscribe_block}}
          </td>
        </tr>
      </table>
      {{colophon}}
    </td>
  </tr>
</table>
</body>
</html>`;
