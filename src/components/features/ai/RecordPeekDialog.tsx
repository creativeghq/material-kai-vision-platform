/**
 * RecordPeekDialog — the detail behind a row in an agent result card.
 *
 * A tool answers "show me the last five expenses" with a table. Until now that table was where the
 * conversation stopped: the rows were records, and there was nothing to click. The obvious fix —
 * import each module's own detail dialog — does not scale past the first one (PartyDetailDialog
 * alone wants a party row, an aging bag and a finance base) and gives the 127 result types 127
 * different answers to the same question.
 *
 * So the detail is derived ONCE, in SQL: `get_record_peek(kind, id)` returns a title, a badge, the
 * fields worth reading and the records this one points at — for every kind, under the caller's own
 * RLS. This component formats that and nothing more; adding a kind is a migration, not a new
 * component, which is what makes "more interactive" land on every tool rather than on one.
 *
 * Two destinations, and they are not the same thing:
 *   • a kind WITH a page (`company`, `order`, `invoice`, …) offers "Open" — a new tab, so the chat
 *     the reader is mid-way through is still there when they come back.
 *   • a kind WITHOUT one (`expense`, `payment`, `contract`) offers its LIST, labelled as the list.
 *     Calling that "open the record" would be a button whose whole effect is to name a place.
 *
 * Related records push onto a stack rather than replacing, so supplier → their order → the project
 * is one trip with a Back at every step.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, ArrowLeft, Loader2, Link2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import { safeHref } from '@/utils/safeUrl';
import { statusBadgeVariant, labelizeValue } from '@/utils/recordDisplay';
import {
  recordSpec, recordRoute, recordListRoute, canOpenRecordKind,
  type RecordRef,
} from '@/config/recordLinks';
import type { SearchRouteContext, KindGateContext } from '@/config/searchKinds';

export interface RecordPeekField {
  label: string;
  value: string | number | boolean | null;
  format?: 'money' | 'date' | 'status' | 'number' | 'percent' | 'email' | 'phone' | 'url' | 'days';
  currency?: string | null;
}

export interface RecordPeek {
  kind: string;
  id: string;
  title: string | null;
  subtitle: string | null;
  badge: string | null;
  fields: RecordPeekField[];
  links: Array<{ kind: string; id: string; label: string; title: string | null }>;
}

/** SQL named the format; this turns it into the string a person reads. */
function renderFieldValue(field: RecordPeekField): React.ReactNode {
  const { value, format } = field;
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  switch (format) {
    case 'money':
      return <span className="tabular-nums">{formatMoney(Number(value), field.currency || 'EUR')}</span>;
    case 'date':
      return <span>{formatDate(String(value))}</span>;
    case 'percent':
      return <span className="tabular-nums">{Number(value)}%</span>;
    case 'days':
      return <span className="tabular-nums">{Number(value)} days</span>;
    case 'number':
      return <span className="tabular-nums">{String(value)}</span>;
    case 'status':
      return <Badge variant={statusBadgeVariant(String(value))}>{labelizeValue(String(value))}</Badge>;
    case 'email':
      return <a href={safeHref(`mailto:${value}`)} className="text-primary hover:underline break-all">{String(value)}</a>;
    case 'phone': {
      // The scheme is fixed by the template, so the stored value can never choose one — which is
      // why this is not a `safeHref` call: its allowlist has no `tel:` and would inert the link.
      const telHref = `tel:${String(value).replace(/\s+/g, '')}`;
      return <a href={telHref} className="text-primary hover:underline">{String(value)}</a>;
    }
    case 'url':
      return (
        <a href={safeHref(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
          {String(value)}
        </a>
      );
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

interface RecordPeekDialogProps {
  /** The record to describe; null closes the dialog. */
  record: RecordRef | null;
  onClose: () => void;
  /** Role facts the destination routes branch on — the same two the ⌘K palette passes. */
  routeContext: SearchRouteContext;
  /** The gates that decide whether a link may be offered at all. */
  gateContext: KindGateContext;
}

export const RecordPeekDialog: React.FC<RecordPeekDialogProps> = ({
  record, onClose, routeContext, gateContext,
}) => {
  // The drill-down stack. `stack[stack.length - 1]` is what is on screen; everything below it is
  // where Back goes.
  const [stack, setStack] = useState<RecordRef[]>([]);
  const [peek, setPeek] = useState<RecordPeek | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStack(record ? [record] : []);
  }, [record]);

  const current = stack[stack.length - 1] ?? null;
  const spec = recordSpec(current?.kind);

  useEffect(() => {
    if (!current) { setPeek(null); return; }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      // Imported HERE, not at the top: this component is reached from `AgentResultCard`, whose
      // own render test drives it outside every provider — and the client module THROWS at load
      // when the env is absent. A static import would make the card unimportable to gain a dialog
      // nothing has opened yet.
      const { supabase } = await import('@/integrations/supabase/client');
      // Not in the generated types yet — `types:generate` needs an access token this checkout
      // lacks (same cast `globalSearch` carries, same reason).
      const { data, error } = await (supabase as any).rpc('get_record_peek', {
        p_kind: current.kind,
        p_id: current.id,
      });
      if (cancelled) return;
      setLoading(false);
      // A read that FAILED and a record that is genuinely gone are different answers, and the
      // dialog says which — the silent-zero rule applies to one record as much as to a metric.
      if (error) { setFailed(true); setPeek(null); return; }
      setPeek((data as RecordPeek | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [current]);

  const openInNewTab = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  if (!current || !spec) return null;

  const title = peek?.title || current.title || spec.label;
  const pageHref = canOpenRecordKind(current.kind, gateContext)
    ? recordRoute(current.kind, current.id, routeContext)
    : null;
  const listHref = !pageHref && canOpenRecordKind(current.kind, gateContext)
    ? recordListRoute(current.kind)
    : null;
  const Icon = spec.icon;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-2">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={() => setStack((s) => s.slice(0, -1))}
                aria-label="Back"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Icon className="mt-1 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{title}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{spec.label}</span>
                {peek?.subtitle && <span className="truncate">· {peek.subtitle}</span>}
                {peek?.badge && (
                  <Badge variant={statusBadgeVariant(peek.badge)}>{labelizeValue(peek.badge)}</Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the record…
          </div>
        )}

        {!loading && failed && (
          <p className="py-6 text-sm text-muted-foreground">
            We could not read this record just now. It still exists — the lookup failed, which is
            not the same as it being empty.
          </p>
        )}

        {!loading && !failed && !peek && (
          <p className="py-6 text-sm text-muted-foreground">
            This record is no longer available to you — it may have been deleted, or it belongs to
            another workspace.
          </p>
        )}

        {!loading && peek && (
          <div className="space-y-4">
            {peek.fields.length > 0 && (
              <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-2 text-sm">
                {peek.fields.map((f) => (
                  <React.Fragment key={f.label}>
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="min-w-0 text-foreground">{renderFieldValue(f)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}

            {peek.links.length > 0 && (
              <div className="border-t border-hairline pt-3">
                <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Related</div>
                <div className="flex flex-wrap gap-1.5">
                  {peek.links
                    .filter((l) => canOpenRecordKind(l.kind, gateContext))
                    .map((l) => {
                      const linkSpec = recordSpec(l.kind);
                      const LinkIcon = linkSpec?.icon ?? Link2;
                      return (
                        <button
                          key={`${l.kind}-${l.id}-${l.label}`}
                          type="button"
                          onClick={() => setStack((s) => [...s, { kind: l.kind as RecordRef['kind'], id: l.id, title: l.title }])}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline px-2 py-1 text-xs text-foreground transition-colors hover:bg-primary/10"
                          title={`${l.label}: ${l.title || linkSpec?.label || l.kind}`}
                        >
                          <LinkIcon className="h-3 w-3 shrink-0 text-primary" />
                          <span className="truncate">{l.title || l.label}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {(pageHref || listHref) && (
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openInNewTab((pageHref || listHref) as string)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {pageHref ? `Open ${spec.label.toLowerCase()}` : `Open in ${spec.label}s`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RecordPeekDialog;
