import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Flag, Pencil, Trash2, Banknote, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  partyBalancesService, OPENING_BALANCE_SOURCES, OPENING_BALANCE_SOURCE_LABELS,
  type OpeningBalance, type OpeningBalanceSource, type PartyBalance, type PartySide,
} from '@/modules/finance/services/partyBalancesService';
import { netPositionDirection } from '@/modules/finance/utils/netPosition';
import { parseDecimal } from '@/utils/decimal';
import { formatDate, todayLocalISO } from '@/utils/datetime';

interface Props {
  workspaceId: string;
  partyType: 'company' | 'contact';
  partyId: string;
  side: PartySide;
  /** Bump to re-read the statement balance after something outside the card changed it. */
  refreshKey?: number;
  onChanged: () => void;
  onRecordPayment: () => void;
  /** Reports the loaded opening (or null) so the payment dialog can warn about earlier dates. */
  onOpeningLoaded?: (opening: OpeningBalance | null) => void;
}

/** The opening balance for one party side, the statement balance it leads to, and the on-account payment entry point. */
export const OpeningBalanceCard: React.FC<Props> = ({
  workspaceId, partyType, partyId, side, refreshKey = 0, onChanged, onRecordPayment, onOpeningLoaded,
}) => {
  const { toast } = useToast();
  const [opening, setOpening] = useState<OpeningBalance | null>(null);
  const [balance, setBalance] = useState<PartyBalance | null>(null);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showOpening, setShowOpening] = useState(false);

  const seq = useRef(0);
  const load = async () => {
    const mine = ++seq.current;
    setLoading(true);
    const party = { companyId: partyType === 'company' ? partyId : null, contactId: partyType === 'contact' ? partyId : null };
    try {
      const [ob, bal] = await Promise.all([
        partyBalancesService.getOpeningBalance({ workspaceId, side, ...party }),
        partyBalancesService.listBalances(workspaceId, party).catch(() => null),
      ]);
      // A side switch mid-flight: only the newest request may write.
      if (mine !== seq.current) return;
      setOpening(ob);
      onOpeningLoaded?.(ob);
      setBalanceFailed(bal === null);
      setBalance(bal ? (bal.find((b) => b.currency === (ob?.currency ?? 'EUR')) ?? bal[0] ?? null) : null);
    } catch (err) {
      toast({ title: 'Could not load the opening balance', description: (err as Error).message, variant: 'destructive' });
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [workspaceId, partyType, partyId, side, refreshKey]);

  const currency = balance?.currency ?? opening?.currency ?? 'EUR';
  const statementBalance = balanceFailed ? null : (balance ? (side === 'customer' ? balance.receivable : balance.payable) : 0);

  const remove = async () => {
    if (!opening) return;
    if (!window.confirm(
      `Remove the opening balance of ${formatMoney(Math.abs(opening.amount), opening.currency)} on ${formatDate(opening.as_of)}? `
      + 'Every earlier entry will be counted again.',
    )) return;
    setRemoving(true);
    try {
      await partyBalancesService.deleteOpeningBalance(opening.id);
      toast({ title: 'Opening balance removed', description: 'Every entry is counted from the first document again.' });
      await load();
      onChanged();
    } catch (err) {
      toast({ title: 'Could not remove it', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  // Signed the way netPositionDirection reads: positive = due to us.
  const toUs = (n: number) => (side === 'customer' ? n : -n);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-2">
          <Button size="sm" variant="outline" aria-expanded={showOpening} onClick={() => setShowOpening((v) => !v)}>
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            Opening balance · {side === 'customer' ? 'as customer' : 'as supplier'}
            {!loading && opening && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-label="Set" />}
            <ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${showOpening ? 'rotate-180' : ''}`} />
          </Button>
          {showOpening && (
            <div className="space-y-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : opening ? (
                <p className="text-sm">
                  On <strong>{formatDate(opening.as_of)}</strong> the account stood at{' '}
                  <strong className="tabular-nums">{formatMoney(Math.abs(opening.amount), opening.currency)}</strong>{' '}
                  <span className="text-muted-foreground">({netPositionDirection(toUs(opening.amount))})</span>
                  <span className="block text-xs text-muted-foreground">
                    {OPENING_BALANCE_SOURCE_LABELS[opening.source]}{opening.note ? ` · ${opening.note}` : ''}.
                    {' '}Entries dated on or before it are shown but not counted again.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  None set — the balance counts every document from the first one. Set one when you take over an account
                  from another system or from the party&apos;s own statement.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {opening ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                    <Button size="sm" variant="ghost" disabled={removing} onClick={() => { void remove(); }}>
                      {removing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Remove
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" disabled={loading} onClick={() => setEditing(true)}>Set opening balance</Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {balanceFailed && <div className="text-xs text-destructive">Statement balance could not be loaded</div>}
          {!loading && statementBalance != null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                Account balance · {netPositionDirection(toUs(statementBalance))}
              </div>
              <div className="text-base font-semibold tabular-nums">{formatMoney(Math.abs(statementBalance), currency)}</div>
              <div className="text-[11px] text-muted-foreground">
                Incl. AADE documents not booked as bills and un-invoiced orders, as the ledger below with that box ticked
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onRecordPayment}>
              <Banknote className="mr-1.5 h-3.5 w-3.5" /> Record payment on account
            </Button>
          </div>
        </div>
      </CardContent>

      {editing && (
        <OpeningBalanceDialog
          workspaceId={workspaceId}
          partyType={partyType}
          partyId={partyId}
          side={side}
          current={opening}
          defaultCurrency={currency}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void load(); onChanged(); }}
        />
      )}
    </Card>
  );
};

const OpeningBalanceDialog: React.FC<{
  workspaceId: string;
  partyType: 'company' | 'contact';
  partyId: string;
  side: PartySide;
  current: OpeningBalance | null;
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ workspaceId, partyType, partyId, side, current, defaultCurrency, onClose, onSaved }) => {
  const { toast } = useToast();
  const [asOf, setAsOf] = useState(current?.as_of ?? todayLocalISO());
  const [amount, setAmount] = useState(current ? String(Math.abs(current.amount)) : '');
  const [normal, setNormal] = useState<'normal' | 'reverse'>(current && current.amount < 0 ? 'reverse' : 'normal');
  const [currency, setCurrency] = useState(current?.currency ?? defaultCurrency ?? 'EUR');
  const [source, setSource] = useState<OpeningBalanceSource>(current?.source ?? 'party_statement');
  const [note, setNote] = useState(current?.note ?? '');
  const [saving, setSaving] = useState(false);

  const directionLabels = side === 'supplier'
    ? { normal: 'We owe them', reverse: 'They owe us (credit with them)' }
    : { normal: 'They owe us', reverse: 'We owe them (their credit with us)' };

  const save = async () => {
    const amt = parseDecimal(amount);
    if (amt == null || amt < 0) { toast({ title: 'Enter the amount', variant: 'destructive' }); return; }
    if (!asOf) { toast({ title: 'Enter the date', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await partyBalancesService.setOpeningBalance({
        workspaceId, side,
        companyId: partyType === 'company' ? partyId : null,
        contactId: partyType === 'contact' ? partyId : null,
        asOf, amount: normal === 'normal' ? amt : -amt, currency, source, note: note || null,
      });
      toast({ title: 'Opening balance saved' });
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save it', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{current ? 'Edit opening balance' : 'Set opening balance'}</DialogTitle>
          <DialogDescription>
            Where this account stood on a date, usually from their latest statement. It is not a document:
            nothing is invoiced, filed or posted to P&amp;L or VAT. Entries dated on or before it are not counted again.
          </DialogDescription>
        </DialogHeader>
        <FormSection title="Balance">
          <FormGrid>
            <FormField label="As of">
              <Input type="date" value={asOf} max={todayLocalISO()} onChange={(e) => setAsOf(e.target.value)} />
            </FormField>
            <FormField label="Direction">
              <Select value={normal} onValueChange={(v) => setNormal(v as 'normal' | 'reverse')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">{directionLabels.normal}</SelectItem>
                  <SelectItem value="reverse">{directionLabels.reverse}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Amount" hint="0 is allowed: it means the account was settled on that date.">
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField label="Currency">
              <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormSection title="Where it comes from">
          <FormGrid>
            <FormField label="Source">
              <Select value={source} onValueChange={(v) => setSource(v as OpeningBalanceSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPENING_BALANCE_SOURCES.map((s) => <SelectItem key={s} value={s}>{OPENING_BALANCE_SOURCE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </FormGrid>
          <FormField label="Note" optional>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Statement emailed 3/10, ref. 2026-117" />
          </FormField>
        </FormSection>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => { void save(); }}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
