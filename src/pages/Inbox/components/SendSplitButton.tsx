import React, { useState } from 'react';
import { CalendarClock, CheckCheck, ChevronDown, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { SendAtPicker, sendLaterPresets, stamp } from './SendLater';

export const SendSplitButton: React.FC<{
  label: string;
  sending: boolean;
  disabled: boolean;
  modKey: string;
  onSend: () => void;
  onSendAndClose?: () => void;
  onSchedule?: (at: Date) => void;
  scheduleBlockedReason?: string | null;
}> = ({ label, sending, disabled, modKey, onSend, onSendAndClose, onSchedule, scheduleBlockedReason }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const hasMenu = !!onSendAndClose || !!onSchedule;

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      {customOpen && onSchedule && <SendAtPicker disabled={disabled} onPick={onSchedule} onCancel={() => setCustomOpen(false)} />}
      <div className="inline-flex">
      <Button
        size="sm"
        className={`h-8 px-3 ${hasMenu ? 'rounded-r-none' : ''}`}
        onClick={onSend}
        disabled={disabled || sending}
        title={`${label} (${modKey}+Enter)`}
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {label}
      </Button>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 px-1.5 rounded-l-none border-l border-primary-foreground/25" disabled={disabled || sending} aria-label="More send options">
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {onSendAndClose && (
              <DropdownMenuItem onSelect={onSendAndClose}>
                <CheckCheck className="w-4 h-4 mr-2" /> {label} and mark done
                <DropdownMenuShortcut>{modKey}⇧↵</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            {onSchedule && (
              <>
                {onSendAndClose && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">Send later</DropdownMenuLabel>
                {scheduleBlockedReason ? (
                  <div className="px-2 pb-1.5 text-xs text-muted-foreground">{scheduleBlockedReason}</div>
                ) : (
                  <>
                    {sendLaterPresets().map((p) => (
                      <DropdownMenuItem key={p.label} onSelect={() => onSchedule(p.at)}>
                        <CalendarClock className="w-4 h-4 mr-2" />
                        <span className="flex-1">{p.label}</span>
                        <span className="text-[11px] text-muted-foreground">{stamp(p.at)}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => setCustomOpen(true)}>
                      <CalendarClock className="w-4 h-4 mr-2" /> Pick a date and time…
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>
    </div>
  );
};
