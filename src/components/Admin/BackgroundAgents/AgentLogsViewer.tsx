import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { listLogs, subscribeToLogs, logLevelColor } from '@/services/backgroundAgents';
import type { AgentRunLog } from '@/services/backgroundAgents';

interface AgentLogsViewerProps {
  runId: string;
  live?: boolean;
}

export function AgentLogsViewer({ runId, live = false }: AgentLogsViewerProps) {
  const [logs, setLogs]       = useState<AgentRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    listLogs(runId).then(l => {
      setLogs(l);
      setLoading(false);
    });
  }, [runId]);

  useEffect(() => {
    if (!live) return;
    const unsub = subscribeToLogs(runId, (log) => {
      setLogs(prev => [...prev, log]);
    });
    return unsub;
  }, [runId, live]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
        <Terminal className="h-4 w-4 animate-pulse" />
        Loading logs…
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-3 italic">No logs for this run.</div>
    );
  }

  return (
    <div className="bg-zinc-950 rounded-md font-mono text-xs max-h-80 overflow-y-auto p-3 space-y-0.5">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2">
          <span className="text-zinc-500 shrink-0 select-none">
            {new Date(log.created_at).toLocaleTimeString()}
          </span>
          <span className={`uppercase font-bold shrink-0 w-10 ${logLevelColor(log.level)}`}>
            {log.level}
          </span>
          <span className="text-zinc-200 break-all">{log.message}</span>
          {log.data && (
            <span className="text-zinc-500 truncate max-w-[200px]">
              {JSON.stringify(log.data).slice(0, 120)}
            </span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
