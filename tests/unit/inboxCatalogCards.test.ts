/**
 * Guard: a product suggested from the Inbox reaches the customer in the CHANNEL's own shape,
 * priced for THEM, and never carries anything a member typed as HTML.
 *
 * The properties that make the feature a feature, each of which rots silently:
 *
 *   1. The client sends IDS ONLY and inbox-api resolves the card — name, image, link and above
 *      all the price — for the customer on the thread, through the same price resolver a quote
 *      line uses. A price typed into a chat is a second derivation of a money quantity.
 *   2. WhatsApp gets an interactive `cta_url` card (image header, body, link button) or a media
 *      carousel — never a pasted URL. A card with no public page degrades to image-with-caption,
 *      and to plain text with no image; it never links to an app route the customer cannot open.
 *   3. The email HTML escapes EVERY field with the canonical escaper, refuses non-http(s) URLs
 *      in href/src, and carries a text alternative listing the same cards.
 *   4. The relay branches fire for a cards-only message (no typed text), or the member sees a
 *      bubble the customer never received.
 *   5. `manage_inbox` can READ a thread (transcript + the customer's orders) with the customer's
 *      words fenced as data, and the customer-audience account tools include `list_orders`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  buildEmailCardsHtml, buildEmailCardsText, buildWhatsAppCardMessages, cardPriceLine, cardsToText,
  safeCardUrl, INBOX_CARD_MAX, type InboxCard,
} from '../../supabase/functions/_shared/inbox-cards.ts';
import { INBOX_CARD_KINDS, inboxCardKindForCommand } from '../../src/modules/messaging/inboxCardKinds';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (p: string) => stripComments(read(p));

const INBOX_API = 'supabase/functions/inbox-api/index.ts';
const INBOX_TOOLS = 'supabase/functions/_shared/tools/inbox-tools.ts';
const ACCOUNT_TOOLS = 'supabase/functions/_shared/tools/customer-account-tools.ts';
const ZERNIO = 'supabase/functions/_shared/zernio.ts';

function card(over: Partial<InboxCard> = {}): InboxCard {
  return {
    kind: 'product',
    product_id: '11111111-1111-4111-8111-111111111111',
    name: 'Oak decking 28×145',
    description: 'Thermally modified oak, smooth both sides.',
    sku: 'OAK-28145',
    image_url: 'https://cdn.example.com/oak.jpg',
    price: 54.5,
    currency: 'EUR',
    unit: 'm²',
    price_basis: 'gross',
    url: 'https://app.materialshub.gr/store/acme?product=11111111-1111-4111-8111-111111111111',
    ...over,
  };
}

describe('the price line says what the number is', () => {
  it('prints currency, unit and whether VAT is included', () => {
    expect(cardPriceLine(card())).toBe('€54.50 / m² incl. VAT');
    expect(cardPriceLine(card({ price_basis: 'net', unit: null }))).toBe('€54.50 excl. VAT');
  });
  it('an unpriced product says so instead of printing 0', () => {
    expect(cardPriceLine(card({ price: null, price_basis: null }))).toBe('Price on request');
  });
});

describe('WhatsApp gets an interactive card, not a pasted URL', () => {
  it('one card with an image and a link is a cta_url message with an image header', () => {
    const [m, ...rest] = buildWhatsAppCardMessages([card()], 'Have a look at this one.');
    expect(rest).toHaveLength(0);
    expect(m.interactive?.type).toBe('cta_url');
    expect((m.interactive as any).header).toEqual({ type: 'image', image: { link: 'https://cdn.example.com/oak.jpg' } });
    expect((m.interactive as any).action.parameters.url).toBe(card().url);
    expect((m.interactive as any).action.parameters.display_text.length).toBeLessThanOrEqual(20);
    // The member's words are the body, above the card's own facts.
    expect((m.interactive as any).body.text).toMatch(/^Have a look at this one\./);
    expect((m.interactive as any).body.text).toContain('€54.50 / m² incl. VAT');
    // The text is not ALSO sent as a plain message with a link preview of the same page.
    expect(m.message).toBeUndefined();
    expect(m.linkPreview).toBe(false);
  });

  it('a card with a link but no image gets a text header', () => {
    const [m] = buildWhatsAppCardMessages([card({ image_url: null })]);
    expect((m.interactive as any).header).toEqual({ type: 'text', text: 'Oak decking 28×145' });
  });

  it('a card with no public page is an image with a caption, never a button to nowhere', () => {
    const [m] = buildWhatsAppCardMessages([card({ url: null })], 'This one?');
    expect(m.interactive).toBeUndefined();
    expect(m.attachmentUrl).toBe('https://cdn.example.com/oak.jpg');
    expect(m.attachmentType).toBe('image');
    expect(m.message).toContain('Oak decking');
    expect(m.message).toContain('€54.50');
  });

  it('a card with neither is plain text', () => {
    const [m] = buildWhatsAppCardMessages([card({ url: null, image_url: null })]);
    expect(m).toEqual({ message: expect.stringContaining('Oak decking 28×145') });
  });

  it('several cards that all have image and link go out as one media carousel', () => {
    const cards = [card(), card({ product_id: '22222222-2222-4222-8222-222222222222', name: 'Ash decking' })];
    const out = buildWhatsAppCardMessages(cards, 'Two options:');
    expect(out).toHaveLength(1);
    const iv = out[0].interactive as any;
    expect(iv.type).toBe('carousel');
    expect(iv.body.text).toBe('Two options:');
    expect(iv.action.cards).toHaveLength(2);
    for (const c of iv.action.cards) {
      expect(c.type).toBe('cta_url');
      expect(c.header.type).toBe('image');
      expect(c.action.name).toBe('cta_url');
      expect(c.body.text.length).toBeLessThanOrEqual(160);
    }
  });

  it('a mixed set (one card without an image) is the text first, then one message per card', () => {
    const cards = [card(), card({ product_id: '22222222-2222-4222-8222-222222222222', image_url: null })];
    const out = buildWhatsAppCardMessages(cards, 'Two options:');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ message: 'Two options:' });
    expect(out[1].interactive?.type).toBe('cta_url');
    expect(out[2].interactive?.type).toBe('cta_url');
  });

  it('never carries more than the message cap, and the cap is the carousel maximum', () => {
    expect(INBOX_CARD_MAX).toBe(10);
    const many = Array.from({ length: 14 }, (_, i) =>
      card({ product_id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000` }));
    const out = buildWhatsAppCardMessages(many);
    expect((out[0].interactive as any).action.cards).toHaveLength(10);
  });

  it('a body longer than Meta allows is cut, not refused', () => {
    const [m] = buildWhatsAppCardMessages([card()], 'x'.repeat(3000));
    expect((m.interactive as any).body.text.length).toBeLessThanOrEqual(1024);
  });
});

describe('the email table escapes everything and links only to http(s)', () => {
  it('a product named like markup is printed as text, not run as markup', () => {
    const html = buildEmailCardsHtml([card({ name: '<script>alert(1)</script>', description: 'a "quoted" & odd', sku: "O'K" })], 'Hi <b>there</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; odd');
    expect(html).toContain('O&#39;K');
    expect(html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
  });

  it('a javascript: image or link is dropped, an https one is kept', () => {
    const html = buildEmailCardsHtml([card({ image_url: 'javascript:alert(1)', url: 'javascript:alert(2)' })]);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
    const ok = buildEmailCardsHtml([card()]);
    expect(ok).toContain(`href="${card().url}"`);
    expect(ok).toContain('src="https://cdn.example.com/oak.jpg"');
    expect(safeCardUrl('ftp://x')).toBeNull();
    expect(safeCardUrl(' https://x.example/a ')).toBe('https://x.example/a');
  });

  it('prints the same price line the card shows, and a button per linked card', () => {
    const html = buildEmailCardsHtml([card()]);
    expect(html).toContain('€54.50 / m² incl. VAT');
    expect(html).toContain('View product');
    expect(html).toContain('Products we suggest');
    expect(buildEmailCardsHtml([card({ kind: 'service' })])).toContain('Services we suggest');
  });

  it('the text alternative lists the same cards with their links', () => {
    const text = buildEmailCardsText([card()], 'Hello');
    expect(text.startsWith('Hello\n\n')).toBe(true);
    expect(text).toContain('• Oak decking 28×145 (OAK-28145) — €54.50 / m² incl. VAT');
    expect(text).toContain(card().url);
    expect(cardsToText([card({ url: null })])).not.toContain('http');
  });
});

describe('inbox-api resolves the card server-side and relays a cards-only message', () => {
  const api = () => code(INBOX_API);

  it('accepts picks on send_message and resolves them for the thread — never trusting a client price', () => {
    const src = api();
    expect(src).toMatch(/resolveInboxCards\(db, thread, payload\.cards\)/);
    // Members only: a customer has no catalog to push.
    expect(src).toMatch(/access\.isMember \? await resolveInboxCards/);
    const fn = src.slice(src.indexOf('async function resolveInboxCards'), src.indexOf('async function insertMessageAndNotify'));
    expect(fn).toMatch(/\.eq\('workspace_id', workspaceId\)\.in\('id', ids\)/);
    expect(fn).toMatch(/resolveLinePrice\(db, \{/);
    expect(fn).not.toMatch(/price:\s*(r|raw|pick)\./);
    // Gross for a consumer, net for a VAT-registered buyer.
    expect(fn).toMatch(/party\.vatRegistered \? net : grossFromNet\(net, vatPct\)/);
    // A link only to a page the customer can open.
    expect(fn).toMatch(/storefront_published/);
    expect(fn).toMatch(/\/store\/\$\{encodeURIComponent\(slug\)\}\?product=/);
    expect(fn).not.toMatch(/\/discover\?product=/);
  });

  it('every relay branch fires for a message that is only cards', () => {
    const src = api();
    expect(src).toMatch(/thread\.channel === 'whatsapp'[\s\S]{0,120}\(body \|\| attachments\.length > 0 \|\| cards\.length > 0\)/);
    expect(src).toMatch(/thread\.channel === 'social'[\s\S]{0,80}\(body \|\| cards\.length\)/);
    expect(src).toMatch(/thread\.channel === 'email'[\s\S]{0,80}\(body \|\| cards\.length\)/);
    expect(src).toMatch(/message body, attachment or catalog card required/);
  });

  it('WhatsApp sends the interactive shape and stops at the first failed card; email sends html + text', () => {
    const src = api();
    expect(src).toMatch(/buildWhatsAppCardMessages\(cards, body\)/);
    expect(src).toMatch(/firstFailure = String/);
    expect(src).toMatch(/html: buildEmailCardsHtml\(cards, body\)/);
    expect(src).toMatch(/text: cards\.length \? buildEmailCardsText\(cards, body\) : body/);
    expect(code(ZERNIO)).toMatch(/if \(params\.interactive\) body\.interactive = params\.interactive;/);
  });

  it('the catalog picker is scoped by the THREAD workspace and members only', () => {
    const src = api();
    const fn = src.slice(src.indexOf("case 'search_catalog'"), src.indexOf("case 'approve_intake'"));
    expect(fn).toMatch(/if \(!access\.isMember\) throw new HttpError\(403/);
    expect(fn).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    // The query reaches a PostgREST filter: operator characters are stripped first.
    expect(fn).toMatch(/replace\(\/\[\^\\p\{L\}\\p\{N\}\\s\\-\]\/gu/);
  });

  it('the rail and the customer tools read order settlement from the one derivation', () => {
    expect(api()).toMatch(/rpc\('get_order_settlements'/);
    expect(code(ACCOUNT_TOOLS)).toMatch(/rpc\('get_order_settlements'/);
    expect(code(ACCOUNT_TOOLS)).toMatch(/'list_orders'/);
    expect(code(ACCOUNT_TOOLS)).toMatch(/\.eq\('order_type', 'sales'\)/);
  });
});

describe('the operator steer for "Draft with AI" rides outside the customer fence', () => {
  it('inbox-api forwards it as its own field, agent-chat appends it after fencing', () => {
    expect(code(INBOX_API)).toMatch(/operator_instruction: billedTo\.operatorInstruction/);
    const chat = code('supabase/functions/agent-chat/index.ts');
    const fenceAt = chat.indexOf('userInput = fenceCustomerMessage(String(userInput));');
    const steerAt = chat.indexOf('operatorInstructionBlock(bodyOperatorInstruction)');
    expect(fenceAt).toBeGreaterThan(0);
    expect(steerAt).toBeGreaterThan(fenceAt);
    // Only inside the customer-audience branch, which only the service-role caller can enter.
    expect(chat.slice(fenceAt, steerAt)).not.toMatch(/\n    \}\n/);
  });
});

describe('JARVIS can read a conversation, with the customer words fenced', () => {
  it('manage_inbox has a read action that returns transcript + orders and wraps customer text', () => {
    const src = code(INBOX_TOOLS);
    expect(src).toMatch(/z\.enum\(\['list', 'read', 'reply'/);
    expect(src).toMatch(/action === 'read'/);
    expect(src).toMatch(/wrapUntrusted\('customer message', m\.body, 600\)/);
    expect(src).toMatch(/orders: c\.data\?\.orders/);
  });
});

describe('the card-kind vocabulary is one list on both sides', () => {
  it('maps the slash commands, singular or plural, to a kind', () => {
    expect(INBOX_CARD_KINDS).toEqual(['product', 'service']);
    expect(inboxCardKindForCommand('/products')).toBe('product');
    expect(inboxCardKindForCommand('service')).toBe('service');
    expect(inboxCardKindForCommand('/order')).toBeNull();
  });
});
