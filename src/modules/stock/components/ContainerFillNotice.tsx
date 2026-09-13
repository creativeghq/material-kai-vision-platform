/**
 * What the flagged resupply would do to a container (#439).
 *
 * Every published fill algorithm is volume-first, and for tile that is wrong: a 20ft box hits its
 * ~28 t payload at about 14-15 m³ against a ~33 m³ cube, so a volume-first packer builds a
 * container that looks correct on screen and cannot be lifted.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Container, Loader2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  containerFillService, loadIsAFloor, loadIsOverweight, headroomKg,
  type ContainerFill, type ContainerType,
} from '@/modules/stock/services/containerFillService';

export const ContainerFillNotice: React.FC<{
  workspaceId: string;
  /** The lines a buyer is about to order — the resupply candidates they have flagged. */
  lines: { product_id: string; quantity: number }[];
}> = ({ workspaceId, lines }) => {
  const [types, setTypes] = useState<ContainerType[]>([]);
  const [container, setContainer] = useState('20GP');
  const [fill, setFill] = useState<ContainerFill | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const signature = lines.map((l) => `${l.product_id}:${l.quantity}`).join('|');

  useEffect(() => {
    let cancelled = false;
    containerFillService.types()
      .then((t) => { if (!cancelled) setTypes(t); })
      .catch(() => { if (!cancelled) setTypes([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || lines.length === 0) { setFill(null); return; }
    setLoading(true);
    containerFillService.fill(workspaceId, lines, container)
      .then((f) => { if (!cancelled) { setFill(f); setFailed(false); } })
      .catch(() => { if (!cancelled) { setFill(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `signature` is the only input that matters; `lines` is a fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, signature, container]);

  if (lines.length === 0) return null;

  const headroom = headroomKg(fill);

  return (
    <div
      className={`flex flex-wrap items-start gap-2 rounded-md border p-2 text-xs ${
        loadIsOverweight(fill)
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : loadIsAFloor(fill)
            ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
            : 'border-hairline bg-surface-sunken text-muted-foreground'
      }`}
    >
      {loadIsOverweight(fill) || loadIsAFloor(fill)
        ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        : <Container className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-1">
        {loading && !fill && (
          <p className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Weighing the load…
          </p>
        )}
        {failed && (
          <p>
            The load could not be weighed just now. That is not a statement that it fits.
          </p>
        )}
        {fill && <p>{fill.reason}</p>}
        {headroom != null && headroom > 0 && (
          <p className="tabular-nums">
            {headroom} kg of headroom. Topping up means reaching for this same supplier&rsquo;s other
            lines — there is no consolidation between suppliers.
          </p>
        )}
      </div>
      {types.length > 0 && (
        <Select value={container} onValueChange={setContainer}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Container type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {types.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
