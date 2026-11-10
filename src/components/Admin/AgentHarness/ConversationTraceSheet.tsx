import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  Loader2,
  User,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/utils/datetime';

import type { ConversationTrace, TraceMessage, TraceToolCall, TraceTurn } from './harnessTypes';
import { fmtInt, fmtMs, fmtTokens, fmtUsd, shortId } from './harnessFormat';

type TimelineItem =
  | { kind: 'message'; at: string; data: TraceMessage }
  | { kind: 'turn'; at: string; data: TraceTurn }
  | { kind: 'tool'; at: string; data: TraceToolCall };

type Filter = 'all' | 'messages' | 'turns' | 'tools' | 'problems';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'messages', label: 'Messages' },
  { value: 'turns', label: 'Model Calls' },
  { value: 'tools', label: 'Tool Calls' },
  { value: 'problems', label: 'Problems' },
];

function isProblem(item: TimelineItem): boolean {
  if (item.kind === 'tool') return !item.data.success || !!item.data.zero_result;
  if (item.kind === 'turn') return !!item.data.error;
  return item.data.content === 'No response from agent' || item.data.rating === 'down';
}

const JsonBlock: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  if (value == null || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-72 overflow-auto rounded-sm border border-hairline bg-surface-sunken p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
};

const TimelineRow: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const [open, setOpen] = useState(isProblem(item));
  const problem = isProblem(item);

  let icon: React.ReactNode;
  let title: React.ReactNode;
  let meta: React.ReactNode = null;
  let body: React.ReactNode = null;

  if (item.kind === 'message') {
    const m = item.data;
    icon = m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />;
    title = (
      <span className="truncate">
        <span className="font-semibold">{m.role === 'user' ? 'User' : m.agent ?? 'Assistant'}</span>
        <span className="ml-2 text-muted-foreground">{(m.content ?? '').slice(0, 140)}</span>
      </span>
    );
    meta = (
      <>
        {m.routed && m.requested_agent && <Badge variant="info">Routed from {m.requested_agent}</Badge>}
        {m.rating === 'down' && <Badge variant="error">Rated Down</Badge>}
        {m.rating === 'up' && <Badge variant="success">Rated Up</Badge>}
        {m.response_ms != null && <span className="tabular-nums">{fmtMs(m.response_ms)}</span>}
      </>
    );
    body = (
      <>
        <p className="mt-2 whitespace-pre-wrap text-sm">{m.content || '—'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {m.model && <Badge variant="neutral">{m.model}</Badge>}
          {m.attachments > 0 && <Badge variant="neutral">{m.attachments} attachments</Badge>}
          {(m.payload_keys ?? []).map((k) => (
            <Badge key={k} variant="outline" className="font-mono text-[10px]">{k}</Badge>
          ))}
        </div>
      </>
    );
  } else if (item.kind === 'turn') {
    const t = item.data;
    const aux = t.agent_type.includes(':');
    icon = <Cpu className="h-3.5 w-3.5" />;
    title = (
      <span className="truncate">
        <span className="font-semibold">{aux ? `Aux call · ${t.agent_type.split(':')[1]}` : `Model turn${t.turn_number != null ? ` #${t.turn_number}` : ''}`}</span>
        <span className="ml-2 text-muted-foreground">{t.model ?? 'unknown model'}</span>
      </span>
    );
    meta = (
      <>
        {t.error && <Badge variant="error">Error</Badge>}
        <span className="tabular-nums">{fmtTokens(t.input_tokens)} in · {fmtTokens(t.output_tokens)} out</span>
        <span className="tabular-nums">{fmtUsd(t.cost_usd)}</span>
        <span className="tabular-nums">{fmtMs(t.latency_ms)}</span>
      </>
    );
    body = (
      <>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Cache Read</dt><dd className="tabular-nums">{fmtTokens(t.cache_read_tokens)}</dd></div>
          <div><dt className="text-muted-foreground">Cache Write</dt><dd className="tabular-nums">{fmtTokens(t.cache_write_tokens)}</dd></div>
          <div><dt className="text-muted-foreground">Credits</dt><dd className="tabular-nums">{t.credits ?? '—'}</dd></div>
          <div><dt className="text-muted-foreground">Agent Type</dt><dd className="font-mono">{t.agent_type}</dd></div>
        </dl>
        {t.tools_called && t.tools_called.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {t.tools_called.map((tc, i) => (
              <Badge key={`${tc.name}-${i}`} variant="neutral" className="font-mono text-[10px]">
                {tc.name}{tc.duration_ms != null ? ` · ${fmtMs(tc.duration_ms)}` : ''}
              </Badge>
            ))}
          </div>
        )}
        <JsonBlock label="Error" value={t.error} />
        <JsonBlock label="Metadata" value={t.metadata} />
      </>
    );
  } else {
    const c = item.data;
    icon = <Wrench className="h-3.5 w-3.5" />;
    title = (
      <span className="truncate">
        <span className="font-mono font-semibold">{c.tool}</span>
        {c.error && <span className="ml-2 text-[hsl(var(--error))]">{c.error.slice(0, 120)}</span>}
      </span>
    );
    meta = (
      <>
        {!c.success && <Badge variant="error">Failed</Badge>}
        {c.success && c.zero_result && <Badge variant="warning">Zero Results</Badge>}
        {c.success && !c.zero_result && c.result_count != null && <span className="tabular-nums">{fmtInt(c.result_count)} results</span>}
        <span className="tabular-nums">{fmtMs(c.duration_ms)}</span>
      </>
    );
    body = (
      <>
        <JsonBlock label="Arguments" value={c.args} />
        <JsonBlock label="Result Summary" value={c.result} />
        <JsonBlock label="Error" value={c.error} />
      </>
    );
  }

  return (
    <li className={cn('border-b border-hairline last:border-b-0', problem && 'bg-[hsl(var(--error-bg)/0.4)]')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-sunken"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(item.at, { seconds: true })}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">{meta}</span>
      </button>
      {open && <div className="px-3 pb-3 pl-12">{body}</div>}
    </li>
  );
};

export const ConversationTraceSheet: React.FC<{
  conversationId: string | null;
  onOpenChange: (open: boolean) => void;
}> = ({ conversationId, onOpenChange }) => {
  const { toast } = useToast();
  const [trace, setTrace] = useState<ConversationTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrace(null);
    setFilter('all');
    void supabase
      .rpc('admin_agent_conversation_trace', { p_conversation_id: conversationId })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setTrace(data as unknown as ConversationTrace);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!trace) return [];
    const items: TimelineItem[] = [
      ...trace.messages.map((m) => ({ kind: 'message' as const, at: m.created_at, data: m })),
      ...trace.turns.map((t) => ({ kind: 'turn' as const, at: t.at, data: t })),
      ...trace.tool_calls.map((c) => ({ kind: 'tool' as const, at: c.at, data: c })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [trace]);

  const visible = timeline.filter((i) =>
    filter === 'all' ? true
      : filter === 'messages' ? i.kind === 'message'
        : filter === 'turns' ? i.kind === 'turn'
          : filter === 'tools' ? i.kind === 'tool'
            : isProblem(i));

  const totals = useMemo(() => {
    if (!trace) return null;
    return {
      cost: trace.turns.reduce((s, t) => s + (t.cost_usd || 0), 0),
      credits: trace.turns.reduce((s, t) => s + (t.credits || 0), 0),
      tokensIn: trace.turns.reduce((s, t) => s + (t.input_tokens || 0), 0),
      tokensOut: trace.turns.reduce((s, t) => s + (t.output_tokens || 0), 0),
      failed: trace.tool_calls.filter((c) => !c.success).length,
      zero: trace.tool_calls.filter((c) => c.success && c.zero_result).length,
    };
  }, [trace]);

  const conv = trace?.conversation;

  return (
    <Sheet open={!!conversationId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="pr-6">{conv?.title || 'Conversation Trace'}</SheetTitle>
          <SheetDescription>
            {conv
              ? `${conv.agent ?? 'agent'} · ${conv.user_email ?? 'unknown user'} · started ${formatDate(conv.created_at, { withTime: true })}`
              : `Conversation ${shortId(conversationId)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (!conversationId) return;
              void navigator.clipboard.writeText(conversationId);
              toast({ title: 'Conversation id copied' });
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy id
          </Button>
          {conversationId && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={`/agent-hub?conversation=${conversationId}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open in Agent Hub
              </a>
            </Button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-3 py-2 text-sm text-[hsl(var(--error))]">
            Could not load the trace: {error}
          </p>
        )}

        {trace && !conv && (
          <HubEmptyState title="Conversation not found" description="No conversation has this id. It may have been deleted." className="mt-6" />
        )}

        {trace && conv && totals && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-hairline bg-hairline text-xs sm:grid-cols-6">
              {[
                ['Messages', fmtInt(trace.messages.length)],
                ['Model Calls', fmtInt(trace.turns.length)],
                ['Tool Calls', `${fmtInt(trace.tool_calls.length)}${totals.failed ? ` · ${totals.failed} failed` : ''}`],
                ['Tokens', `${fmtTokens(totals.tokensIn)} / ${fmtTokens(totals.tokensOut)}`],
                ['Cost', fmtUsd(totals.cost)],
                ['Credits', fmtInt(Math.round(totals.credits))],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-3 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {(conv.toolkits ?? []).map((tk) => <Badge key={tk} variant="neutral">{tk}</Badge>)}
              <span className="text-muted-foreground">
                Checkpoint: {trace.checkpoint_bytes != null ? `${fmtInt(Math.round(trace.checkpoint_bytes / 1024))} KB` : 'none stored'}
              </span>
              {trace.evals.map((e) => (
                <Badge key={`${e.case_key}-${e.at}`} variant={e.passed ? 'success' : 'error'}>
                  Eval {e.case_key}: {e.passed ? 'passed' : 'failed'}
                </Badge>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Trace filter">
              {FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filter === f.value ? 'secondary' : 'ghost'}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                  {f.value === 'problems' && ` (${timeline.filter(isProblem).length})`}
                </Button>
              ))}
            </div>

            {visible.length === 0 ? (
              <HubEmptyState
                variant="filtered"
                title="Nothing matches this filter"
                action={<Button size="sm" variant="outline" onClick={() => setFilter('all')}>Show all</Button>}
                className="mt-4"
              />
            ) : (
              <ul className="mt-2 overflow-hidden rounded-md border border-hairline bg-card">
                {visible.map((item) => <TimelineRow key={`${item.kind}-${item.data.id}`} item={item} />)}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
