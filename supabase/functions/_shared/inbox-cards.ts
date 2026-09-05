/**
 * Catalog cards in an Inbox message — a product or a service, suggested to the customer.
 *
 * ONE shape, stored on the message (`inbox_messages.metadata.cards`), rendered three ways:
 *
 *   • WhatsApp — Meta's interactive `cta_url` message: image header, body, one link button. Two to
 *     ten cards that all carry an image and a link go out as one media carousel; anything else goes
 *     out one message per card, degrading to image-with-caption when there is no public link and
 *     to plain text when there is no image either. All of those are SESSION messages, so the 24h
 *     window check that gates every freeform reply already gates these.
 *   • Email — an HTML table (thumbnail · name · price · button) under the member's own words, with
 *     a text alternative that lists the same cards. Every field is escaped with the canonical
 *     escaper (invariant 11); a card is tenant-authored data, and a product called `<script>` is a
 *     product called `<script>`.
 *   • In-app — the Inbox transcript and the customer's `/i/:token` page render the same cards.
 *
 * The client sends IDS ONLY. Name, image, link and — above all — the PRICE are resolved by
 * `inbox-api` for the customer on the thread, through the same `get_product_price_for_workspace`
 * resolver a quote line uses. A price typed into a chat by a member is a second derivation of a
 * money quantity, and the card would happily say €45 for a product the price list has at €54.
 *
 * Pure: no Deno APIs, no DB. Imports only the escaper, so vitest can load it directly.
 */

import { escapeHtml } from './html.ts';
import { INBOX_CARD_MAX, type InboxCardKind } from './inboxCardKinds.generated.ts';

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
  /** Whether `price` includes VAT. A consumer is quoted gross, a VAT-registered buyer net. */
  price_basis: 'net' | 'gross' | null;
  /** Where the customer lands when they tap the card. null = nowhere public to send them. */
  url: string | null;
}

/** Only an http(s) URL is allowed into an href/src or a WhatsApp link field. */
export function safeCardUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const t = u.trim();
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
}

