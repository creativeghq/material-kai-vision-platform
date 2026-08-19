import React, { useCallback, useEffect, useState } from 'react';
import { Route, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, type LeadRoutingRule } from '../services/realEstateService';
import { HubEmptyState } from '@/components/core/hub';

/**
 * Lead routing rules. Inbound leads used to sit on the listing until somebody noticed; response time
 * is the whole game on a buyer enquiry.
 *
 * A rule matches on the LISTING's town / region / postcode prefix — leave a field empty to mean
 * "don't care", which is how you build a catch-all. Highest priority (lowest number) wins, then the
 * lead is dealt round-robin to the next agent on that desk.
 *
 * Broker-only: routing decides who GETS the leads, so an agent editing it would be handing
 * themselves the desk. The API enforces that too — this just doesn't render the controls.
 */
export const LeadRoutingCard: React.FC<{ ws: string | null; canManage: boolean }> = ({ ws, canManage }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<LeadRoutingRule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ name: string; towns: string; regions: string; postcodes: string; agents: string; priority: string } | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    try { setRules(await realEstateService.listRoutingRules(ws)); } catch { setRules([]); }
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!ws || !draft?.name.trim()) return;
    setBusy(true);
    try {
      await realEstateService.upsertRoutingRule(ws, {
        name: draft.name.trim(),
        match_towns: draft.towns as never, match_regions: draft.regions as never,
        match_postcode_prefixes: draft.postcodes as never, agent_user_ids: draft.agents as never,
        priority: Number(draft.priority) || 100,
      });
      setDraft(null); await load(); toast({ title: 'Routing rule saved' });
    } catch (e) { toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const toggle = async (r: LeadRoutingRule, on: boolean) => {
    if (!ws) return;
    setRules((prev) => prev?.map((x) => x.id === r.id ? { ...x, is_active: on } : x) ?? null);
    try { await realEstateService.upsertRoutingRule(ws, { rule_id: r.id, is_active: on }); }
    catch (e) { void load(); toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' }); }
  };

  const remove = async (r: LeadRoutingRule) => {
    if (!ws) return;
    try { await realEstateService.deleteRoutingRule(ws, r.id); await load(); }
    catch (e) { toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (rules === null) return null;
  if (!canManage && rules.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Route className="h-4 w-4" /> Lead routing</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            New leads are dealt automatically. The first matching rule by priority wins; inside it, leads go round-robin.
            Leave a field blank to match anything.
          </p>
        </div>
        {canManage && !draft && (
          <Button size="sm" variant="outline"
            onClick={() => setDraft({ name: '', towns: '', regions: '', postcodes: '', agents: '', priority: '100' })}>
            <Plus /> New rule
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 && !draft && (
          <HubEmptyState
            icon={Route}
            title="No routing rules yet"
            description="Without a rule, an incoming lead sits unassigned until somebody notices it. A rule sends leads for a town, region or postcode straight to the right agent."
            action={
              <Button
                size="sm"
                onClick={() => setDraft({ name: '', towns: '', regions: '', postcodes: '', agents: '', priority: '100' })}
              >
                <Plus /> New rule
              </Button>
            }
          />
        )}

        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {[
                r.match_towns.length ? `towns: ${r.match_towns.join(', ')}` : null,
                r.match_regions.length ? `regions: ${r.match_regions.join(', ')}` : null,
                r.match_postcode_prefixes.length ? `postcodes: ${r.match_postcode_prefixes.join(', ')}*` : null,
              ].filter(Boolean).join(' · ') || 'matches everything'}
            </span>
            <span className="text-xs text-muted-foreground">{r.agent_user_ids.length} agent{r.agent_user_ids.length === 1 ? '' : 's'}</span>
            <span className="text-xs text-muted-foreground">priority {r.priority}</span>
            {canManage && (
              <div className="ml-auto flex items-center gap-2">
                <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} />
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-destructive" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        ))}

        {draft && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">Rule name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="South desk" /></div>
              <div><Label className="text-xs">Priority</Label><Input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} /></div>
              <div><Label className="text-xs">Towns (comma-separated)</Label><Input value={draft.towns} onChange={(e) => setDraft({ ...draft, towns: e.target.value })} placeholder="Glyfada, Voula" /></div>
              <div><Label className="text-xs">Regions</Label><Input value={draft.regions} onChange={(e) => setDraft({ ...draft, regions: e.target.value })} placeholder="Attica" /></div>
              <div><Label className="text-xs">Postcode prefixes</Label><Input value={draft.postcodes} onChange={(e) => setDraft({ ...draft, postcodes: e.target.value })} placeholder="166, 167" /></div>
              <div><Label className="text-xs">Agent user IDs (comma-separated)</Label><Input value={draft.agents} onChange={(e) => setDraft({ ...draft, agents: e.target.value })} placeholder="uuid, uuid" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Every agent must be a member of this workspace — the API rejects anyone who isn’t.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" className="rounded-full" disabled={busy || !draft.name.trim()} onClick={save}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save rule
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
