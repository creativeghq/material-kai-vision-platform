/**
 * The cutting allowance per laying pattern (#447).
 *
 * Deliberately empty until somebody sets one: herringbone and a stack bond do not waste the same
 * tile, and a rate we invented would turn an honest "unknown" into a confident short order.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { PATTERNS, PATTERN_LABELS, type Pattern } from '@/lib/surfaceRenderer';
import { visualizerService } from '@/services/visualizerService';

interface Props {
  workspaceId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

export const WastageRatesCard: React.FC<Props> = ({ workspaceId, canEdit, onChanged }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Partial<Record<Pattern, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Pattern | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visualizerService.listWastageRates(workspaceId);
      const next: Partial<Record<Pattern, string>> = {};
      for (const r of rows) next[r.pattern] = String(r.percent);
      setDraft(next);
    } catch {
      setDraft({});
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (pattern: Pattern) => {
    const raw = (draft[pattern] ?? '').trim();
    setBusy(pattern);
    try {
      if (raw === '') {
        await visualizerService.clearWastageRate(workspaceId, pattern);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          toast({ title: 'That is not a percentage', description: 'Give a number between 0 and 100.', variant: 'destructive' });
          return;
        }
        await visualizerService.setWastageRate(workspaceId, pattern, n);
      }
      onChanged?.();
      toast({ title: 'Allowance saved', description: `${PATTERN_LABELS[pattern]} updated.` });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cutting allowance</CardTitle>
        <CardDescription>
          The extra material each laying pattern costs in cuts. Until a pattern has one, the
          visualizer reports the area and the piece count but refuses to call either an order
          quantity — a short delivery of tile comes back as a second batch in a different tone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading allowances…
          </div>
        ) : (
          <div className="grid gap-1.5">
            {PATTERNS.map((p) => {
              const value = draft[p] ?? '';
              return (
                <div key={p} className="flex items-center gap-2 border-b border-hairline py-1.5 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-xs">{PATTERN_LABELS[p]}</span>
                  {value === '' && (
                    <span className="text-[11px] text-muted-foreground">not set</span>
                  )}
                  <Input
                    value={value}
                    onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
                    disabled={!canEdit}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`Cutting allowance for ${PATTERN_LABELS[p]}, percent`}
                    className="h-7 w-20 text-right text-xs tabular-nums"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={busy === p}
                      onClick={() => void save(p)}
                    >
                      {busy === p ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                    </Button>
                  )}
                </div>
              );
            })}
            {!canEdit && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Only a workspace admin can change these.
              </p>
            )}
            {canEdit && (
              <Button variant="ghost" size="sm" className="mt-1 h-7 justify-self-start px-2 text-xs" onClick={() => void load()}>
                <RotateCcw className="mr-1 h-3 w-3" /> Reload
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
