/**
 * Chat Agent Activity Tab
 *
 * Surfaces tool calls executed inline by the chat agents (KAI + Interior Designer).
 * These are different from background agents (cron-driven, tracked in agent_runs):
 * chat tool calls live in `agent_tool_call_logs` and run inside the agent-chat
 * edge function as part of a conversation's tool-use loop.
 *
 * Grouped by conversation so admins can see which conversations are doing the
 * heaviest work, with per-tool-call drill-down.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  MessageSquare, RefreshCw, CheckCircle, XCircle, Loader2,
  ChevronDown, ChevronRight, Wrench, User,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { FilterBar, useFilters } from '@/components/core/filters';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { listChatToolCalls, formatDuration } from '@/services/backgroundAgents';
import type { ChatToolCall } from '@/services/backgroundAgents';
import { useToast } from '@/hooks/use-toast';
import { buildChatToolCallFilters } from './backgroundAgentFilters';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ChatActivityTab() {
  const { toast } = useToast();
  const [calls, setCalls] = useState<ChatToolCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCalls(await listChatToolCalls(300));
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filterGroups = useMemo(() => buildChatToolCallFilters(calls), [calls]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<ChatToolCall>(calls, filterGroups);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const successful = calls.filter(c => c.success).length;
    const failed     = calls.filter(c => !c.success).length;
    const zeroResult = calls.filter(c => !!c.zero_result).length;
    const totalMs    = calls.reduce((s, c) => s + (c.duration_ms ?? 0), 0);
    const avgMs      = calls.length > 0 ? Math.round(totalMs / calls.length) : 0;
    // Top 5 tools by usage
    const toolCounts = new Map<string, number>();
    calls.forEach(c => toolCounts.set(c.tool_name, (toolCounts.get(c.tool_name) ?? 0) + 1));
    const topTools = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total: calls.length, successful, failed, zeroResult, avgMs, topTools };
  }, [calls]);

  // ── Group by conversation ─────────────────────────────────────────────────
  type ConvGroup = {
    conversation_id: string;
    agent_id:        string | null;
    user_name:       string | null;
    user_email:      string | null;
    callCount:       number;
    successCount:    number;
    failCount:       number;
    totalMs:         number;
    lastAt:          string;
    items:           ChatToolCall[];
  };

  const grouped: ConvGroup[] = useMemo(() => {
    const map = new Map<string, ConvGroup>();
    // Bucket by conversation_id (or '__no-conv__' when null — shouldn't happen often)
    for (const c of filtered) {
      const key = c.conversation_id ?? '__no-conv__';
      const existing = map.get(key);
      if (existing) {
        existing.callCount++;
        if (c.success) existing.successCount++; else existing.failCount++;
        existing.totalMs += c.duration_ms ?? 0;
        existing.items.push(c);
      } else {
        map.set(key, {
          conversation_id: key,
          agent_id:        c.agent_id,
          user_name:       c.user_name  ?? null,
          user_email:      c.user_email ?? null,
          callCount:       1,
          successCount:    c.success ? 1 : 0,
          failCount:       c.success ? 0 : 1,
          totalMs:         c.duration_ms ?? 0,
          lastAt:          c.created_at,
          items:           [c],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
    );
  }, [filtered]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SectionHeader
        icon={MessageSquare}
        title="Chat Agent Activity"
        subtitle="Tool calls executed inline by KAI and Interior Designer chat agents"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { label: 'Tool Calls',   value: String(stats.total),                color: 'text-foreground', size: 'lg' },
          { label: 'Successful',   value: String(stats.successful),           color: 'text-green-600',  size: 'lg' },
          { label: 'Failed',       value: String(stats.failed),               color: 'text-red-600',    size: 'lg' },
          { label: 'Zero Result',  value: String(stats.zeroResult),           color: 'text-yellow-500', size: 'lg' },
          { label: 'Avg Duration', value: formatDuration(stats.avgMs),        color: 'text-foreground', size: 'sm' },
        ] as const).map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center">
            <p className={`font-bold ${s.color} ${s.size === 'lg' ? 'text-2xl' : 'text-base'}`}>
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top tools */}
      {stats.topTools.length > 0 && (
        <div className="border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top tools by usage
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.topTools.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setFilterValues({ ...filterValues, tool: [name] })}
                className="inline-flex items-center gap-1.5 px-2 py-1 border text-xs hover:bg-muted/50"
              >
                <Wrench className="h-3 w-3" />
                <span className="font-mono">{name}</span>
                <Badge variant="outline" className="text-[10px]">{count}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <FilterBar
        groups={filterGroups}
        values={filterValues}
        onChange={setFilterValues}
        previewCount={previewCount}
        title="Filter tool calls"
        searchPlaceholder="Search tool name, args, error message…"
      />

      {/* Conversation groups */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No tool calls match</p>
          <p className="text-sm text-muted-foreground">
            Adjust filters or open a chat with KAI to generate activity.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const open = expandedConv === g.conversation_id;
            return (
              <div key={g.conversation_id} className="border rounded-lg overflow-hidden">
                {/* Conversation row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left"
                  onClick={() => setExpandedConv(open ? null : g.conversation_id)}
                >
                  {open
                    ? <ChevronDown  className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                  <MessageSquare className="h-4 w-4 text-primary shrink-0" />

                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {(g.user_name || g.user_email) && (
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {g.user_name && (
                          <span className="text-sm font-medium truncate">{g.user_name}</span>
                        )}
                        {g.user_email && (
                          <span className="text-xs text-muted-foreground truncate">
                            {g.user_name ? `· ${g.user_email}` : g.user_email}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {g.conversation_id === '__no-conv__'
                        ? <span className="italic">no conversation id</span>
                        : <>· {g.conversation_id.slice(0, 8)}…</>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {g.agent_id && (
                      <Badge variant="outline" className="text-xs">{g.agent_id}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {g.callCount} call{g.callCount > 1 ? 's' : ''}
                    </Badge>
                    {g.successCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3 w-3" />{g.successCount}
                      </span>
                    )}
                    {g.failCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-500">
                        <XCircle className="h-3 w-3" />{g.failCount}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDuration(g.totalMs)}</span>
                    <span className="text-xs text-muted-foreground">{relTime(g.lastAt)}</span>
                  </div>
                </button>

                {/* Per-call breakdown */}
                {open && (
                  <div className="border-t bg-muted/20 divide-y">
                    {g.items.map((c) => {
                      const callOpen = expandedCall === c.id;
                      return (
                        <div key={c.id}>
                          <button
                            className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-muted/40 text-left"
                            onClick={() => setExpandedCall(callOpen ? null : c.id)}
                          >
                            {callOpen
                              ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}

                            {c.success
                              ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              : <XCircle     className="h-3.5 w-3.5 text-red-500   shrink-0" />}

                            <span className="text-sm font-mono truncate flex-1">{c.tool_name}</span>

                            <div className="flex items-center gap-2 shrink-0">
                              {c.zero_result && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">zero-result</span>
                              )}
                              {typeof c.result_count === 'number' && c.result_count > 0 && (
                                <Badge variant="outline" className="text-[10px]">{c.result_count} results</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">{formatDuration(c.duration_ms)}</span>
                              <span className="text-xs text-muted-foreground">{relTime(c.created_at)}</span>
                            </div>
                          </button>

                          {callOpen && (
                            <div className="px-6 pb-4 pt-2 space-y-3">
                              {c.error_message && (
                                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded p-2 whitespace-pre-wrap">
                                  {c.error_message}
                                </div>
                              )}
                              {c.tool_args && Object.keys(c.tool_args).length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Arguments</p>
                                  <pre className="text-xs bg-background rounded border p-2 overflow-auto max-h-40">
                                    {JSON.stringify(c.tool_args, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {c.result_summary && Object.keys(c.result_summary).length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Result summary</p>
                                  <pre className="text-xs bg-background rounded border p-2 overflow-auto max-h-40">
                                    {JSON.stringify(c.result_summary, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
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
