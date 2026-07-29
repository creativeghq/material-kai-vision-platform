// The single "where did the money move" picker used by every finance dialog.
//
// ONE control: the account. Accounts are grouped by what they ARE (Banks / Cash / Cards /
// Online / Other) and each shows its live running balance, so you pick knowing what's in it.
//
// There is deliberately NO method select. The account already answers it — a cash account IS
// cash, a card account IS card, a bank account books as a transfer — and asking again produced
// a second control that could contradict the first. `method` is still reported to the caller
// (payments.method is constrained), derived from the account's kind. Manage the accounts, and
// the method follows.
//
// There is also no "unassigned" option: money that moved, moved somewhere.
import React, { useEffect, useMemo } from 'react';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  financeService, PAYMENT_METHOD_LABEL, defaultMethodForAccountKind,
  ACCOUNT_KIND_LABEL, ACCOUNT_KIND_ORDER,
  type PaymentMethod, type BankAccountKind, type BankAccountBalance,
} from '@/modules/finance/services/financeService';

interface Props {
  workspaceId: string;
  value: string;
  onChange: (bankAccountId: string) => void;
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  /** Pre-loaded rows (avoids a second fetch when the parent already has them). */
  accounts?: BankAccountBalance[];
  onAccountsLoaded?: (accounts: BankAccountBalance[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const fmt = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'EUR' }).format(n);
  } catch { return `${n.toFixed(2)} ${currency || ''}`.trim(); }
};

export const PaidFromSelect: React.FC<Props> = ({
  workspaceId, value, onChange, method, onMethodChange,
  accounts: accountsProp, onAccountsLoaded, disabled, label = 'Paid from', className,
}) => {
  const [rows, setRows] = React.useState<BankAccountBalance[]>(accountsProp ?? []);

  useEffect(() => {
    if (accountsProp) { setRows(accountsProp); return; }
    if (!workspaceId) return;
    let cancelled = false;
    financeService.getBankAccountBalances(workspaceId)
      .then((accts) => {
        if (cancelled) return;
        setRows(accts);
        onAccountsLoaded?.(accts);
      })
      .catch(() => { /* picker degrades to empty — the caller still validates */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, accountsProp]);

  const selected = useMemo(() => rows.find((r) => r.bank_account_id === value) ?? null, [rows, value]);
  const kind = (selected?.kind ?? null) as BankAccountKind | null;
  // The account decides the method. Snap on every account change so the value the caller
  // submits can never disagree with the account it says the money moved through.
  useEffect(() => {
    if (!selected) return;
    const implied = defaultMethodForAccountKind(kind);
    if (method !== implied) onMethodChange(implied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.bank_account_id]);

  const grouped = useMemo(() => ACCOUNT_KIND_ORDER
    .map((k) => ({ kind: k, items: rows.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length > 0), [rows]);

  return (
    <div className={className}>
      <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Select
            value={value || ''}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select an account" /></SelectTrigger>
            <SelectContent>
              {grouped.map((g) => (
                <SelectGroup key={g.kind}>
                  <SelectLabel>{ACCOUNT_KIND_LABEL[g.kind]}</SelectLabel>
                  {g.items.map((a) => (
                    <SelectItem key={a.bank_account_id} value={a.bank_account_id}>
                      <span className="flex w-full items-center justify-between gap-4">
                        <span>{a.name}{a.is_default ? ' (default)' : ''}</span>
                        <span className={`tabular-nums text-xs ${a.current_balance < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {fmt(Number(a.current_balance ?? 0), a.currency)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {grouped.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No accounts yet — add one in Finance → Settings.
                </div>
              )}
            </SelectContent>
          </Select>
          {selected && (
            <p className="mt-1 text-xs text-muted-foreground">
              Balance {fmt(Number(selected.current_balance ?? 0), selected.currency)}
              {` · booked as ${PAYMENT_METHOD_LABEL[defaultMethodForAccountKind(kind)]}`}
            </p>
          )}
      </div>
    </div>
  );
};

export default PaidFromSelect;
