import React from 'react';

import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { formatMoney } from '@/utils/decimal';

import type { ResolutionRow } from './PriceResolutionCard';

const money = (n: number | string | null | undefined, currency?: string | null) =>
  n == null || n === '' || Number.isNaN(Number(n)) ? '—' : formatMoney(Number(n), currency || 'EUR');

const shortUnit = (u?: string | null) => (u ? u.split(' (')[0] : '—');

const discountText = (r: ResolutionRow): string | null => {
  const rule = r.applied_rules?.[0];
  if (!rule?.percents?.length) return null;
  return rule.percents.map((p) => `−${p}%`).join(' then ');
};

const groupKey = (r: ResolutionRow) => r.doc_slug || r.doc_id || r.supplier;

const groupTitle = (r: ResolutionRow) => {
  const line = r.product_line?.split(' - ')[0]?.trim();
  return [r.supplier, line && line !== r.supplier ? line : null].filter(Boolean).join(' · ');
};

const statusTag = (r: ResolutionRow) => {
  if (r.status === 'discount_applied') return <Badge variant="info">List − Discount</Badge>;
  if (r.status.startsWith('list_price')) return <Badge variant="warning">List Price Only</Badge>;
  return <Badge variant="success">Purchase Price</Badge>;
};

/** The resolved purchase prices of a `price_lookup` call, one table per price list. */
export const PriceResolutionTable: React.FC<{ data: { rows?: ResolutionRow[] } }> = ({ data }) => {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No price rows matched.</div>;

  const groups = new Map<string, ResolutionRow[]>();
  for (const r of rows) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);

  return (
    <div className="space-y-4">
      {[...groups.values()].map((g) => {
        const first = g[0];
        const quotes = [...new Set(g.flatMap((r) => (r.applied_rules ?? []).map((a) => a.quote).filter(Boolean) as string[]))];
        const warnings = [...new Set(g.flatMap((r) => r.warnings ?? []))];
        return (
          <div key={groupKey(first)} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold">{groupTitle(first)}</h3>
              {first.effective_date && <span className="text-xs text-muted-foreground">List of {first.effective_date}</span>}
            </div>
            {quotes.map((q) => <p key={q} className="text-xs text-muted-foreground">Discount: {q}</p>)}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Printed</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Incl. VAT</TableHead>
                  <TableHead>Basis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.map((r) => (
                  <TableRow key={r.row_id}>
                    <TableCell className="min-w-[180px]">{r.item_text}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.price_label}</TableCell>
                    <TableCell className="whitespace-nowrap">{shortUnit(r.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.printed_net, r.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap">{discountText(r) ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{money(r.final_net, r.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.final_gross, r.currency)}</TableCell>
                    <TableCell>{statusTag(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {warnings.length > 0 && (
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface LookupMatch { doc_id?: string; doc_title?: string; doc_type?: string; snippet?: string }

const UNTRUSTED_FRAME = /^(\[\[(BEGIN|END) UNTRUSTED.*|source: .*|The text between these markers.*)$/;

const cleanSnippet = (s?: string) =>
  (s ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !UNTRUSTED_FRAME.test(l)).join('\n').slice(0, 400);

/** The knowledge-base documents a `price_lookup` read when no structured price row answered. */
export const PriceLookupSources: React.FC<{ data: { matches?: LookupMatch[] } }> = ({ data }) => {
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  if (matches.length === 0) return <div className="text-sm text-muted-foreground">No pricing documents matched.</div>;
  return (
    <ul className="space-y-3">
      {matches.map((m, i) => (
        <li key={`${m.doc_id ?? i}`} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{m.doc_title || 'Untitled'}</span>
            {m.doc_type && m.doc_type !== 'unknown' && <Badge variant="neutral">{m.doc_type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line break-words">{cleanSnippet(m.snippet)}</p>
        </li>
      ))}
    </ul>
  );
};
