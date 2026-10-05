import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Check, Smile, Package, Wrench, Slash } from 'lucide-react';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/core/ui/command';
import { INBOX_CARD_MAX, type InboxCardKind } from '@/modules/messaging/inboxCardKinds';
import { INBOX_SLASH_COMMANDS, slashCommandMatches } from '../inboxSlashCommands';
import { Button } from '@/components/core/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { inboxApi, type InboxCatalogItem } from '@/services/inboxApi';
import { money } from '../inboxFormat';

/**
 * A compact emoji picker for the composer.
 *
 * Hand-rolled rather than a dependency: a full picker library is ~1MB of emoji metadata for a
 * feature that is "put a 👍 in the message". These are the ones people actually use in a business
 * chat, grouped so the list is scannable rather than a wall.
 */
export const COMPOSER_EMOJI: Array<{ group: string; emoji: string[] }> = [
  { group: 'Common', emoji: ['👍', '🙏', '👌', '👏', '🙌', '💪', '🤝', '✅', '❌', '⚠️'] },
  { group: 'Faces', emoji: ['🙂', '😊', '😃', '😉', '😍', '🤔', '😅', '😂', '😢', '😮'] },
  { group: 'Work', emoji: ['📦', '📸', '📄', '📐', '🔧', '🚚', '🏗️', '🧱', '🪵', '🪟'] },
  { group: 'Signals', emoji: ['🔥', '⭐', '💡', '⏰', '📌', '💰', '📈', '🎉', '❤️', '👀'] },
];

export const SlashCommandMenu: React.FC<{
  query: string;
  onChoose: (kind: InboxCardKind) => void;
  onClose: () => void;
}> = ({ query, onChoose, onClose }) => {
  const matches = slashCommandMatches(query);
  if (!matches.length) return null;
  return (
    <div className="rounded-sm border border-hairline bg-card shadow-overlay overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-hairline bg-surface-sunken px-3 py-1.5 text-[11px] text-muted-foreground">
        <Slash className="h-3 w-3" /> Commands · Enter picks the first
        <button type="button" onClick={onClose} className="ml-auto hover:text-foreground" title="Close"><X className="h-3 w-3" /></button>
      </div>
      {matches.map((c, i) => (
        <button
          key={c.command}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChoose(c.kind); }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-hover ${i === 0 ? 'bg-surface-hover/60' : ''}`}
        >
          {c.kind === 'service' ? <Wrench className="h-4 w-4 text-muted-foreground" /> : <Package className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium">{c.label}</span>
          <span className="text-xs text-muted-foreground">{c.hint}</span>
        </button>
      ))}
    </div>
  );
};

/**
 * The `/product` / `/service` picker. Searches the thread's workspace catalog as you type; a
 * pick toggles the item into the pending cards (several at once, up to the message cap). The
 * list price shown here is orientation — the customer's price is resolved when the message is
 * sent, for the customer on the thread.
 */
export const CatalogPicker: React.FC<{
  threadId: string;
  kind: InboxCardKind;
  picked: InboxCatalogItem[];
  onKind: (kind: InboxCardKind) => void;
  onToggle: (item: InboxCatalogItem) => void;
  onClose: () => void;
}> = ({ threadId, kind, picked, onKind, onToggle, onClose }) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<InboxCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Debounced: the search (an edge invocation) runs once the typing has settled, and only
    // then does the list show as loading.
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await inboxApi.searchCatalog(threadId, query, kind);
        if (alive) { setItems(res.items); setFailed(null); }
      } catch (e) {
        if (alive) { setItems([]); setFailed((e as Error).message); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [threadId, query, kind]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.product_id)), [picked]);
  const full = picked.length >= INBOX_CARD_MAX;

  return (
    <div className="rounded-sm border border-hairline bg-card shadow-overlay overflow-hidden">
      <div className="flex items-center gap-1 border-b border-hairline bg-surface-sunken px-2 py-1.5 text-xs">
        {INBOX_SLASH_COMMANDS.map((c) => (
          <button
            key={c.command}
            type="button"
            aria-pressed={c.kind === kind}
            onClick={() => onKind(c.kind)}
            className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 ${c.kind === kind ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-hover'}`}
          >
            {c.kind === 'service' ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />} {c.label}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground tabular-nums">{picked.length}/{INBOX_CARD_MAX}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onClose}>Done</Button>
      </div>
      <Command
        shouldFilter={false}
        className="rounded-none"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      >
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={kind === 'service' ? 'Search your services…' : 'Search products by name or SKU…'}
        />
        <CommandList className="max-h-64">
          {failed ? (
            <div className="p-3 text-xs text-destructive">Could not search the catalog: {failed}</div>
          ) : loading && items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</div>
          ) : (
            <CommandEmpty>
              {query
                ? 'Nothing matches that name or SKU.'
                : kind === 'service'
                  ? 'You have not listed any services. Add them under Finance → Settings → Services.'
                  : 'The catalog is empty. Import or add products under Products first.'}
            </CommandEmpty>
          )}
          <CommandGroup>
            {items.map((it) => {
              const on = pickedIds.has(it.product_id);
              return (
                <CommandItem
                  key={it.product_id}
                  value={it.product_id}
                  disabled={!on && full}
                  onSelect={() => onToggle(it)}
                  className="gap-3"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xs border border-hairline bg-surface-sunken">
                    {it.image_url
                      ? <img src={it.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {it.kind === 'service' ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                      </div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {[it.sku ? `Ref ${it.sku}` : null, it.description].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {it.list_price != null ? `${money(it.list_price, it.currency)}${it.unit ? `/${it.unit}` : ''}` : '—'}
                  </div>
                  {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
};

export const EmojiPicker: React.FC<{ onPick: (emoji: string) => void; disabled?: boolean }> = ({ onPick, disabled }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button" title="Insert emoji" disabled={disabled}
          className="p-2 rounded-sm hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none"
        >
          <Smile className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="max-h-64 overflow-y-auto space-y-2">
          {COMPOSER_EMOJI.map(({ group, emoji }) => (
            <div key={group}>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1 px-0.5">{group}</div>
              <div className="grid grid-cols-10 gap-0.5">
                {emoji.map((e) => (
                  <button
                    key={e} type="button"
                    // Stays open: picking two in a row is normal, and a picker that closes on
                    // every choice makes "😊👍" three clicks instead of two.
                    onClick={() => onPick(e)}
                    className="text-lg leading-none rounded-sm py-1 hover:bg-surface-hover"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
