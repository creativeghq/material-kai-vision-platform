import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { packagingByFormat, type PackagingFormatRow } from './productDisplayUnits';

const COLUMNS: Array<{ key: keyof PackagingFormatRow['values']; label: string; unit?: string }> = [
  { key: 'pieces_per_box', label: 'Pieces / Box' },
  { key: 'm2_per_box', label: 'm² / Box' },
  { key: 'boxes_per_pallet', label: 'Boxes / Pallet' },
  { key: 'm2_per_pallet', label: 'm² / Pallet' },
  { key: 'weight_per_pallet_kg', label: 'Pallet Weight', unit: 'kg' },
];

export function PackagingByFormatTable({ packaging }: { packaging: unknown }) {
  const rows = packagingByFormat(packaging);
  if (rows.length === 0) return null;
  const showPallet = rows.some(r => r.pallet);
  const anyEstimated = rows.some(r => r.estimated.size > 0);
  return (
    <div className="space-y-1.5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            {showPallet && <TableHead>Pallet</TableHead>}
            {COLUMNS.map(c => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.format}-${r.pallet ?? ''}-${i}`}>
              <TableCell className="text-xs font-medium">{r.format ?? '—'}</TableCell>
              {showPallet && <TableCell className="text-xs">{r.pallet ?? '—'}</TableCell>}
              {COLUMNS.map(c => {
                const v = r.values[c.key];
                const est = r.estimated.has(c.key);
                return (
                  <TableCell key={c.key} className="text-right text-xs tabular-nums" title={est ? `Estimated: ${r.basis ?? ''}` : undefined}>
                    {v === null ? '—' : `${v}${c.unit ? ` ${c.unit}` : ''}`}
                    {est && v !== null && <span className="ml-1 text-[11px] text-muted-foreground">est.</span>}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {anyEstimated && (
        <p className="text-[11px] text-muted-foreground">
          est. = not published by the supplier; taken from the same brand&apos;s identical size. Hover a value for its basis.
        </p>
      )}
    </div>
  );
}
