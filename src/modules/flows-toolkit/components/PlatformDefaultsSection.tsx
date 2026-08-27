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
import { Bell, ChevronDown, Mail, MessageCircle, Pencil, Recycle, Search, ShieldCheck, SlidersHorizontal, Wand2 } from 'lucide-react';

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
  /** Can a workspace flow legally look like this one? Derived server-side from the SAME vocabulary
   *  the fork RPC and the table trigger read, so Reuse is offered exactly when it would work. */
  forkable: boolean;
  /** This workspace's own editable copy, once it took one. */
  forked_flow_id: string | null;
}

interface Props {
  /** Open the visual builder on a flow id — the page owns that view. */
  onOpenFlow: (flowId: string) => void;
  /** Bumped by the page when the builder closes, so a fork edited in it re-reads its state. */
  refreshTick?: number;
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

export function PlatformDefaultsSection({ onOpenFlow, refreshTick = 0 }: Props) {
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

  useEffect(() => { void load(); }, [load, refreshTick]);

  /** One write path for both switches: the RPC takes the whole desired state, not a delta. */
  const save = async (row: FlowDefault, next: { enabled?: boolean; muted?: string[] }) => {
    if (!activeWorkspaceId) return;
    const enabled = next.enabled ?? row.enabled;
    const muted = next.muted ?? row.muted_actions;
    setBusy(row.flow_id);
    const { data, error } = await supabase.rpc('set_workspace_flow_preference' as never, {
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
    // Apply the state the RPC ACTUALLY STORED, not the state we asked for — they differ by design.
    // Silencing every channel a notification has IS switching it off, and that rule is derived once,
    // in the writer. Restating it here to keep the local update "optimistic" would be a second copy
    // of it, and the moment they disagreed the row would sit there claiming "on" while delivering
    // nothing until someone reloaded the page. Still one round trip, so no refetch of 87 rows.
    const applied = (data as unknown as { enabled: boolean; muted_actions: string[] }[] | null)?.[0];
    setRows((prev) => prev.map((r) => (
      r.flow_id === row.flow_id
        ? { ...r, enabled: applied?.enabled ?? enabled, muted_actions: applied?.muted_actions ?? muted }
        : r
    )));
  };

  const toggleChannel = (row: FlowDefault, channel: string) => {
    const muted = row.muted_actions.includes(channel)
      ? row.muted_actions.filter((c) => c !== channel)
      : [...row.muted_actions, channel];
    void save(row, { muted });
  };

  /**
   * Reuse = FORK. The operator's row keeps serving every workspace that has not touched it;
   * this one takes a copy and the global is switched off here in the same transaction, so the two
   * never both fire.
   *
   * The billing line in the confirm is not boilerplate. A platform default is an operator flow and
   * runs FREE; the copy is an ordinary workspace automation, so flow-engine debits 20 credits per
   * run from the workspace pool. On a busy trigger — inbox messages above all — that is a real
   * bill the owner has to agree to before, not discover after.
   */
  const reuse = async (row: FlowDefault) => {
    if (!activeWorkspaceId) return;
    if (row.forked_flow_id) { onOpenFlow(row.forked_flow_id); return; }
    const ok = window.confirm(
      `Reuse "${row.title}" as your own automation?`
      + '\n\nYou get an editable copy in Your automations, and this platform default switches off '
      + 'for this workspace so you are not notified twice.'
      + '\n\nYour copy is billed like any workspace automation \u2014 20 credits (\u20ac0.20) per run, '
      + 'plus any per-action cost. The platform default was free.'
      + '\n\nDeleting your copy later restores the default.',
    );
    if (!ok) return;
    setBusy(row.flow_id);
    const { data, error } = await supabase.rpc('fork_workspace_flow_default' as never, {
      p_workspace_id: activeWorkspaceId,
      p_flow_id: row.flow_id,
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not reuse', description: error.message, variant: 'destructive' });
      return;
    }
    const newId = data as unknown as string;
    setRows((prev) => prev.map((r) =>
      r.flow_id === row.flow_id ? { ...r, enabled: false, muted_actions: [], forked_flow_id: newId } : r));
    toast({
      title: 'It is yours now',
      description: `"${row.title}" was copied into Your automations. Edit it however you like.`,
    });
    onOpenFlow(newId);
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
  const changedCount = rows.filter((r) => !r.enabled || r.muted_actions.length > 0 || r.forked_flow_id).length;

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
            const off = items.filter((r) => !r.enabled || r.muted_actions.length > 0 || r.forked_flow_id).length;
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
                      // A FORKED row is no longer a platform default for this workspace — it is a
                      // pointer at their own automation. Showing it with an "off" switch would be
                      // technically true and completely misleading: nothing was turned off, it was
                      // replaced. So the switch and the chips go away and the row says where it went.
                      const forked = !!row.forked_flow_id;
                      return (
                        <div
                          key={row.flow_id}
                          className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3 pl-9"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={cn('truncate text-sm', !row.enabled && !forked && 'text-muted-foreground')}>
                                {row.title}
                              </p>
                              {forked && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                                  <Wand2 className="h-3 w-3" />
                                  Yours
                                </span>
                              )}
                            </div>
                            {forked ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                You have your own copy in Your automations. The platform default is off here,
                                so this only notifies you once.
                              </p>
                            ) : row.description ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
                            ) : null}
                          </div>

                          {forked ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => onOpenFlow(row.forked_flow_id as string)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit your copy
                            </Button>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                {row.available_channels.map((channel) => {
                                  const meta = CHANNELS[channel];
                                  if (!meta) return null;
                                  const Icon = meta.icon;
                                  const muted = row.muted_actions.includes(channel);
                                  // A disabled flow delivers nothing, so its channel chips read as
                                  // off rather than claiming a channel that cannot fire.
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

                              {canEdit && row.forkable && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1"
                                  disabled={rowBusy}
                                  onClick={() => void reuse(row)}
                                  title="Reuse this as your own editable automation"
                                >
                                  <Recycle className="h-3.5 w-3.5" />
                                  Reuse
                                </Button>
                              )}

                              <Switch
                                checked={row.enabled}
                                disabled={!canEdit || rowBusy}
                                onCheckedChange={(checked) => void save(row, { enabled: checked })}
                                aria-label={`${row.title} — ${row.enabled ? 'on' : 'off'}`}
                              />
                            </>
                          )}
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
