/**
 * How supplier lines from the Expenses (myDATA) Inbox reach the warehouse.
 *
 * Three modes, per workspace, stored on `finance_settings.warehouse_autosync_mode`:
 *   off     — don't read supplier lines at all (no AI call, no credits, no queue)
 *   suggest — extract + queue for review (the default, and what the platform did before)
 *   auto    — additionally add CERTAIN matches straight to stock; everything else still queues
 *
 * "Certain" is deliberately narrow: score 1.0, meaning the supplier's own item code identifies
 * stock we already carry. Anything softer is a language-model guess about a supplier's free-text
 * line, and a wrong auto-add writes a real stock movement — wrong qty_on_hand is expensive to
 * unwind, so it waits for a human.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'off' | 'suggest' | 'auto';

const HELP: Record<Mode, string> = {
  off: 'Supplier invoice lines are ignored. Nothing is extracted and the intake queue stays empty.',
  suggest: 'Every supplier line is turned into a suggested product and queued below for you to review, edit and add.',
  auto: 'Lines that match stock you already carry by supplier item code are added automatically. Everything else is queued for review.',
};

export const WarehouseAutosyncCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('suggest');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('finance_settings')
        .select('warehouse_autosync_mode').eq('workspace_id', workspaceId).maybeSingle();
      if (!cancelled) {
        setMode(((data as any)?.warehouse_autosync_mode as Mode) ?? 'suggest');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const save = async (next: Mode) => {
    const prev = mode;
    setMode(next); setSaving(true);
    const { error } = await supabase.from('finance_settings')
      .update({ warehouse_autosync_mode: next }).eq('workspace_id', workspaceId);
    setSaving(false);
    if (error) {
      setMode(prev);
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved', description: HELP[next] });
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center gap-2 space-y-0">
        <Wand2 className="h-4 w-4 text-muted-foreground" />
        <CardTitle>Stock intake from supplier invoices</CardTitle>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="px-5 py-4 space-y-2">
        <div className="flex items-center gap-3">
          <Select value={mode} onValueChange={(v) => save(v as Mode)}>
            <SelectTrigger className="h-9 w-64 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off — ignore supplier lines</SelectItem>
              <SelectItem value="suggest">Suggest — queue for review (recommended)</SelectItem>
              <SelectItem value="auto">Automatic — add certain matches to stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{HELP[mode]}</p>
        {mode === 'auto' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Automatic additions write real stock movements. Only exact supplier-code matches qualify —
            a new product is never created without you.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
