/**
 * A myDATA document-type code ("2.1", "9.3", …) rendered as a dotted-underline hint that
 * explains itself on hover. The code→name lookup is the shared session-wide one in
 * [mydataTypes.ts](./mydataTypes.ts), so this label and the filter options always agree.
 */
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/core/ui/tooltip';
import { MYDATA_TYPE_FAMILY, useMydataTypeLabels } from './mydataTypes';

export const MydataTypeLabel: React.FC<{ code: string | null | undefined; className?: string }> = ({ code, className }) => {
  const map = useMydataTypeLabels();

  if (!code) return <span className={className ?? 'text-xs text-muted-foreground'}>—</span>;

  const description = map[code];
  const family = MYDATA_TYPE_FAMILY[code.split('.')[0]];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`${className ?? 'text-xs text-muted-foreground'} cursor-help underline decoration-dotted decoration-from-font underline-offset-4`}
          >
            {code}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{description ?? `myDATA type ${code}`}</p>
          {family && <p className="text-xs text-muted-foreground mt-0.5">{family} · AADE code {code}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
