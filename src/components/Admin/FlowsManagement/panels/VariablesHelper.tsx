import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Braces } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { getTriggerVariables, LOOP_VARIABLES } from '@/services/flows/triggerVariables';

interface VariablesHelperProps {
  /** The flow's trigger type (drives which variables are shown). */
  triggerType: string | undefined;
  /** Whether the selected action sits downstream of a Loop (adds {{item}} etc.). */
  insideLoop?: boolean;
}

/**
 * Shows the `{{trigger.data.*}}` variables available for the current flow's
 * trigger, so an operator knows what they can paste into an action's config
 * fields. Click a token to copy it. Collapsible to stay out of the way.
 */
export const VariablesHelper: React.FC<VariablesHelperProps> = ({ triggerType, insideLoop }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const vars = getTriggerVariables(triggerType);
  const loopVars = insideLoop
    ? LOOP_VARIABLES.map((v) => ({ ...v, token: v.key === 'loop_index' ? '{{loop_index}}' : `{{${v.key}}}` }))
    : [];

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium"
      >
        <span className="flex items-center gap-1.5">
          <Braces className="h-3.5 w-3.5 text-muted-foreground" />
          Available variables
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {vars.length + loopVars.length}
          </Badge>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Click to copy, then paste into any field below. Plain text overrides the value the
            source sends; <code className="bg-muted px-1 rounded">{'{{…}}'}</code> is filled at run time.
          </p>
          {[...loopVars, ...vars].map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => copy(v.token)}
              className="w-full text-left rounded border border-border/60 bg-background/60 px-2 py-1.5 hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-[11px] font-mono text-primary break-all">{v.token}</code>
                {copied === v.token ? (
                  <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                <span className="text-foreground font-medium">{v.label}</span> — {v.note}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
