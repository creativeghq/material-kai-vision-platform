/**
 * Catalog cards on an Inbox message — the in-app rendering of `inbox_messages.metadata.cards`.
 *
 * ONE component for both readers: the member's transcript in `InboxPage` and the customer's
 * `/i/:token` page. The card says what the customer was told: the name, the image, the price
 * line the server derived once for THEM (gross for a consumer, net for a business buyer) and the
 * same link the WhatsApp button or the email button carries. A card with no link is a card with
 * no button, not a button to an app route the customer cannot open — and a link or image that
 * is not http(s) is not rendered at all, because the card is tenant data.
 */

import React from 'react';
import { ExternalLink, Package, Wrench } from 'lucide-react';
import { safeHref, safeImageSrc } from '@/utils/safeUrl';
import { INBOX_CARD_BUTTON_LABEL } from '@/modules/messaging/inboxCardKinds';
import type { InboxCard } from '@/services/inboxApi';

/**
 * The cards on a message. A member's read carries the whole `metadata`; a customer's read
 * (`get_thread` as a client, `token_get_thread`) is column-listed and projects only
 * `cards:metadata->cards` to the top level — so both shapes are read here, and nothing else in
 * `metadata` is ever needed to render a card.
 */
export function readInboxCards(m: { metadata?: unknown; cards?: unknown } | null | undefined): InboxCard[] {
  const fromMeta = (m?.metadata as { cards?: unknown } | null | undefined)?.cards;
  const cards = Array.isArray(fromMeta) ? fromMeta : m?.cards;
  if (!Array.isArray(cards)) return [];
  return cards.filter((c): c is InboxCard => !!c && typeof c === 'object' && typeof (c as InboxCard).product_id === 'string');
}

export const InboxCatalogCards: React.FC<{ cards: InboxCard[]; className?: string }> = ({ cards, className }) => {
  if (!cards.length) return null;
  return (
    <div className={`mt-2 grid gap-2 ${cards.length > 1 ? 'sm:grid-cols-2' : ''} ${className || ''}`}>
      {cards.map((c) => {
        const Icon = c.kind === 'service' ? Wrench : Package;
        const img = safeImageSrc(c.image_url);
        const href = safeHref(c.url, '');
        return (
          <div key={c.product_id} className="flex gap-3 rounded-sm border border-hairline bg-card p-2 text-left text-foreground">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
              {img
                ? <img src={img} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Icon className="h-6 w-6" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{c.name}</div>
              {c.sku && <div className="text-[11px] text-muted-foreground">Ref {c.sku}</div>}
              <div className="mt-0.5 text-xs tabular-nums">{c.price_line}</div>
              {href && (
                <a
                  href={href} target="_blank" rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {INBOX_CARD_BUTTON_LABEL[c.kind]} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
