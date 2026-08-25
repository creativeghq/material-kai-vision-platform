import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquareHeart } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatTime } from '@/utils/datetime';

/**
 * Operator control over inbox conversation reading, because it bills per call.
 *
 * Three switches rather than one, because the three uses cost very differently and the operator
 * should be able to keep the cheap one while dropping the expensive one. The recurring spend is
 * `auto_on_agent_reply` — that is the one that runs unattended.
 *
 * Reads and writes `system_settings.inbox_sentiment_analysis`, which inbox-api reads on every
 * analysis. A DB row rather than an env var on purpose: the point of a cost switch is being able
 * to throw it DURING the surprise, and a redeploy is the wrong tool for "stop spending, now".
 */

interface SentimentSettings {
  enabled: boolean;
  auto_on_agent_reply: boolean;
  per_message_mood: boolean;
}

const DEFAULTS: SentimentSettings = {
  enabled: true,
  auto_on_agent_reply: true,
  per_message_mood: true,
};

const SWITCHES: Array<{
  key: keyof SentimentSettings;
  title: string;
  detail: string;
  cost: string;
}> = [
  {
    key: 'enabled',
    title: 'Read conversations',
    detail:
      'The master switch. Off, nothing analyses a conversation anywhere — no mood ring, no Mood '
      + 'tab, no tone for the assistant.',
    cost: 'Nothing runs when off',
  },
  {
    key: 'auto_on_agent_reply',
    title: 'Let the assistant use it',
    detail:
      'The assistant reads the mood before drafting, so it can match the tone and answer what was '
      + 'actually asked. This is the unattended spend — it runs whenever the AI answers.',
    cost: 'One Haiku call per new customer message',
  },
  {
    key: 'per_message_mood',
    title: 'Mood per message',
    detail:
      'Also score each individual message, which is what draws the coloured bar under a bubble. '
      + 'It rides on the same request, so it adds output tokens rather than a second call.',
    cost: 'A few hundred extra output tokens',
  },
];

export const InboxAIPanel: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SentimentSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof SentimentSettings | null>(null);
  const [spend, setSpend] = useState<{ calls: number; usd: number; since: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'inbox_sentiment_analysis')
      .maybeSingle();
    const v = (data?.setting_value ?? {}) as Partial<SentimentSettings>;
    // `!== false` throughout: a key that is absent means "not configured", which is the default
    // (on). Only an explicit false turns something off.
    setSettings({
      enabled: v.enabled !== false,
      auto_on_agent_reply: v.auto_on_agent_reply !== false,
      per_message_mood: v.per_message_mood !== false,
    });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * What it has actually cost, from the usage ledger.
   *
   * A switch labelled "this costs money" with no number beside it leaves the operator guessing,
   * and guessing is what makes people turn a useful feature off. Read from `ai_usage_logs` rather
   * than estimated from a rate card, so it is the real figure.
   */
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // `operation_type` / `billed_cost_usd` are the real column names. The first draft of this
      // queried `task_type` and `total_cost`, neither of which exists — PostgREST would have
      // errored and the panel would have shown a confident, permanent $0 next to a switch whose
      // whole job is showing what the feature costs.
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('billed_cost_usd')
        .eq('operation_type', 'inbox_conversation_sentiment')
        .gte('created_at', since);
      if (error) { setSpend(null); return; }
      const rows = (data ?? []) as Array<{ billed_cost_usd: number | null }>;
      setSpend({
        calls: rows.length,
        usd: rows.reduce((s, r) => s + (r.billed_cost_usd ?? 0), 0),
        since,
      });
    })();
  }, []);

  const toggle = async (key: keyof SentimentSettings, value: boolean) => {
    setSaving(key);
    const next = { ...settings, [key]: value };
    // Optimistic, then reconciled by the reload below — a switch that does not move until a
    // round trip completes feels broken, and this one is read on the next analysis, not now.
    setSettings(next);
    const { error } = await supabase
      .from('system_settings')
      .update({ setting_value: next, updated_at: new Date().toISOString() })
      .eq('setting_key', 'inbox_sentiment_analysis');
    setSaving(null);
    if (error) {
      // CHECKED, and reverted on failure: supabase-js RESOLVES on an RLS denial, so an unchecked
      // write would leave the switch showing off while every conversation kept billing.
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      void load();
      return;
    }
    toast({ title: value ? 'Switched on' : 'Switched off' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareHeart className="h-4 w-4" />
          Inbox AI — conversation reading
        </CardTitle>
        <CardDescription>
          Reads the last 20 messages of a conversation for customer mood, urgency and reply
          guidance. The answer is cached against the last message, so re-opening a thread costs
          nothing — it bills once per new customer message.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {SWITCHES.map((sw) => {
              // The dependent switches read as live when the master is off, which is a lie about
              // what will happen. Shown disabled instead, so the reason is visible.
              const gated = sw.key !== 'enabled' && !settings.enabled;
              return (
                <div
                  key={sw.key}
                  className={`flex items-start justify-between gap-4 py-3 border-b border-hairline last:border-0 ${gated ? 'opacity-50' : ''}`}
                >
                  <div className="min-w-0">
                    <Label htmlFor={`sw-${sw.key}`} className="text-sm font-medium">{sw.title}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-[62ch]">{sw.detail}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 font-medium">{sw.cost}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {saving === sw.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <Switch
                      id={`sw-${sw.key}`}
                      checked={settings[sw.key]}
                      disabled={gated || saving !== null}
                      onCheckedChange={(v) => void toggle(sw.key, v)}
                    />
                  </div>
                </div>
              );
            })}

            <div className="pt-3 text-xs text-muted-foreground">
              {spend === null
                ? 'Reading spend…'
                : spend.calls === 0
                  // Zero is ambiguous on its own — it is either "nobody has used it" or "it has
                  // been off", and only one of those is a reason to leave it off.
                  ? `No conversation readings billed since ${formatDate(spend.since)} — either nothing has been analysed, or this was switched off.`
                  : `${spend.calls} reading(s) since ${formatDate(spend.since)} · $${spend.usd.toFixed(2)} total · $${(spend.usd / spend.calls).toFixed(4)} each.`}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Last checked {formatDate(new Date())} {formatTime(new Date())}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default InboxAIPanel;
