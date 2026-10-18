import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { CHECK_FIXES, CHECK_GROUPS, buildCheckInventory, type CheckGroup } from './onPageChecks';

/** The instant-page booleans as verdicts, failures first per group. Used by Page health and by Pages. */
export const CheckInventoryList: React.FC<{ checks: Record<string, unknown> | null | undefined }> = ({ checks }) => {
  const inv = buildCheckInventory(checks);
  const groups = new Map<CheckGroup, typeof inv.verdicts>();
  for (const v of inv.verdicts) {
    const list = groups.get(v.check.group) ?? [];
    list.push(v);
    groups.set(v.check.group, list);
  }
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([group, list]) => {
        const sorted = [...list].sort((a, b) => Number(a.passed) - Number(b.passed));
        const failed = list.filter((v) => !v.passed).length;
        return (
          <div key={group}>
            <div className="mb-2 flex items-baseline gap-2">
              <p className="text-xs font-semibold text-muted-foreground">{CHECK_GROUPS[group]}</p>
              {failed > 0
                ? <Badge variant="warning">{failed} to fix</Badge>
                : <Badge variant="success">all clear</Badge>}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {sorted.map(({ check, passed }) => (
                <div
                  key={check.key}
                  className={`flex items-start gap-2 rounded-sm border p-2 ${
                    passed ? 'border-hairline bg-surface-sunken' : 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))]'
                  }`}
                >
                  {passed
                    ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />
                    : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className={`text-xs ${passed ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                      {check.label}
                    </p>
                    {!passed && check.cost && (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{check.cost}</p>
                    )}
                    {!passed && CHECK_FIXES[check.key] && (
                      <p className="mt-1 text-[11px] leading-snug text-foreground">
                        <span className="font-semibold">Fix: </span>{CHECK_FIXES[check.key]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {inv.unclassified.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Returned but not yet classified</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            The provider returned these and this build has no verdict for them. Listed rather than guessed.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {inv.unclassified.map((k) => (
              <Badge key={k} variant="neutral">{k.replace(/_/g, ' ')}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
