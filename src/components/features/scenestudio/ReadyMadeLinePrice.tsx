/** The kitchen priced from a supplier's ready-made line (#604 phase 7): each unit matched to a code, priced in a front series, by SQL. */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Tags } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { KITCHEN_KINDS, MODULE_LABELS } from '@/lib/scene/kitchenComposition';
import { sceneStudioService, type LinePricing, type ReadyMadeLine, type SceneObject } from '@/services/sceneStudioService';
import { formatMoney } from '@/utils/decimal';

export const ReadyMadeLinePrice: React.FC<{ objects: SceneObject[] }> = ({ objects }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<ReadyMadeLine[] | null>(null);
  const [lineKey, setLineKey] = useState<string | null>(null);
  const [series, setSeries] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinePricing | null>(null);
  const hasKitchen = objects.some((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind));

  useEffect(() => {
    if (!hasKitchen || lines) return;
    void sceneStudioService.readyMadeLines().then(setLines).catch(() => setLines([]));
  }, [hasKitchen, lines]);

  const line = useMemo(() => lines?.find((l) => `${l.supplier}|${l.product_line}` === lineKey) ?? null, [lines, lineKey]);
  if (!hasKitchen || !lines?.length) return null;

  const price = async () => {
    if (!line || !series) return;
    setBusy(true);
    try {
      setResult(await sceneStudioService.priceFromLine(line, series, objects));
    } catch (e) {
      toast({ title: 'The line could not price this kitchen', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <Label className="text-xs">Ready-Made Line</Label>
      <Select value={lineKey ?? undefined} onValueChange={(v) => { setLineKey(v); setSeries(null); setResult(null); }}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a cabinet line" /></SelectTrigger>
        <SelectContent>
          {lines.map((l) => <SelectItem key={`${l.supplier}|${l.product_line}`} value={`${l.supplier}|${l.product_line}`} className="text-xs">{l.supplier} · {l.product_line}</SelectItem>)}
        </SelectContent>
      </Select>
      {line && (
        <Select value={series ?? undefined} onValueChange={(v) => { setSeries(v); setResult(null); }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose the front series" /></SelectTrigger>
          <SelectContent>{line.series.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={!line || !series || busy} onClick={() => void price()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tags className="h-3.5 w-3.5" />}Price From This Line
      </Button>
      {result && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold tabular-nums">{formatMoney(result.total, 'EUR')}</span>
            <span className="text-muted-foreground">supplier net, {result.matched} of {result.matched + result.unmatched} units</span>
          </div>
          <ul className="space-y-0.5">
            {result.units.map((u, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className={u.code ? 'truncate text-muted-foreground' : 'truncate text-amber-800 dark:text-amber-300'}>
                  {MODULE_LABELS[u.type] ?? u.type} {Math.round(u.width_mm / 10)} cm · {u.code ?? 'no code in this line'}
                </span>
                <span className="shrink-0 tabular-nums">{u.price != null ? formatMoney(u.price, 'EUR') : '—'}</span>
              </li>
            ))}
          </ul>
          {result.unmatched > 0 && <p className="text-amber-800 dark:text-amber-300">Units with no code are not in the total. Change their width or type in the run, or choose another line.</p>}
        </div>
      )}
    </div>
  );
};
