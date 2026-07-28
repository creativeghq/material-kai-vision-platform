/**
 * Date-bounded "Sync from myDATA" pull. Without a window the poller starts from the stored
 * MARK watermark — which on a first sync means every document AADE ever holds for the VAT
 * number. This dialog makes the operator state the period ("From … To …") before the pull,
 * so a sync fetches the months they actually care about.
 */
import React, { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';

type Period = 'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'ytd' | 'custom';

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Presets resolve to a concrete window; `custom` seeds from whatever is in the two inputs. */
function rangeFor(p: Exclude<Period, 'custom'>): { from: string; to: string } {
  const today = new Date();
  switch (p) {
    case 'last_7_days': { const s = new Date(today); s.setDate(s.getDate() - 7); return { from: fmt(s), to: fmt(today) }; }
    case 'this_month': return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
    case 'last_month': return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case 'last_3_months': { const s = new Date(today); s.setMonth(s.getMonth() - 3); return { from: fmt(s), to: fmt(today) }; }
    case 'ytd': return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
  }
}

export const MydataSyncDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  syncing?: boolean;
  onConfirm: (range: { dateFrom: string; dateTo: string }) => void;
}> = ({ open, onOpenChange, syncing, onConfirm }) => {
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState(() => rangeFor('this_month').from);
  const [customTo, setCustomTo] = useState(() => rangeFor('this_month').to);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : rangeFor(period);
  const invalid = !range.from || !range.to || range.from > range.to;

  const pickPeriod = (p: Period) => {
    setPeriod(p);
    // Seed the custom inputs from the preset so switching to "Custom range" starts where the
    // operator was looking, instead of resetting them.
    if (p !== 'custom') { const r = rangeFor(p); setCustomFrom(r.from); setCustomTo(r.to); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Sync from myDATA</DialogTitle>
          <DialogDescription>
            Choose the period to fetch. Only documents your suppliers issued within these dates are pulled in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => pickPeriod(v as Period)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 days</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_3_months">Last 3 months</SelectItem>
                <SelectItem value="ytd">Year to date</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date" className="h-9" value={range.from}
                onChange={(e) => { setPeriod('custom'); setCustomFrom(e.target.value); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date" className="h-9" value={range.to}
                onChange={(e) => { setPeriod('custom'); setCustomTo(e.target.value); }}
              />
            </div>
          </div>

          {invalid ? (
            <p className="text-xs text-destructive">The &quot;From&quot; date must be on or before the &quot;To&quot; date.</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Fetching documents issued {range.from} → {range.to}. Documents already in the Inbox are left untouched.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={syncing}>Cancel</Button>
          <Button
            className="rounded-full"
            disabled={invalid || syncing}
            onClick={() => onConfirm({ dateFrom: range.from, dateTo: range.to })}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wallet className="h-3.5 w-3.5 mr-1" />} Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
