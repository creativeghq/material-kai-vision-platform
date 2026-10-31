import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { SkuTableCard } from './SkuTableCard';
import { type SkuTable, colourHexIndex, toSkuTable } from './productSkuTable';

const MAX_TABLES = 60;

type Load =
  | { kind: 'loading' }
  | { kind: 'loaded'; tables: SkuTable[]; hidden: number; capped: boolean }
  | { kind: 'failed'; reason: string };

interface Props {
  productId: string;
  colourOptions?: unknown;
  canSeeInternal?: boolean;
}

export function ProductSkuTables({ productId, colourOptions, canSeeInternal = false }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const hexByName = useMemo(() => colourHexIndex(colourOptions), [colourOptions]);

  useEffect(() => {
    let live = true;
    setLoad({ kind: 'loading' });
    supabase
      .from('product_tables')
      .select('id, headers, table_data, extractor, metadata, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
      .limit(MAX_TABLES)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setLoad({ kind: 'failed', reason: error.message }); return; }
        const rows = data ?? [];
        const tables = rows.map(r => toSkuTable(r, canSeeInternal)).filter((t): t is SkuTable => t !== null);
        setLoad({ kind: 'loaded', tables, hidden: rows.length - tables.length, capped: rows.length >= MAX_TABLES });
      }, (e: unknown) => {
        if (live) setLoad({ kind: 'failed', reason: e instanceof Error ? e.message : 'request failed' });
      });
    return () => { live = false; };
  }, [productId, canSeeInternal]);

  if (load.kind === 'loading') return null;
  if (load.kind === 'failed') {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-destructive">Item tables could not be loaded</span>
        {' '}— this is not a statement that the product has none. {load.reason}
      </p>
    );
  }
  if (load.tables.length === 0 && load.hidden === 0) return null;
  return (
    <div className="space-y-4">
      {load.tables.map(t => <SkuTableCard key={t.id} table={t} hexByName={hexByName} />)}
      {load.hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {`${load.hidden} raw table fragment${load.hidden === 1 ? '' : 's'} read from the source PDF ${load.hidden === 1 ? 'is' : 'are'} not shown.`}
          {load.capped && ` Only the first ${MAX_TABLES} tables were loaded.`}
        </p>
      )}
    </div>
  );
}
