/**
 * Catalog cards in an Inbox message — a product or a service, suggested to the customer.
 *
 * ONE shape, stored on the message (`inbox_messages.metadata.cards`), rendered three ways:
 *
 *   • WhatsApp — Meta's interactive `cta_url` message: image header, body, one link button. One
 *     send per card; the member's words ride in the first card's body when they fit, and go out
 *     as their own text message first when they do not. No public link → the image with the
 *     facts as its caption; no image either → plain text. All of those are SESSION messages, so
 *     the 24h-window check that gates every freeform reply already gates these. (Meta's media
 *     carousel is deliberately not used: Zernio accepts it, but whether Meta delivers it as a
 *     session message could not be verified, and its failure would arrive asynchronously after
 *     the member has seen a "sent" bubble.)
 *   • Email — an HTML table (thumbnail · name · price · button) under the member's own words, with
 *     a text alternative that lists the same cards. Every field is escaped with the canonical
 *     escaper (invariant 11) and every href/src goes through the http(s) allowlist; a card is
 *     tenant-authored data, and a product called `<script>` is a product called `<script>`.
 *   • In-app — the Inbox transcript and the customer's `/i/:token` page render the same cards.
 *
 * The client sends IDS ONLY. Name, image, link and — above all — the PRICE are resolved by
 * `inbox-api` for the customer on the thread, through the same `get_product_price_for_workspace`
 * resolver a quote line uses, and the printed price line is derived ONCE here (`price_line`), so
 * the chat bubble, the email and the WhatsApp card cannot word the same price differently.
 *
 * Pure: no Deno APIs, no DB. Imports only mirrored vocabularies and the escaper, so vitest can
 * load it directly.
 */

import { escapeHtml } from './html.ts';
import { safeHref, safeImageSrc } from './safeUrl.generated.ts';
import {
  INBOX_CARD_BUTTON_LABEL, INBOX_CARD_MAX, type InboxCardKind, type InboxPriceBasis,
} from './inboxCardKinds.generated.ts';

export { INBOX_CARD_MAX, type InboxCardKind };

/** What the client is allowed to say about a card. Everything else is derived server-side. */
export interface InboxCardPick {
  kind: InboxCardKind;
  product_id: string;
}

export interface InboxCard {
  kind: InboxCardKind;
  product_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  /** A public https URL, or null. Comes from `products.metadata` via `imageFromMetadata`. */
  image_url: string | null;
  /** The price THIS customer pays, from the workspace price resolver. null = not priced. */
  price: number | null;
  currency: string;
  unit: string | null;
  /** Whether `price` includes VAT. A consumer is quoted gross, a business buyer net. */
  price_basis: InboxPriceBasis | null;
  /** The price as printed everywhere — "€45.00 / m² incl. VAT" or "Price on request". */
  price_line: string;
  /** Where the customer lands when they tap the card. null = nowhere public to send them. */
  url: string | null;
}

/**
 * "€45.00 / m² incl. VAT" — or "Price on request" when the resolver reported no price.
 *
 * `Intl` with a currency style, the locale the rest of the platform prints money in
 * (`_shared/money.ts` / `src/utils/decimal.ts`). Computed once when the card is resolved and
 * stored as `price_line`; the renderers print it, they do not re-derive it.
 */
export function cardPriceLine(card: Pick<InboxCard, 'price' | 'currency' | 'unit' | 'price_basis'>): string {
  if (card.price == null || !Number.isFinite(Number(card.price))) return 'Price on request';
  let amount: string;
  try {
    amount = new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: card.currency || 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(card.price));
  } catch {
    amount = `${card.currency || 'EUR'} ${Number(card.price).toFixed(2)}`;
  }
  const unit = card.unit ? ` / ${card.unit}` : '';
  const basis = card.price_basis === 'gross' ? ' incl. VAT' : card.price_basis === 'net' ? ' excl. VAT' : '';
  return `${amount}${unit}${basis}`;
}

/**
 * Cut to `max` characters on a word boundary, with an ellipsis. Runs of spaces collapse; line
 * breaks are KEPT — a member's paragraphs and the card's name/price/description lines are the
 * message's structure, and WhatsApp renders `\n`.
 */
export function clip(s: string, max: number): string {
  const t = s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return `${sp > max * 0.6 ? cut.slice(0, sp) : cut}…`;
}

/**
 * The cards as plain text — for a channel with no rich layout (a social DM, the text part of an
 * email, the thread's list preview) and as the floor every rich rendering can fall back to.
 */
