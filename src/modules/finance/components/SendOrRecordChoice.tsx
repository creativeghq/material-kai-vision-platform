/**
 * "Record it, or actually send it" — the one control that makes that a choice.
 *
 * Before this, the platform had both halves and no way to pick between them: Payables → Pay
 * recorded a payment that had happened somewhere else, Payables → Send moved money through
 * Revolut, they were different buttons opening different dialogs, and only a supplier BILL could
 * reach the second one. So paying anybody the platform did not already hold a bill for was
 * impossible, and nothing in the UI ever said that recording was not paying.
 *
 * The two are not variations of one action and this deliberately does not blur them:
 *
 *  - **Record** writes the books. The money moved (or will move) in someone's banking app. It is
 *    the right answer for cash, for a standing order, for a transfer someone already made.
 *  - **Send** instructs a bank. It writes NO payment row — the bank feed does that when the
 *    transfer actually lands, and settles the bill through the same allocation path as everything
 *    else. Recording it here as well is how one cost gets paid twice on the books.
 *
 * Which rails are offered is derived, never guessed: `payout_provider` comes off
 * `vw_bank_account_balances`, so an account that cannot send simply does not offer to.
 */
import React from 'react';
import { AlertTriangle, Banknote, Loader2, ShieldCheck, Send } from 'lucide-react';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { BankAccountBalance } from '@/modules/finance/services/financeService';
import {
  counterpartyReadyFor,
  isVopMismatch,
  listCounterpartyBankAccounts,
  verifyAndLinkRevolutCounterparty,
  type CounterpartyBankAccount,
  type PayoutProvider,
} from '@/modules/finance/services/payoutService';

export type PaymentIntent = 'record' | 'send';

const PROVIDER_LABEL: Record<PayoutProvider, string> = {
  revolut: 'Revolut',
  viva: 'Viva',
};

export interface SendOrRecordState {
  intent: PaymentIntent;
  crmBankAccountId: string;
  /** Revolut only — Viva executes immediately or not at all. */
  sendMode: 'draft' | 'payment';
  forceVop: boolean;
}

export const emptySendState = (): SendOrRecordState => ({
  intent: 'record',
  crmBankAccountId: '',
  sendMode: 'draft',
  forceVop: false,
});

interface Props {
  workspaceId: string;
  /** The account of ours the money leaves — its `payout_provider` decides what is offered. */
  sourceAccount: BankAccountBalance | null;
  /** Who is being paid. With neither id there is nobody to look bank accounts up for. */
  party: { companyId?: string | null; contactId?: string | null; name?: string | null };
  value: SendOrRecordState;
  onChange: (next: SendOrRecordState) => void;
  disabled?: boolean;
}