/**
 * "€45.00 / m² incl. VAT" — or "Price on request" when the resolver reported no price.
 *
 * `Intl` with a currency style, same locale the rest of the platform prints money in. A card
 * that prints "45" with no currency is a number the customer has to guess the meaning of.
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

/** Cut to `max` characters on a word boundary, with an ellipsis. */
function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${sp > max * 0.6 ? cut.slice(0, sp) : cut}…`;
}

/**
 * The cards as plain text — for a channel with no rich layout (a social DM, the text part of an
 * email, the thread's list preview) and as the floor every rich rendering can fall back to.
 */
export function cardsToText(cards: readonly InboxCard[]): string {
  return cards.map((c) => {
    const head = `• ${c.name}${c.sku ? ` (${c.sku})` : ''} — ${cardPriceLine(c)}`;
    return c.url ? `${head}\n  ${c.url}` : head;
  }).join('\n');
}

/** What the conversation list shows for a message that is only cards. */
export function cardsPreview(cards: readonly InboxCard[]): string {
  if (!cards.length) return '';
  const kind = cards.every((c) => c.kind === 'service') ? 'service' : 'product';
  return cards.length === 1 ? `${cards[0].name}` : `${cards.length} ${kind}s suggested`;
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
const WA_BUTTON_MAX = 20;
const WA_CAROUSEL_BODY_MAX = 160;
const WA_CAROUSEL_MIN = 2;

const BUTTON_LABEL: Record<InboxCardKind, string> = { product: 'View product', service: 'View service' };

function ctaAction(card: InboxCard): Record<string, unknown> {
  return {
    name: 'cta_url',
    parameters: { display_text: BUTTON_LABEL[card.kind].slice(0, WA_BUTTON_MAX), url: card.url },
  };
}

/** The body of a single-card message: the member's words, then the card's own facts. */
function cardBody(card: InboxCard, intro: string | undefined, max: number): string {
  const facts = [card.name, cardPriceLine(card), card.description ? clip(card.description, 240) : null]
    .filter(Boolean).join('\n');
  const text = intro ? `${intro.trim()}\n\n${facts}` : facts;
  return clip(text, max);
}

/**
 * Cards → the WhatsApp sends that carry them.
 *
 * `intro` is the member's typed text. With one card it becomes the message body above the
 * card's facts; with several it goes out first as its own text message, then the cards follow —
 * a carousel has no top-level body of its own beyond one line, and a paragraph does not fit.
 */
export function buildWhatsAppCardMessages(cards: readonly InboxCard[], intro?: string | null): WhatsAppCardMessage[] {
  const list = cards.slice(0, INBOX_CARD_MAX);
  const text = intro?.trim() || undefined;
  if (!list.length) return text ? [{ message: text }] : [];

  // One card: the intro rides inside the interactive body.
  if (list.length === 1) return [singleCardMessage(list[0], text)];

  const out: WhatsAppCardMessage[] = [];
  const carouselable = list.length >= WA_CAROUSEL_MIN && list.every((c) => c.url && c.image_url);
  if (carouselable) {
    out.push({
      interactive: {
        type: 'carousel',
        body: { text: clip(text || 'A few options for you:', WA_BODY_MAX) },
        action: {
          cards: list.map((c, i) => ({
            card_index: i,
            type: 'cta_url',
            header: { type: 'image', image: { link: c.image_url } },
            body: { text: clip(`${c.name}\n${cardPriceLine(c)}`, WA_CAROUSEL_BODY_MAX) },
            action: ctaAction(c),
          })),
        },
      },
      linkPreview: false,
    });
    return out;
  }

  if (text) out.push({ message: text });
  for (const c of list) out.push(singleCardMessage(c, undefined));
  return out;
}

function singleCardMessage(card: InboxCard, intro: string | undefined): WhatsAppCardMessage {
  const footer = [card.sku ? `Ref ${card.sku}` : null, card.unit ? `per ${card.unit}` : null]
    .filter(Boolean).join(' · ');
  if (card.url) {
    const interactive: Record<string, unknown> = {
      type: 'cta_url',
      header: card.image_url
        ? { type: 'image', image: { link: card.image_url } }
        : { type: 'text', text: clip(card.name, WA_HEADER_TEXT_MAX) },
      body: { text: cardBody(card, intro, WA_BODY_MAX) },
      action: ctaAction(card),
    };
    if (footer) interactive.footer = { text: clip(footer, WA_FOOTER_MAX) };
    return { interactive, linkPreview: false };
  }
  // No public page to link: the image with the facts as its caption, or the facts alone.
  const caption = cardBody(card, intro, WA_BODY_MAX);
  return card.image_url
    ? { attachmentUrl: card.image_url, attachmentType: 'image', message: caption }
    : { message: caption };
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
 * `intro` is user-typed, `cards` are tenant data — both go through `escapeHtml`, and URLs are
 * additionally refused unless http(s), because an `href="javascript:…"` is a link too.
 */
export function buildEmailCardsHtml(cards: readonly InboxCard[], intro?: string | null, opts: { heading?: string } = {}): string {
  const list = cards.slice(0, INBOX_CARD_MAX);
  const heading = opts.heading
    ?? (list.every((c) => c.kind === 'service') ? 'Services we suggest' : 'Products we suggest');
  const rows = list.map((c) => {
    const img = safeCardUrl(c.image_url);
    const url = safeCardUrl(c.url);
    const name = escapeHtml(c.name);
    const imgHtml = img
      ? `<img src="${escapeHtml(img)}" alt="${name}" width="72" height="72" style="${S.img}">`
      : `<div style="${S.imgEmpty}"></div>`;
    const button = url
      ? `<a href="${escapeHtml(url)}" style="${S.button}">${escapeHtml(BUTTON_LABEL[c.kind])}</a>`
      : '';
    return `<tr style="${S.row}">`
      + `<td style="${S.imgCell}">${imgHtml}</td>`
      + `<td style="${S.textCell}">`
      + `<div style="${S.name}">${name}</div>`
      + (c.description ? `<div style="${S.desc}">${escapeHtml(clip(c.description, 160))}</div>` : '')
      + (c.sku ? `<div style="${S.sku}">Ref ${escapeHtml(c.sku)}</div>` : '')
      + '</td>'
      + `<td style="${S.priceCell}"><div style="${S.price}">${escapeHtml(cardPriceLine(c))}</div>${button}</td>`
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
