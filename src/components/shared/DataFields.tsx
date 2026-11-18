import React from 'react';

import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const LIST_CAP = 10;

const Empty = () => <span className="text-muted-foreground">—</span>;

const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

const formatPrimitive = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return formatNumber(v, { maxDecimals: 3 });
  if (typeof v === 'string' && ISO_TS.test(v)) return formatDate(v, { withTime: true });
  return String(v);
};

const Value: React.FC<{ value: unknown; depth: number }> = ({ value, depth }) => {
  if (value == null || value === '') return <Empty />;
  if (isPrimitive(value)) {
    return <span className={typeof value === 'number' ? 'tabular-nums' : 'whitespace-pre-wrap break-words'}>{formatPrimitive(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    if (value.every(isPrimitive)) return <span className="break-words">{value.map(formatPrimitive).join(', ')}</span>;
    const shown = value.slice(0, LIST_CAP);
    return (
      <ol className="space-y-2">
        {shown.map((item, i) => (
          <li key={i} className="rounded-sm border border-hairline bg-card p-2"><Value value={item} depth={depth + 1} /></li>
        ))}
        {value.length > shown.length && (
          <li className="text-muted-foreground">…and {formatNumber(value.length - shown.length)} more</li>
        )}
      </ol>
    );
  }
  if (depth > 4) return <code className="break-all">{JSON.stringify(value)}</code>;
  return <Fields data={value as Record<string, unknown>} depth={depth + 1} />;
};

const Fields: React.FC<{ data: Record<string, unknown>; depth: number }> = ({ data, depth }) => {
  const entries = Object.entries(data);
  if (entries.length === 0) return <Empty />;
  return (
    <dl className={depth > 0 ? 'grid gap-1 border-l border-hairline pl-3' : 'grid gap-1'}>
      {entries.map(([key, v]) => (
        <div key={key} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3">
          <dt className="text-muted-foreground">{humanizeLabel(key)}</dt>
          <dd className="min-w-0"><Value value={v} depth={depth} /></dd>
        </div>
      ))}
    </dl>
  );
};

/** Any JSON payload as labelled fields; `raw` adds a collapsed "Raw data" view of the original. */
export const DataFields: React.FC<{ data: unknown; raw?: boolean; className?: string }> = ({ data, raw = false, className }) => (
  <div className={className}>
    <Value value={data} depth={-1} />
    {raw && data != null && (
      <details className="mt-2">
        <summary className="cursor-pointer text-muted-foreground">Raw data</summary>
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-hairline bg-surface-sunken p-2 text-[11px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    )}
  </div>
);
