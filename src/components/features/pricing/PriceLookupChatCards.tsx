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

const GRADE_LABEL: Record<string, string> = { lower: 'Lower Qualities', second_choice: 'Second Choice' };

const basisOf = (r: ResolutionRow): number => {
  if (r.status === 'discount_applied') return 2;
  if (r.status.startsWith('list_price')) return 3;
  return r.grade && r.grade !== 'standard' ? 1 : 0;
};

const groupKey = (r: ResolutionRow) => {
  const rules = (r.applied_rules ?? []).map((a) => a.rule_id).sort().join(',');
  return [r.supplier, basisOf(r), basisOf(r) === 1 ? r.grade : '', rules].join('|');
};

const groupTitle = (r: ResolutionRow) => {
  const basis = basisOf(r);
  if (basis === 2) return `${r.supplier} · List Price ${discountText(r) ?? ''}`.trim();
  if (basis === 3) return `${r.supplier} · List Price (No Discount On File)`;
  if (basis === 1) return `${r.supplier} · Purchase Price · ${GRADE_LABEL[r.grade ?? ''] ?? 'Other Grade'}`;
  return `${r.supplier} · Purchase Price`;
};

const sourceName = (r: ResolutionRow) => r.section?.split(' - ')[0]?.trim() || r.product_line?.split(' - ')[0]?.trim() || null;

const sourcesLine = (g: ResolutionRow[]) => {
  const seen = new Map<string, string | null>();
  for (const r of g) {
    const name = sourceName(r);
    if (name && !seen.has(name)) seen.set(name, r.effective_date ?? null);
  }
  return [...seen].map(([name, date]) => (date ? `${name} (${date})` : name)).join(' · ');
};

const statusTag = (r: ResolutionRow) => {
  if (r.status === 'discount_applied') return <Badge variant="info">List − Discount</Badge>;
  if (r.status.startsWith('list_price')) return <Badge variant="warning">List Price Only</Badge>;
  return <Badge variant="success">Purchase Price</Badge>;
};

/** The resolved purchase prices of a `price_lookup` call, one table per price basis — two lists with the same discount are one table. */
export const PriceResolutionTable: React.FC<{ data: { rows?: ResolutionRow[] } }> = ({ data }) => {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No price rows matched.</div>;

  const groups = new Map<string, ResolutionRow[]>();
  for (const r of rows) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);
  const ordered = [...groups.values()].sort((a, b) => basisOf(a[0]) - basisOf(b[0]));

  return (
    <div className="space-y-4">
      {ordered.map((g) => {
        const first = g[0];
        const quotes = [...new Set(g.flatMap((r) => (r.applied_rules ?? []).map((a) => a.quote).filter(Boolean) as string[]))];
        const warnings = [...new Set(g.flatMap((r) => r.warnings ?? []))];
        const sources = sourcesLine(g);
        return (
          <div key={groupKey(first)} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold">{groupTitle(first)}</h3>
              {sources && <span className="text-xs text-muted-foreground">From {sources}</span>}
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
