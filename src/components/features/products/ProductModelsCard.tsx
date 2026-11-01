import React, { useMemo, useState } from 'react';
import { Layers, Search } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import type { ModelTable } from './productModelTable';

const FOLDED_ROWS = 30;
const FILTER_MIN_ROWS = 8;

interface ProductModelsCardProps {
  table: ModelTable;
}

export const ProductModelsCard: React.FC<ProductModelsCardProps> = ({ table }) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? table.rows.filter(r => r.model.toLowerCase().includes(q)) : table.rows;
  }, [table.rows, query]);
  const filtering = query.trim() !== '';
  const shown = expanded || filtering ? rows : rows.slice(0, FOLDED_ROWS);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4" />
            Models
          </CardTitle>
          <Badge variant="neutral">{table.rows.length === 1 ? '1 model' : `${table.rows.length} models`}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {table.rows.length > FILTER_MIN_ROWS && (
          <div className="relative min-w-[12rem]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Find a model"
              aria-label="Search models"
              className="h-9 pl-8"
            />
          </div>
        )}

        {rows.length === 0 ? (
          <HubEmptyState
            variant="filtered"
            icon={Search}
            title={`No model matches “${query}”`}
            action={<Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  {table.columns.map(c => (
                    <TableHead key={c.key} className={c.numeric ? 'text-right' : undefined}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(r => (
                  <TableRow key={r.model}>
                    <TableCell className="font-medium">{r.model}</TableCell>
                    {table.columns.map(c => (
                      <TableCell key={c.key} className={c.numeric ? 'text-right tabular-nums' : undefined}>
                        {r.cells[c.key] ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!filtering && rows.length > FOLDED_ROWS && (
              <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(e => !e)}>
                {expanded ? 'Show fewer' : `Show all ${rows.length} models`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
