import { useMemo, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  type Cell, type ColumnRole, type SkuColumn, type SkuTable, DISCONTINUED, MADE_TO_ORDER, NO_FILTER,
  distinctValues, filterRows, formatCell, isFiltering, normaliseLabel, summarise,
} from './productSkuTable';

const FOLDED_ROWS = 30;
const FILTER_MIN_ROWS = 8;
const ALL = '__all__';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  active: 'success',
  [normaliseLabel(DISCONTINUED)]: 'warning',
  [normaliseLabel(MADE_TO_ORDER)]: 'info',
  'standard range': 'neutral',
};

function CellView({ column, value, hexByName }: { column: SkuColumn; value: Cell; hexByName: Record<string, string> }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const text = formatCell(value);
  if (column.role === 'status' || column.role === 'availability') {
    return <Badge variant={STATUS_VARIANT[normaliseLabel(text)] ?? 'neutral'}>{text}</Badge>;
  }
  if (column.role === 'colour') {
    const hex = hexByName[normaliseLabel(text)];
    return (
      <span className="inline-flex items-center gap-2">
        {hex && <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-hairline" style={{ backgroundColor: hex }} />}
        {text}
      </span>
    );
  }
  return <>{text}</>;
}

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className="h-9 w-[10.5rem]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`All ${label.toLowerCase()}`}</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SkuTableCard({ table, hexByName }: { table: SkuTable; hexByName: Record<string, string> }) {
  const [filter, setFilter] = useState(NO_FILTER);
  const [expanded, setExpanded] = useState(false);
  const counts = useMemo(() => summarise(table), [table]);
  const rows = useMemo(() => filterRows(table, filter), [table, filter]);
  const options = useMemo(() => {
    const out = {} as Record<ColumnRole, string[]>;
    for (const role of ['colour', 'size', 'status', 'availability'] as const) out[role] = distinctValues(table, role);
    return out;
  }, [table]);

  const filtering = isFiltering(filter);
  const shown = expanded || filtering ? rows : rows.slice(0, FOLDED_ROWS);
  const patch = (p: Partial<typeof filter>) => setFilter(f => ({ ...f, ...p }));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListChecks className="h-4 w-4" />
            {table.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{counts.total === 1 ? '1 item' : `${counts.total} items`}</Badge>
            {counts.discontinued > 0 && <Badge variant="warning">{counts.discontinued} discontinued</Badge>}
            {counts.madeToOrder > 0 && <Badge variant="info">{counts.madeToOrder} made to order</Badge>}
          </div>
        </div>
        {table.source && <p className="text-xs text-muted-foreground">{table.source}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {table.rows.length > FILTER_MIN_ROWS && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter.query}
                onChange={e => patch({ query: e.target.value })}
                placeholder="Search code, colour, size"
                aria-label="Search this table"
                className="h-9 pl-8"
              />
            </div>
            <FilterSelect label="Colours" value={filter.colour} options={options.colour} onChange={v => patch({ colour: v })} />
            <FilterSelect label="Sizes" value={filter.size} options={options.size} onChange={v => patch({ size: v })} />
            <FilterSelect label="Statuses" value={filter.status} options={options.status} onChange={v => patch({ status: v })} />
            <FilterSelect label="Availability" value={filter.availability} options={options.availability} onChange={v => patch({ availability: v })} />
          </div>
        )}

        {rows.length === 0 ? (
          <HubEmptyState
            variant="filtered"
            icon={Search}
            title="No items match these filters"
            action={<Button variant="outline" size="sm" onClick={() => setFilter(NO_FILTER)}>Clear filters</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map(c => (
                    <TableHead key={c.index} className={c.numeric ? 'text-right' : undefined}>{c.header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r, i) => (
                  <TableRow key={`${table.id}-${i}`}>
                    {table.columns.map(c => (
                      <TableCell key={c.index} className={c.numeric ? 'text-right tabular-nums' : undefined}>
                        <CellView column={c} value={r[c.index]} hexByName={hexByName} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!filtering && rows.length > FOLDED_ROWS && (
              <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(e => !e)}>
                {expanded ? 'Show fewer' : `Show all ${rows.length} items`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

