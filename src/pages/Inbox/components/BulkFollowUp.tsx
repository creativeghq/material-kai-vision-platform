import React, { useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { OutreachComposer } from './OutreachComposer';
import type { SendFollowUpPlan } from './FollowUpOnSend';

const BOOMERANG_DAYS = [1, 3, 7, 14];

/** Follow up on every selected conversation at once: Boomerang them all, or send each the same chain unless they reply. */
export const BulkFollowUp: React.FC<{ disabled?: boolean; onPlan: (plan: SendFollowUpPlan) => void }> = ({ disabled, onPlan }) => {
  const [composing, setComposing] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={disabled}><AlarmClock className="w-3.5 h-3.5 mr-1" />Follow up</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {BOOMERANG_DAYS.map((d) => (
            <DropdownMenuItem key={d} onSelect={() => onPlan({ kind: 'remind', days: d })}>
              Boomerang: back {d === 1 ? 'tomorrow' : d === 7 ? 'in a week' : d === 14 ? 'in 2 weeks' : `in ${d} days`}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setComposing(true)}>Send a follow-up to each…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {composing && (
        <Dialog open onOpenChange={(o) => !o && setComposing(false)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Follow Up on Every Selected Conversation</DialogTitle>
              <DialogDescription>Each conversation gets these as replies, and each stops on its own the moment that person answers.</DialogDescription>
            </DialogHeader>
            <OutreachComposer idPrefix="bulk-followup" submitLabel="Schedule"
              onSubmit={async (steps, template) => { setComposing(false); onPlan({ kind: 'outreach', steps, template }); }} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
