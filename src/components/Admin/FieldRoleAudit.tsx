/**
 * Field-role audit (#347 phase 4.5).
 *
 * "Identity" means a product can be more than one of these at once, so a buyer must pick — size,
 * colour, finish. "Descriptive" means it describes whatever was already picked — PEI rating,
 * warranty. The distinction decides what the quote/order picker offers, what the warehouse keys
 * stock on, and what a price may belong to.
 *
 * This screen is AUDIT AND OVERRIDE, never a gate. Classification happens automatically at
 * ingest; nothing waits here for approval. A review queue would mean ingest stalls whenever
 * nobody is looking, which is how the old material_properties table ended up holding nothing at
 * all while the pipeline kept running.
 *
 * What it shows is what was decided, by WHICH signal, and why — because "the classifier said so"
 * is not reviewable. The signal matters more than the verdict: `warehouse_feedback` means two
 * stocked rows physically differed, which is not an opinion, while `seed` means a heuristic
 * guessed during the 3.1 rebuild and nothing has revisited it since.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FieldRow {
  field_name: string;
  display_name: string | null;
  role: string;
  classified_signal: string | null;
  classified_confidence: number | null;
  classified_reason: string | null;
  classified_at: string | null;
  applies_to_categories: string[] | null;
  is_global: boolean | null;
}

/**
 * Strength order, mirroring the `classify_field_role` RPC. Shown so an operator can see at a
 * glance whether a verdict rests on evidence or on a guess — and the RPC, not this list, is what
 * enforces it.
 */
const SIGNAL_RANK: Record<string, number> = {
  operator: 6, warehouse_feedback: 5, sku_correlation: 4, plurality: 3, llm: 2, seed: 1,
};

const SIGNAL_LABEL: Record<string, string> = {
  operator: 'set by a person',
  warehouse_feedback: 'two stocked rows differed',
  sku_correlation: 'the catalogue mapped variants to SKUs',
  plurality: 'the catalogue listed several values',
  llm: 'model verdict',
  seed: 'heuristic seed — never revisited',
};

export const FieldRoleAudit: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('material_metadata_fields')
      .select('field_name, display_name, role, classified_signal, classified_confidence, classified_reason, classified_at, applies_to_categories, is_global')
      .eq('status', 'active')
      .order('field_name');
    if (error) {
      toast({ title: 'Could not load the registry', description: error.message, variant: 'destructive' });
    }
    setRows((data ?? []) as FieldRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const override = async (field: FieldRow, role: string) => {
    setSaving(field.field_name);
    try {
      // Through the SAME RPC every automatic signal uses. An operator outranks all of them and
      // is the only signal that may push past the demotion veto — deliberately, since the point
      // of an override is to disagree with the evidence on purpose.
      const { data, error } = await supabase.rpc('classify_field_role', {
        p_field_name: field.field_name,
        p_role: role,
        p_signal: 'operator',
        p_confidence: 1,
        p_reason: 'Set from the field-role audit screen.',
      });
      if (error) throw error;
      const res = data as { applied?: boolean; reason?: string } | null;
      if (res && res.applied === false) {
        toast({ title: 'Not applied', description: res.reason ?? 'refused', variant: 'destructive' });
      } else {
        toast({ title: `${field.field_name} is now ${role}` });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Override failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (signalFilter !== 'all' && (r.classified_signal ?? 'seed') !== signalFilter) return false;
      if (!q) return true;
      return r.field_name.toLowerCase().includes(q) || (r.display_name ?? '').toLowerCase().includes(q);
    });
  }, [rows, filter, signalFilter]);

  const counts = useMemo(() => {
    const identity = rows.filter((r) => r.role === 'identity').length;
    // A verdict still resting on the heuristic seed is the one worth chasing: nothing has
    // looked at it since the registry was rebuilt.
    const unrevisited = rows.filter((r) => (r.classified_signal ?? 'seed') === 'seed').length;
    return { identity, descriptive: rows.length - identity, unrevisited };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Field roles
        </CardTitle>
        <CardDescription>
          What each field was classified as, which signal decided it, and why. Overriding takes
          effect immediately — this screen never holds ingest up.
        </CardDescription>
        <div className="flex flex-wrap gap-4 pt-2 text-sm">
          <span><span className="font-medium">{counts.identity}</span> identity</span>
          <span><span className="font-medium">{counts.descriptive}</span> descriptive</span>
          {counts.unrevisited > 0 && (
            <span className="text-warning flex items-center gap-1">
              <TriangleAlert className="h-3.5 w-3.5" />
              {counts.unrevisited} still on the heuristic seed
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-wrap gap-2 p-3 border-b border-border/40">
          <Input
            className="h-8 w-56 text-xs"
            placeholder="Filter by field name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Select value={signalFilter} onValueChange={setSignalFilter}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every signal</SelectItem>
              {Object.keys(SIGNAL_RANK)
                .sort((a, b) => SIGNAL_RANK[b] - SIGNAL_RANK[a])
                .map((s) => <SelectItem key={s} value={s}>{SIGNAL_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the registry…
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No field matches that filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Decided by</th>
                <th className="px-3 py-2 font-medium">Why</th>
                <th className="px-3 py-2 font-medium">Override</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const signal = r.classified_signal ?? 'seed';
                return (
                  <tr key={r.field_name} className="border-b border-border/30 align-top">
                    <td className="px-3 py-2">
                      <div>{r.display_name || r.field_name}</div>
                      <div className="text-xs text-muted-foreground">{r.field_name}</div>
                    </td>
                    {/* Status as a plain coloured word — never a filled badge (design system). */}
                    <td className={`px-3 py-2 ${r.role === 'identity' ? 'text-primary' : 'text-muted-foreground'}`}>
                      {r.role}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className={signal === 'seed' ? 'text-warning' : ''}>{SIGNAL_LABEL[signal] ?? signal}</div>
                      {r.classified_confidence != null && (
                        <div className="text-muted-foreground">
                          confidence {Math.round(Number(r.classified_confidence) * 100)}%
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-md">
                      {r.classified_reason || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={saving === r.field_name}
                        onClick={() => override(r, r.role === 'identity' ? 'descriptive' : 'identity')}
                      >
                        {saving === r.field_name
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : `make ${r.role === 'identity' ? 'descriptive' : 'identity'}`}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};
