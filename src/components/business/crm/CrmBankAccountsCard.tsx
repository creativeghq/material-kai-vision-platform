import React from 'react';
import { Landmark, Plus, Trash2, Pencil, Loader2, Star, X, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { crmBankAccountsAPI, type CrmBankAccount, type CrmBankAccountInput } from '@/services/crm.service';
import { normalizeIban } from '@/utils/iban';
import { callRevolutApi, getRevolutStatus } from '@/modules/banking-revolut/services/revolutConfigService';

interface Props {
  workspaceId: string;
  /** Pass exactly one of these — the CRM entity these banks belong to. */
  companyId?: string;
  contactId?: string;
}

const EMPTY: CrmBankAccountInput = { bank_name: '', account_holder: '', iban: '', account_ref: '', currency: 'EUR', is_primary: false };

/**
 * Manages the bank accounts that belong to a CRM company / contact (their OWN banks — e.g. a
 * supplier IBAN you pay to). These are selectable on a Bank Payment involving this counterparty.
 * Distinct from the workspace treasury accounts in Finance → Settings.
 */
export const CrmBankAccountsCard: React.FC<Props> = ({ workspaceId, companyId, contactId }) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<CrmBankAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null); // 'new' = add form
  const [form, setForm] = React.useState<CrmBankAccountInput>(EMPTY);
  // Confirmation of Payee via the workspace's Revolut connection (#315). Offered only
  // when Revolut is actually connected; verdict is per-edit-session, not persisted.
  const [vopAvailable, setVopAvailable] = React.useState(false);
  const [vopBusy, setVopBusy] = React.useState(false);
  const [vopVerdict, setVopVerdict] = React.useState<{ code: string; actualName?: string } | null>(null);

  const parent = companyId ? { companyId } : { contactId };

  const load = React.useCallback(async () => {
    if (!companyId && !contactId) { setLoading(false); return; }
    try {
      setLoading(true);
      setRows(await crmBankAccountsAPI.list(parent));
    } catch (e: any) {
      toast({ title: 'Failed to load bank accounts', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    // Silently detect whether this workspace can verify account names (Revolut connected).
    getRevolutStatus(workspaceId)
      .then((s) => setVopAvailable(s.connected && s.enabled))
      .catch(() => setVopAvailable(false));
  }, [workspaceId]);

  const verifyHolder = async () => {
    const name = (form.account_holder ?? '').trim();
    const iban = normalizeIban(form.iban ?? '');
    if (!name || !iban) {
      toast({ title: 'Account holder and IBAN are both needed to verify', variant: 'destructive' });
      return;
    }
    setVopBusy(true);
    setVopVerdict(null);
    try {
      const out = await callRevolutApi<Record<string, unknown>>('validate-account-name', workspaceId, {
        name,
        iban,
        company: Boolean(companyId),
      });
      const code = String(out.result_code ?? out.result ?? 'cannot_be_checked');
      const actual = (out.actual_name ?? (out.company_name as string | undefined)) as string | undefined;
      setVopVerdict({ code, actualName: actual });
    } catch (e: any) {
      toast({ title: 'Verification unavailable', description: e?.message, variant: 'destructive' });
    } finally {
      setVopBusy(false);
    }
  };

  const vopWord = vopVerdict && (
    vopVerdict.code === 'matched'
      ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Name matches this account</span>
      : vopVerdict.code === 'close_match'
        ? <span className="text-xs text-amber-600 dark:text-amber-400">Close match{vopVerdict.actualName ? ` — bank has “${vopVerdict.actualName}”` : ''}</span>
        : vopVerdict.code === 'not_matched'
          ? <span className="text-xs text-destructive">Name does NOT match this account — verify before paying</span>
          : <span className="text-xs text-muted-foreground">Could not be checked for this bank</span>
  );

  const startAdd = () => { setForm(EMPTY); setVopVerdict(null); setEditingId('new'); };
  const startEdit = (r: CrmBankAccount) => {
    setForm({ bank_name: r.bank_name, account_holder: r.account_holder ?? '', iban: r.iban ?? '', account_ref: r.account_ref ?? '', currency: r.currency, is_primary: r.is_primary, notes: r.notes ?? '' });
    setVopVerdict(null);
    setEditingId(r.id);
  };
  const cancel = () => { setEditingId(null); setForm(EMPTY); setVopVerdict(null); };

  const save = async () => {
    if (!(form.bank_name ?? '').trim()) { toast({ title: 'Bank name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editingId === 'new') {
        await crmBankAccountsAPI.create({ workspaceId, ...parent }, form);
      } else if (editingId) {
        await crmBankAccountsAPI.update(editingId, form);
      }
      cancel();
      await load();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this bank account?')) return;
    try { await crmBankAccountsAPI.remove(id); await load(); }
    catch (e: any) { toast({ title: 'Failed to delete', description: e?.message, variant: 'destructive' }); }
  };

  const makePrimary = async (id: string) => {
    try {
      // At most one primary — clear the others client-side, then set this one.
      await Promise.all(rows.filter((r) => r.is_primary && r.id !== id).map((r) => crmBankAccountsAPI.update(r.id, { is_primary: false })));
      await crmBankAccountsAPI.update(id, { is_primary: true });
      await load();
    } catch (e: any) { toast({ title: 'Failed to set primary', description: e?.message, variant: 'destructive' }); }
  };

  const editor = (
    <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Bank name *</Label>
          <Input value={form.bank_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. Piraeus Bank" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Account holder</Label>
          <Input value={form.account_holder ?? ''} onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))} placeholder="Name on the account" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">IBAN</Label>
          <Input value={form.iban ?? ''} onChange={(e) => { setForm((f) => ({ ...f, iban: normalizeIban(e.target.value) })); setVopVerdict(null); }} placeholder="GR16 0110 1250 0000 0001 2300 695" className="font-mono" />
          {vopAvailable && (
            <div className="flex items-center gap-2 pt-0.5">
              <Button size="sm" variant="outline" type="button" onClick={verifyHolder} disabled={vopBusy}>
                {vopBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Verify holder
              </Button>
              {vopWord}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">SWIFT / Account #</Label>
            <Input value={form.account_ref ?? ''} onChange={(e) => setForm((f) => ({ ...f, account_ref: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Currency</Label>
            <Input value={form.currency ?? 'EUR'} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}Save</Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4" />Bank Accounts</CardTitle>
        {editingId === null && <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add bank</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          This contact&rsquo;s own bank accounts — offered on a Bank Payment involving them. Separate from your own accounts in Finance&nbsp;→&nbsp;Settings.
        </p>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {rows.map((r) => editingId === r.id ? <div key={r.id}>{editor}</div> : (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.bank_name}</span>
                    {r.is_primary && <Badge variant="outline" className="text-[9px] py-0"><Star className="h-2.5 w-2.5 mr-0.5" />Primary</Badge>}
                    {r.currency !== 'EUR' && <span className="text-[10px] text-muted-foreground">{r.currency}</span>}
                  </div>
                  {r.account_holder && <div className="text-xs text-muted-foreground truncate">{r.account_holder}</div>}
                  {r.iban && <div className="text-xs font-mono text-muted-foreground truncate">{r.iban}</div>}
                  {r.account_ref && <div className="text-[11px] text-muted-foreground">SWIFT/Acct: {r.account_ref}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!r.is_primary && <button type="button" title="Make primary" className="text-muted-foreground hover:text-foreground p-1" onClick={() => makePrimary(r.id)}><Star className="h-3.5 w-3.5" /></button>}
                  <button type="button" title="Edit" className="text-muted-foreground hover:text-foreground p-1" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Delete" className="text-muted-foreground hover:text-destructive p-1" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {editingId === 'new' && editor}
            {rows.length === 0 && editingId === null && (
              <p className="text-xs text-muted-foreground py-2">No bank accounts yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CrmBankAccountsCard;