export const SendOrRecordChoice: React.FC<Props> = ({
  workspaceId, sourceAccount, party, value, onChange, disabled,
}) => {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<CounterpartyBankAccount[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [vopBlocked, setVopBlocked] = React.useState(false);

  const provider = sourceAccount?.payout_provider ?? null;
  const hasParty = Boolean(party.companyId || party.contactId);
  const patch = (p: Partial<SendOrRecordState>) => onChange({ ...value, ...p });

  React.useEffect(() => {
    if (!hasParty) { setAccounts([]); return; }
    let cancelled = false;
    setLoading(true);
    void listCounterpartyBankAccounts(workspaceId, party)
      .then((rows) => {
        if (cancelled) return;
        setAccounts(rows);
        // Default to the primary account, but never silently switch one the operator chose.
        if (!value.crmBankAccountId) {
          const preferred = rows.find((r) => r.is_primary && r.iban) ?? rows.find((r) => r.iban);
          if (preferred) patch({ crmBankAccountId: preferred.id });
        }
      })
      .catch(() => { if (!cancelled) setAccounts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads on the party, not on its own default
  }, [workspaceId, party.companyId, party.contactId, hasParty]);

  /**
   * A rail that disappears must take the intent with it.
   *
   * Switching "Paid from" to a plain bookkeeping account after choosing Send would otherwise leave
   * the dialog claiming it is about to move money through an account that cannot, and the refusal
   * would only arrive after the button was pressed.
   */
  React.useEffect(() => {
    if (!provider && value.intent === 'send') patch({ intent: 'record' });
    // Viva has no approval step; carrying a stale 'draft' into it would be refused by the server.
    if (provider === 'viva' && value.sendMode === 'draft') patch({ sendMode: 'payment' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the rail, not to its own reset
  }, [provider]);

  const selected = accounts.find((a) => a.id === value.crmBankAccountId) ?? null;
  const ready = counterpartyReadyFor(selected, provider);

  const verify = async () => {
    if (!selected) return;
    setVerifying(true);
    try {
      await verifyAndLinkRevolutCounterparty(workspaceId, selected.id, { force: value.forceVop });
      setVopBlocked(false);
      const rows = await listCounterpartyBankAccounts(workspaceId, party);
      setAccounts(rows);
      toast({ title: 'Account verified', description: 'The holder name matches this IBAN.' });
    } catch (e) {
      if (isVopMismatch(e)) setVopBlocked(true);
      toast({ title: 'Could not verify', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-sm border border-hairline bg-surface-sunken p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name="payment-intent"
            className="accent-primary"
            checked={value.intent === 'record'}
            disabled={disabled}
            onChange={() => patch({ intent: 'record' })}
          />
          <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Just record it — the money moved elsewhere</span>
        </label>
        <label className={`flex items-center gap-2 text-xs ${provider ? '' : 'opacity-50'}`}>
          <input
            type="radio"
            name="payment-intent"
            className="accent-primary"
            checked={value.intent === 'send'}
            disabled={disabled || !provider}
            onChange={() => patch({ intent: 'send' })}
          />
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{provider ? `Send it now via ${PROVIDER_LABEL[provider]}` : 'Send it now'}</span>
        </label>
      </div>

      {!provider && (
        <p className="text-[11px] text-muted-foreground">
          {sourceAccount
            ? `${sourceAccount.name} can record payments but cannot send them — it is not linked to a Revolut pocket or a Viva wallet. Link it in Finance → Settings, or pick an account that is.`
            : 'Pick the account the money comes from to see whether it can send.'}
        </p>
      )}

      {value.intent === 'send' && provider && (
        <div className="space-y-3 border-t border-hairline pt-3">
          {!hasParty ? (
            <p className="text-[11px] text-warning">
              This payment has no counterparty on it, so there is no account to send to. Pick what
              it settles first.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading {party.name ?? 'their'} accounts…
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-[11px] text-warning">
              {party.name ?? 'This party'} has no bank account on file. Add one with an IBAN on
              their CRM profile (Bank Accounts card) — it is name-checked before any money moves.
            </p>
          ) : (
            <>
              <div>
                <Label className="text-xs" htmlFor="sorc-bank">Send to</Label>
                <Select
                  value={value.crmBankAccountId}
                  onValueChange={(v) => { patch({ crmBankAccountId: v, forceVop: false }); setVopBlocked(false); }}
                  disabled={disabled}
                >
                  <SelectTrigger id="sorc-bank"><SelectValue placeholder="— choose —" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.bank_name || 'Bank'} · {a.account_holder || '—'}
                        {a.iban ? ` · ${a.iban.slice(-6)}` : ' · no IBAN'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected && !selected.iban && (
                <p className="text-[11px] text-destructive">
                  That account has no IBAN, so it cannot be paid.
                </p>
              )}

              {provider === 'revolut' && selected?.iban && !ready && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Revolut has not name-checked this account yet. Money is never sent to an IBAN
                    whose holder name has not been confirmed.
                  </p>
                  {vopBlocked && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="sorc-force"
                        checked={value.forceVop}
                        onCheckedChange={(v) => patch({ forceVop: v === true })}
                      />
                      <Label htmlFor="sorc-force" className="text-[11px] font-normal text-destructive">
                        The holder name does NOT match this IBAN — tick to proceed anyway
                      </Label>
                    </div>
                  )}
                  <Button size="sm" variant="outline" type="button" onClick={() => void verify()} disabled={verifying || disabled}>
                    {verifying
                      ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
                    Verify the holder name
                  </Button>
                </div>
              )}

              {provider === 'revolut' && ready && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sorc-direct"
                    checked={value.sendMode === 'payment'}
                    disabled={disabled}
                    onCheckedChange={(v) => patch({ sendMode: v === true ? 'payment' : 'draft' })}
                  />
                  <Label htmlFor="sorc-direct" className="text-[11px] font-normal text-muted-foreground">
                    Send immediately (skip the approval step in the Revolut app)
                  </Label>
                </div>
              )}

              {provider === 'viva' && selected?.iban && (
                <p className="text-[11px] text-muted-foreground">
                  Viva executes transfers immediately — there is no approval step. It validates the
                  IBAN when the account is linked, but it does <strong>not</strong> confirm that the
                  holder name belongs to it, so check the account before you send.
                </p>
              )}

              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  No payment is written to the books yet. The bank feed records it — and settles
                  what it pays — once the transfer actually lands.
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
