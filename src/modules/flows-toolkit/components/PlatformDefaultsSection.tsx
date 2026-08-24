/**
 * Platform defaults — the workspace owner's switchboard over the OPERATOR's seeded flows.
 *
 * The seeded `system-default` flows are `is_global` with `workspace_id IS NULL`, and the engine
 * matches `is_global.eq.true` for EVERY workspace. So they genuinely run inside this workspace,
 * raising its bells and sending its members email, while being invisible on every tenant surface —
 * "stop emailing me every time a WhatsApp reply lands" had no answer anywhere in the product.
 *
 * This surface is the answer, and it is deliberately NOT the flow list:
 *  • it reads `get_workspace_flow_defaults`, a projection — title, description, channels, state.
 *    `graph_definition` never crosses the boundary, so a tenant learns what a notification IS,
 *    never how the operator builds one. The CLAUDE.md rule that a tenant read of `flows` carries
 *    `.eq('is_global', false)` therefore still holds: this does not read `flows` at all.
 *  • it offers OFF switches, never Edit/Delete. The one operator row stays the single source, so a
 *    fix to a default still reaches every workspace; a workspace records only its deviation.
 *  • only the operator's `tenant_configurable` flows appear. Legal/deliverability alarms and
 *    customer-facing document delivery are excluded server-side, not hidden by this component.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ChevronDown, Mail, MessageCircle, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { cn } from '@/lib/utils';

interface FlowDefault {
  flow_id: string;
  title: string;
  description: string | null;
  category: string;
  trigger_type: string;
  available_channels: string[];
  enabled: boolean;
  muted_actions: string[];
}

/**
 * The delivery channels a workspace may switch off, and how to name them to a human.
 * MUST stay in sync with the `in (...)` allowlist inside `get_workspace_flow_defaults` and
 * `set_workspace_flow_preference` — the RPC is the enforcer, and it drops anything it does not
 * recognise, so an extra entry here is silently inert rather than dangerous.
 */
const CHANNELS: Record<string, { label: string; icon: typeof Bell }> = {
  create_notification: { label: 'In-app', icon: Bell },
  send_email: { label: 'Email', icon: Mail },
  send_whatsapp: { label: 'WhatsApp', icon: MessageCircle },
};

export function PlatformDefaultsSection() {
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  const { toast } = useToast();

  const [rows, setRows] = useState<FlowDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  // Mirrors `is_workspace_admin` server-side. The RPC refuses a non-admin regardless; this only
  // decides whether the controls are offered, so a member sees the state without a dead switch.
  const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    // `as never` on the RPC name: `npm run types:generate` needs a Supabase access token nobody has
    // locally and CI never regenerates types.ts, so a new RPC is always absent from the generated
    // union. Same cast the other post-types RPCs use (get_product_detail, list_supplier_products).
    const { data, error } = await supabase.rpc('get_workspace_flow_defaults' as never, {
      p_workspace_id: activeWorkspaceId,
    } as never);
    if (error) {
      toast({ title: 'Could not load platform defaults', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as FlowDefault[]);
    setLoading(false);
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  /** One write path for both switches: the RPC takes the whole desired state, not a delta. */
  const save = async (row: FlowDefault, next: { enabled?: boolean; muted?: string[] }) => {
    if (!activeWorkspaceId) return;
    const enabled = next.enabled ?? row.enabled;
    const muted = next.muted ?? row.muted_actions;
    setBusy(row.flow_id);
    const { error } = await supabase.rpc('set_workspace_flow_preference' as never, {
      p_workspace_id: activeWorkspaceId,
      p_flow_id: row.flow_id,
      p_enabled: enabled,
      p_muted_actions: muted,
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    // Optimistic local update — the RPC returns void and a refetch of 86 rows to move one switch
    // would make every toggle feel like a page load.
    setRows((prev) => prev.map((r) =>
      r.flow_id === row.flow_id ? { ...r, enabled, muted_actions: muted } : r));
  };

  const toggleChannel = (row: FlowDefault, channel: string) => {
    const muted = row.muted_actions.includes(channel)
      ? row.muted_actions.filter((c) => c !== channel)
      : [...row.muted_actions, channel];
    void save(row, { muted });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.title.toLowerCase().includes(q)
      || (r.description ?? '').toLowerCase().includes(q)
      || r.category.toLowerCase().includes(q));
  }, [rows, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlowDefault[]>();
    for (const r of filtered) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // How many defaults this workspace has actually changed — the reason to open the section at all.
  const changedCount = rows.filter((r) => !r.enabled || r.muted_actions.length > 0).length;

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm flex items-center justify-center py-12 text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Platform defaults
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Notifications that are on for every workspace out of the box. Switch one off, or keep it
            and silence just one channel — the in-app bell without the email, say.
            {changedCount > 0 && ` ${changedCount} changed.`}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search defaults"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 border-b border-hairline bg-surface-sunken px-4 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Only a workspace owner or admin can change these. This is the current setting.</span>
        </div>
      )}

      {grouped.length === 0 ? (
        <HubEmptyState
          variant="filtered"
          icon={Search}
          title="No defaults match that search"
          description={`Nothing in the ${rows.length} platform defaults matches “${query.trim()}”.`}
          action={<Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
        />
      ) : (
        <div>
          {grouped.map(([category, items]) => {
            // A search is a request to see the matches, so it opens every group it matched.
            const open = openCategories.has(category) || query.trim() !== '';
            const off = items.filter((r) => !r.enabled || r.muted_actions.length > 0).length;
            return (
              <div key={category} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-sunken"
                >
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')}
                  />
                  <span className="text-xs font-semibold">{category}</span>
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                    {off > 0 && ` · ${off} changed`}
                  </span>
                </button>

                {open && (
                  <div>
                    {items.map((row) => {
                      const rowBusy = busy === row.flow_id;
                      return (
                        <div
                          key={row.flow_id}
                          className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3 pl-9"
                        >
                          <div className="min-w-0 flex-1">
                            <p className={cn('truncate text-sm', !row.enabled && 'text-muted-foreground')}>
                              {row.title}
                            </p>
                            {row.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {row.available_channels.map((channel) => {
                              const meta = CHANNELS[channel];
                              if (!meta) return null;
                              const Icon = meta.icon;
                              const muted = row.muted_actions.includes(channel);
                              // A disabled flow delivers nothing, so its channel chips read as off
                              // rather than claiming a channel that cannot fire.
                              const live = row.enabled && !muted;
                              return (
                                <button
                                  key={channel}
                                  type="button"
                                  disabled={!canEdit || rowBusy || !row.enabled}
                                  onClick={() => toggleChannel(row, channel)}
                                  title={
                                    !row.enabled
                                      ? `${meta.label} — off, because this notification is switched off`
                                      : muted ? `Turn ${meta.label} back on` : `Stop sending ${meta.label}`
                                  }
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs transition-colors',
                                    'disabled:cursor-not-allowed disabled:opacity-60',
                                    live
                                      ? 'border-primary/30 bg-primary/10 text-primary'
                                      : 'border-hairline bg-surface-sunken text-muted-foreground line-through',
                                  )}
                                >
                                  <Icon className="h-3 w-3" />
                                  {meta.label}
                                </button>
                              );
                            })}
                          </div>

                          <Switch
                            checked={row.enabled}
                            disabled={!canEdit || rowBusy}
                            onCheckedChange={(checked) => void save(row, { enabled: checked })}
                            aria-label={`${row.title} — ${row.enabled ? 'on' : 'off'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