export function cardsToText(cards: readonly InboxCard[]): string {
  return cards.map((c) => {
    const head = `• ${c.name}${c.sku ? ` (${c.sku})` : ''} — ${c.price_line}`;
    return c.url ? `${head}\n  ${c.url}` : head;
  }).join('\n');
}

/**
 * Text plus cards, made to fit a channel's message cap (Instagram DMs take 1,000 characters,
 * Messenger 2,000). The member's words come first and are never cut; cards are listed while they
 * fit, and the ones that do not are COUNTED rather than dropped in silence.
 */
export function fitTextWithCards(text: string | null | undefined, cards: readonly InboxCard[], max: number): string {
  const intro = (text || '').trim();
  const lines = cards.map((c) => cardsToText([c]));
  let out = intro;
  let shown = 0;
  for (const line of lines) {
    const next = out ? `${out}\n\n${line}` : line;
    // Leave room for the "and N more" tail.
    if (next.length > max - 40) break;
    out = next;
    shown += 1;
  }
  const left = cards.length - shown;
  if (left > 0) out = `${out}${out ? '\n\n' : ''}…and ${left} more — reply and we will send the rest.`;
  return out.slice(0, max);
}

/** What the conversation list shows for a message that is only cards. */
export function cardsPreview(cards: readonly InboxCard[]): string {
  if (!cards.length) return '';
  if (cards.length === 1) return cards[0].name;
  const kind = cards.every((c) => c.kind === 'service') ? 'service' : 'product';
  return `${cards.length} ${kind}s suggested`;
}

// ─── WhatsApp ──────────────────────────────────────────────────────────────────────────────────

/** One outbound WhatsApp send, in the vocabulary `sendWhatsAppReply` forwards to Zernio. */
export interface WhatsAppCardMessage {
  message?: string;
  attachmentUrl?: string;
  attachmentType?: 'image';
  interactive?: Record<string, unknown>;
  /** Off when the text carries a link the card already renders — two previews of one page. */
  linkPreview?: boolean;
}

/** Meta's limits for an interactive message, applied so a long description is cut, not refused. */
const WA_HEADER_TEXT_MAX = 60;
const WA_BODY_MAX = 1024;
const WA_FOOTER_MAX = 60;

function ctaAction(card: InboxCard): Record<string, unknown> {
  return { name: 'cta_url', parameters: { display_text: INBOX_CARD_BUTTON_LABEL[card.kind], url: card.url } };
}

/** The card's own facts: name, price, a short description. */
function cardFacts(card: InboxCard): string {
  return [card.name, card.price_line, card.description ? clip(card.description, 240) : null]
    .filter(Boolean).join('\n');
}

/**
 * Cards → the WhatsApp sends that carry them. One send per card.
 *
 * `intro` is the member's typed text. It rides in the FIRST card's body when the two fit Meta's
 * body cap together; otherwise it goes out first as its own text message, uncut — a reply that
 * ends mid-sentence because a card was attached is worse than two messages.
 */
export function buildWhatsAppCardMessages(cards: readonly InboxCard[], intro?: string | null): WhatsAppCardMessage[] {
  const list = cards.slice(0, INBOX_CARD_MAX);
  const text = intro?.trim() || undefined;
  if (!list.length) return text ? [{ message: text }] : [];

  const out: WhatsAppCardMessage[] = [];
  let introForFirst: string | undefined;
  if (text) {
    const fits = clip(`${text}\n\n${cardFacts(list[0])}`, Number.MAX_SAFE_INTEGER).length <= WA_BODY_MAX;
    if (fits) introForFirst = text;
    else out.push({ message: text });
  }
  list.forEach((c, i) => out.push(singleCardMessage(c, i === 0 ? introForFirst : undefined)));
  return out;
}

function singleCardMessage(card: InboxCard, intro: string | undefined): WhatsAppCardMessage {
  const facts = cardFacts(card);
  const body = clip(intro ? `${intro}\n\n${facts}` : facts, WA_BODY_MAX);
  const footer = [card.sku ? `Ref ${card.sku}` : null, card.unit ? `per ${card.unit}` : null]
    .filter(Boolean).join(' · ');
  const image = safeImageSrc(card.image_url);
  const url = card.url && safeHref(card.url, '') ? card.url : null;
  if (url) {
    const interactive: Record<string, unknown> = {
      type: 'cta_url',
      header: image
        ? { type: 'image', image: { link: image } }
        : { type: 'text', text: clip(card.name, WA_HEADER_TEXT_MAX) },
      body: { text: body },
      action: ctaAction({ ...card, url }),
    };
    if (footer) interactive.footer = { text: clip(footer, WA_FOOTER_MAX) };
    return { interactive, linkPreview: false };
  }
  // No public page to link: the image with the facts as its caption, or the facts alone.
  return image
    ? { attachmentUrl: image, attachmentType: 'image', message: body }
    : { message: body };
}

