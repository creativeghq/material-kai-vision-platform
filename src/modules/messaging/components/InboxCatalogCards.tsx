/**
 * Catalog cards on an Inbox message — the in-app rendering of `inbox_messages.metadata.cards`.
 *
 * ONE component for both readers: the member's transcript in `InboxPage` and the customer's
 * `/i/:token` page. The card says what the customer was told: the name, the image, the price
 * THEY were quoted (gross for a consumer, net for a VAT-registered buyer — decided server-side
 * when the message was sent) and the same link the WhatsApp button or the email button carries.
 * A card with no link is a card with no button, not a button to an app route the customer
 * cannot open.
 */

import React from 'react';
import { ExternalLink, Package, Wrench } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import type { InboxCard } from '@/services/inboxApi';

/** "€45.00 / m² incl. VAT" — the same wording the email and WhatsApp renderings print. */
export function inboxCardPriceLine(card: Pick<InboxCard, 'price' | 'currency' | 'unit' | 'price_basis'>): string {
  if (card.price == null || !Number.isFinite(Number(card.price))) return 'Price on request';
  const unit = card.unit ? ` / ${card.unit}` : '';
  const basis = card.price_basis === 'gross' ? ' incl. VAT' : card.price_basis === 'net' ? ' excl. VAT' : '';
  return `${formatMoney(Number(card.price), card.currency || 'EUR')}${unit}${basis}`;
}

export function readInboxCards(metadata: unknown): InboxCard[] {
  const cards = (metadata as { cards?: unknown } | null | undefined)?.cards;
  if (!Array.isArray(cards)) return [];
  return cards.filter((c): c is InboxCard => !!c && typeof c === 'object' && typeof (c as InboxCard).product_id === 'string');
}

export const InboxCatalogCards: React.FC<{ cards: InboxCard[]; className?: string }> = ({ cards, className }) => {
  if (!cards.length) return null;
  return (
    <div className={`mt-2 grid gap-2 ${cards.length > 1 ? 'sm:grid-cols-2' : ''} ${className || ''}`}>
      {cards.map((c) => {
        const Icon = c.kind === 'service' ? Wrench : Package;
        return (
          <div key={c.product_id} className="flex gap-3 rounded-sm border border-hairline bg-card p-2 text-left text-foreground">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
              {c.image_url
                ? <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Icon className="h-6 w-6" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{c.name}</div>
              {c.sku && <div className="text-[11px] text-muted-foreground">Ref {c.sku}</div>}
              <div className="mt-0.5 text-xs tabular-nums">{inboxCardPriceLine(c)}</div>
              {c.url && (
                <a
                  href={c.url} target="_blank" rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {c.kind === 'service' ? 'View service' : 'View product'} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
