// The single "where did the money move" picker used by every finance dialog.
//
// Two things it fixes over the old two-select pattern:
//   1. Accounts are grouped by what they ARE (Banks / Cash / Cards / Online / Other) and each
//      one shows its live running balance, so you pick the account knowing what's in it.
//   2. "Method" is derived from the account kind instead of being asked twice. A cash account
//      IS cash; a card account IS card. The method select only appears for kinds where it
//      still carries information (a bank clears transfers AND cheques).
import React, { useEffect, useMemo } from 'react';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  financeService, PAYMENT_METHOD_LABEL, methodsForAccountKind, defaultMethodForAccountKind,
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
  /** Offer an "unassigned" option for money whose account isn't known yet. */
  allowUnassigned?: boolean;
  className?: string;
}

const NONE = '__none__';

const fmt = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'EUR' }).format(n);
  } catch { return `${n.toFixed(2)} ${currency || ''}`.trim(); }
};

export const PaidFromSelect: React.FC<Props> = ({
  workspaceId, value, onChange, method, onMethodChange,
  accounts: accountsProp, onAccountsLoaded, disabled, label = 'Paid from',
  allowUnassigned = false, className,
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
  const methodOptions = useMemo(() => methodsForAccountKind(kind), [kind]);

  // Keep the method consistent with the account: if the chosen account can't have the current
  // method (switched bank → cash), snap it to the one the account implies.
  useEffect(() => {
    if (!selected) return;
    if (!methodOptions.includes(method)) onMethodChange(defaultMethodForAccountKind(kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.bank_account_id, methodOptions.join(',')]);

  const grouped = useMemo(() => ACCOUNT_KIND_ORDER
    .map((k) => ({ kind: k, items: rows.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length > 0), [rows]);

  // Only ask for a method where the account kind leaves it genuinely open. With no account
  // picked at all there is nothing to derive from, so the full list stays available.
  const showMethod = methodOptions.length > 1;

  return (
    <div className={className}>
      <div className={showMethod ? 'grid grid-cols-2 gap-3' : ''}>
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Select
            value={value || (allowUnassigned ? NONE : '')}
            onValueChange={(v) => onChange(v === NONE ? '' : v)}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select an account" /></SelectTrigger>
            <SelectContent>
              {allowUnassigned && <SelectItem value={NONE}>— Unassigned (no account) —</SelectItem>}
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
              {!showMethod ? ` · booked as ${PAYMENT_METHOD_LABEL[defaultMethodForAccountKind(kind)]}` : ''}
            </p>
          )}
        </div>
        {showMethod && (
          <div>
            <Label className="text-xs text-muted-foreground">Method</Label>
            <Select value={method} onValueChange={(v) => onMethodChange(v as PaymentMethod)} disabled={disabled}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {methodOptions.map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The account says WHERE the money sits; for kinds that clear more than one way this
                says HOW it left. Cash/card/online accounts derive it and never render this. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {selected ? `How it cleared this ${ACCOUNT_KIND_LABEL[kind as BankAccountKind].replace(/s$/, '').toLowerCase()} account.` : 'How the money moved.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaidFromSelect;
