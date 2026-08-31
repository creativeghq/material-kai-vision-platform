/**
 * AI Suggestions — "based on what you actually did, here is how to improve this workflow".
 *
 * The problem it exists for: NO workspace has ever built or forked an automation. Automations is
 * an empty canvas sitting in front of 87 operator defaults that run invisibly behind it, and
 * "build your first automation" is not advice — it is the blank page restated.
 *
 * The rule this surface is built on: EVERY suggestion names its evidence and its count. Not
 * "based on your usual actions" but "you were sent 22 of these and you opened 22". A number the
 * reader can check is the difference between a suggestion and a horoscope, and it is also the
 * honest admission when there is nothing to say — thin evidence produces NO suggestion rather
 * than a vague one. `get_flow_suggestions` enforces that server-side: a 30-day window, a floor of
 * 10 events, and a verdict derived in SQL. This component only formats what it is handed.
 *
 * Two things it will not do:
 *  • Invent business logic. It never proposes a task, an assignee or a stage — it has no way to
 *    know those, and a suggestion that guesses is the busywork it was built to replace.
 *  • Create anything that runs. "Set it up" writes a DRAFT (`p_activate := false`) and opens the
 *    builder on it; a draft never fires, so nothing happens behind the owner's back. Muting is
 *    the one immediate write, because it only ever REMOVES a notification.
 *
 * Deliberately absent: "you ran this agent tool 44 times, schedule it". There is no run-a-tool
 * action, and `send_agent_message` merely parks a message nothing consumes — so that card would
 * promise work that never happens. It comes back when an action can honour it.
 */

import { useCallback, useState } from 'react';
import { Sparkles, BellOff, Mail, X, Loader2, Info } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { triggerLabel } from '@/components/Admin/FlowsManagement/utils/paletteItems';

interface SuggestionPrefill {
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
}

interface Suggestion {
  suggestion_key: string;
  kind: 'mute_ignored' | 'escalate_channel';
  trigger_type: string;
  received: number;
  opened: number;
  window_days: number;
  flow_id: string | null;
  prefill: SuggestionPrefill | null;
  blocked_reason: string | null;
}

interface AutomationSuggestionsProps {
  /** Open the builder on a flow this surface just drafted. */
  onOpenFlow: (flowId: string) => void;
  /** Refresh the caller's list once a draft exists or a default is switched off. */
  onChanged: () => void;
}

/** The evidence sentence. Both halves are counts the reader can verify against their own bell. */
function evidenceOf(s: Suggestion): string {
  const label = triggerLabel(s.trigger_type).toLowerCase();
  const days = `the last ${s.window_days} days`;
  return s.kind === 'mute_ignored'
    ? `You were sent ${s.received} ${label} notifications in ${days} and opened ${s.opened}.`
    : `You opened ${s.opened} of the ${s.received} ${label} notifications you got in ${days}.`;
}

function headlineOf(s: Suggestion): string {
  const label = triggerLabel(s.trigger_type);
  return s.kind === 'mute_ignored'
    ? `Stop notifying me about ${label.toLowerCase()}`
    : `Email me when ${label.toLowerCase()} happens`;
}

export function AutomationSuggestions({ onOpenFlow, onChanged }: AutomationSuggestionsProps) {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<Suggestion[]>([]);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    // `as never` on the RPC name: `npm run types:generate` needs a Supabase access token nobody
    // has locally and CI never regenerates types.ts, so a new RPC is always absent from the
    // generated union. Same cast the other post-types RPCs use.
    const { data, error } = await supabase.rpc('get_flow_suggestions' as never, {
      p_workspace_id: activeWorkspaceId,
    } as never);
    setLoading(false);
    setAsked(true);
    if (error) {
      toast({ title: 'Could not read your activity', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((data ?? []) as unknown as Suggestion[]);
  }, [activeWorkspaceId, toast]);

  const dismiss = useCallback(async (s: Suggestion) => {
    if (!activeWorkspaceId) return;
    setBusy(s.suggestion_key);
    const { error } = await supabase.rpc('dismiss_flow_suggestion' as never, {
      p_workspace_id: activeWorkspaceId,
      p_suggestion_key: s.suggestion_key,
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not dismiss', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.suggestion_key !== s.suggestion_key));
  }, [activeWorkspaceId, toast]);

  const mute = useCallback(async (s: Suggestion) => {
    if (!activeWorkspaceId || !s.flow_id) return;
    setBusy(s.suggestion_key);
    const { error } = await supabase.rpc('set_workspace_flow_preference' as never, {
      p_workspace_id: activeWorkspaceId,
      p_flow_id: s.flow_id,
      p_enabled: false,
      p_muted_actions: [],
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not switch it off', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.suggestion_key !== s.suggestion_key));
    toast({ title: 'Switched off', description: `You will stop getting ${triggerLabel(s.trigger_type).toLowerCase()} notifications.` });
    onChanged();
  }, [activeWorkspaceId, toast, onChanged]);

  const draft = useCallback(async (s: Suggestion) => {
    if (!activeWorkspaceId || !s.prefill) return;
    setBusy(s.suggestion_key);
    const { data, error } = await supabase.rpc('create_simple_flow' as never, {
      p_workspace_id: activeWorkspaceId,
      p_name: headlineOf(s),
      p_trigger_type: s.prefill.trigger_type,
      p_trigger_config: s.prefill.trigger_config,
      p_actions: s.prefill.actions,
      // A DRAFT. The owner reviews it in the builder and turns it on themselves — a suggestion
      // that silently starts sending mail is not a suggestion.
      p_activate: false,
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not create the draft', description: error.message, variant: 'destructive' });
      return;
    }
    const created = data as unknown as { id?: string } | null;
    setRows((prev) => prev.filter((r) => r.suggestion_key !== s.suggestion_key));
    onChanged();
    toast({ title: 'Draft created', description: 'Review it and turn it on when it looks right.' });
    if (created?.id) onOpenFlow(created.id);
  }, [activeWorkspaceId, toast, onOpenFlow, onChanged]);

  return (
    <div className="dashboard-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Suggestions
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Reads what you have actually been doing and proposes automations for it. Every
            suggestion shows the numbers it is based on.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading || !activeWorkspaceId}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          {asked ? 'Look again' : 'Suggest improvements'}
        </Button>
      </div>

      {asked && !loading && rows.length === 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {/* Saying "nothing yet" is the honest answer. A suggestion we cannot put a number
              behind is the thing this feature exists to avoid. */}
          <span>
            Nothing worth suggesting yet. We only propose something we can put a count behind, over
            the last 30 days — keep using the platform and check back.
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((s) => {
            const rowBusy = busy === s.suggestion_key;
            const blocked = Boolean(s.blocked_reason);
            return (
              <li
                key={s.suggestion_key}
                className="flex flex-col gap-3 rounded-sm border border-hairline bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {s.kind === 'mute_ignored'
                      ? <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    {headlineOf(s)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{evidenceOf(s)}</p>
                  {blocked && (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{s.blocked_reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {s.kind === 'mute_ignored' ? (
                    <Button size="sm" variant="outline" disabled={rowBusy} onClick={() => mute(s)}>
                      {rowBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Turn these off
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowBusy || blocked}
                      title={s.blocked_reason ?? undefined}
                      onClick={() => draft(s)}
                    >
                      {rowBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Set it up
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rowBusy}
                    title="Dismiss — we will not suggest this again"
                    onClick={() => dismiss(s)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
