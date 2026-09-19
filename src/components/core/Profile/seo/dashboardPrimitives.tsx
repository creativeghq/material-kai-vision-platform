import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/** Article pipeline status → its tone. Amber is "still working", not "wrong". */
export const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-[hsl(var(--error))]',
  researching: 'text-amber-600 dark:text-amber-400',
  writing: 'text-amber-600 dark:text-amber-400',
  planning: 'text-amber-600 dark:text-amber-400',
  analyzing: 'text-amber-600 dark:text-amber-400',
};

/**
 * Send the operator into the agent with a specific guided flow already open.
 *
 * `?quickstart=<toolkitId>:<label>` dispatches through the SAME handleQuickStart the in-app picker
 * uses, so these buttons cannot drift from the flows themselves.
 */
export function useLaunchQuickStart() {
  const navigate = useNavigate();
  return (toolkitId: string, label: string) =>
    navigate(`/agent-hub?quickstart=${encodeURIComponent(toolkitId)}:${encodeURIComponent(label)}`);
}

export const Loading: React.FC = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
  </div>
);
