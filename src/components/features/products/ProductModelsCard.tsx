import React, { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import type { ModelTable } from './productModelTable';

interface ProductModelsCardProps {
  table: ModelTable;
}

export const ProductModelsCard: React.FC<ProductModelsCardProps> = ({ table }) => {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? table.rows.filter(r => r.model.toLowerCase().includes(q)) : table.rows;
  }, [table.rows, query]);

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Models ({table.rows.length})
        </h3>
        {table.rows.length > 8 && (
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a model"
            className="h-8 w-44 text-xs"
          />
        )}
      </div>
      <div className="table-scroll max-h-[28rem] overflow-y-auto -mx-6 -mb-6">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-surface-sunken [&_th]:border-b [&_th]:border-hairline">
            <tr className="text-[11px] font-semibold text-muted-foreground">
              <th className="text-left px-6 py-2.5 whitespace-nowrap">Model</th>
              {table.columns.map(c => (
                <th key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.model} className="border-b border-hairline hover:bg-surface-hover transition-colors">
                <td className="px-6 py-2 font-mono font-semibold whitespace-nowrap">{r.model}</td>
                {table.columns.map(c => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 whitespace-nowrap ${c.numeric ? 'text-right tabular-nums' : 'text-left text-muted-foreground'}`}
                  >
                    {r.cells[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={table.columns.length + 1} className="px-6 py-4 text-muted-foreground">
                  No model matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