// ─── Email ─────────────────────────────────────────────────────────────────────────────────────

/** Inline styles only — an email client strips a stylesheet and keeps the attribute. */
const S = {
  wrap: 'margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2321;',
  container: 'width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e3de;border-radius:4px;',
  intro: 'padding:20px 24px 4px 24px;font-size:15px;line-height:1.5;white-space:pre-wrap;',
  heading: 'padding:16px 24px 8px 24px;font-size:11px;font-weight:600;letter-spacing:0.02em;color:#6b6f6c;',
  table: 'width:100%;border-collapse:collapse;',
  row: 'border-top:1px solid #e3e3de;',
  imgCell: 'padding:12px 0 12px 24px;width:72px;vertical-align:top;',
  img: 'display:block;width:72px;height:72px;object-fit:cover;border-radius:4px;border:1px solid #e3e3de;',
  imgEmpty: 'display:block;width:72px;height:72px;border-radius:4px;background:#f4f4f1;border:1px solid #e3e3de;',
  textCell: 'padding:12px 12px 12px 14px;vertical-align:top;',
  name: 'font-size:14px;font-weight:600;line-height:1.35;',
  desc: 'font-size:12px;color:#6b6f6c;line-height:1.4;margin-top:2px;',
  sku: 'font-size:11px;color:#8a8e8b;margin-top:2px;',
  priceCell: 'padding:12px 24px 12px 8px;text-align:right;vertical-align:top;white-space:nowrap;',
  price: 'font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;',
  button: 'display:inline-block;margin-top:8px;padding:6px 10px;font-size:12px;font-weight:600;color:#ffffff;background:#2f6b4f;border-radius:4px;text-decoration:none;',
  footer: 'padding:12px 24px 20px 24px;font-size:11px;color:#8a8e8b;border-top:1px solid #e3e3de;',
};

/**
 * The member's words plus a table of the cards, as a complete HTML email body.
 *
 * `intro` is user-typed, `cards` are tenant data — both go through `escapeHtml`, and every
 * href/src goes through the http(s) allowlist, because an `href="javascript:…"` is a link too.
 */
export function buildEmailCardsHtml(cards: readonly InboxCard[], intro?: string | null, opts: { heading?: string } = {}): string {
  const list = cards.slice(0, INBOX_CARD_MAX);
  const heading = opts.heading
    ?? (list.every((c) => c.kind === 'service') ? 'Services we suggest' : 'Products we suggest');
  const rows = list.map((c) => {
    const img = safeImageSrc(c.image_url);
    const url = safeHref(c.url, '');
    const name = escapeHtml(c.name);
    const imgHtml = img
      ? `<img src="${escapeHtml(img)}" alt="${name}" width="72" height="72" style="${S.img}">`
      : `<div style="${S.imgEmpty}"></div>`;
    const button = url
      ? `<a href="${escapeHtml(url)}" style="${S.button}">${escapeHtml(INBOX_CARD_BUTTON_LABEL[c.kind])}</a>`
      : '';
    return `<tr style="${S.row}">`
      + `<td style="${S.imgCell}">${imgHtml}</td>`
      + `<td style="${S.textCell}">`
      + `<div style="${S.name}">${name}</div>`
      + (c.description ? `<div style="${S.desc}">${escapeHtml(clip(c.description, 160))}</div>` : '')
      + (c.sku ? `<div style="${S.sku}">Ref ${escapeHtml(c.sku)}</div>` : '')
      + '</td>'
      + `<td style="${S.priceCell}"><div style="${S.price}">${escapeHtml(c.price_line)}</div>${button}</td>`
      + '</tr>';
  }).join('');

  return `<div style="${S.wrap}"><div style="padding:24px 12px;">`
    + `<div style="${S.container}">`
    + (intro?.trim() ? `<div style="${S.intro}">${escapeHtml(intro.trim())}</div>` : '')
    + `<div style="${S.heading}">${escapeHtml(heading)}</div>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="${S.table}"><tbody>${rows}</tbody></table>`
    + `<div style="${S.footer}">Reply to this email to ask about any of these.</div>`
    + '</div></div></div>';
}

/** The text alternative of the same email: words, then the cards as lines. */
export function buildEmailCardsText(cards: readonly InboxCard[], intro?: string | null): string {
  const parts = [intro?.trim() || '', cardsToText(cards.slice(0, INBOX_CARD_MAX))].filter(Boolean);
  return parts.join('\n\n');
}
