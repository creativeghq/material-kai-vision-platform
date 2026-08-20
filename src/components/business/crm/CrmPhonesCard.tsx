import React from 'react';
import { Phone, Plus, Trash2, Pencil, Loader2, Star, X, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  crmPhonesAPI, CRM_PHONE_TYPES, type CrmPhone, type CrmPhoneInput,
} from '@/services/crm.service';

interface Props {
  workspaceId: string;
  /** Pass exactly one of these — the CRM entity these numbers belong to. */
  companyId?: string;
  contactId?: string;
}

const EMPTY: CrmPhoneInput = { label: '', phone: '', phone_type: 'other', is_primary: false };

/**
 * Additional named phone numbers for a CRM company / contact — Reception, Warehouse, Accounts,
 * After-hours, a second mobile. The party's MAIN number stays on the record itself (that is the
 * one invoices, PDFs and the fiscal party builder read); these are extras, each with a name.
 */
export const CrmPhonesCard: React.FC<Props> = ({ workspaceId, companyId, contactId }) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<CrmPhone[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null); // 'new' = add form
  const [form, setForm] = React.useState<CrmPhoneInput>(EMPTY);

  const parent = companyId ? { companyId } : { contactId };

  const load = React.useCallback(async () => {
    if (!companyId && !contactId) { setLoading(false); return; }
    try {
      setLoading(true);
      setRows(await crmPhonesAPI.list(parent));
    } catch (e: any) {
      toast({ title: 'Failed to load phone numbers', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId]);

  React.useEffect(() => { void load(); }, [load]);

  const startAdd = () => { setForm(EMPTY); setEditingId('new'); };
  const startEdit = (r: CrmPhone) => {
    setForm({ label: r.label, phone: r.phone, phone_type: r.phone_type, is_primary: r.is_primary, notes: r.notes ?? '' });
    setEditingId(r.id);
  };
  const cancel = () => { setEditingId(null); setForm(EMPTY); };

  const save = async () => {
    if (!(form.label ?? '').trim()) { toast({ title: 'Give this number a name', description: 'e.g. Reception, Warehouse, Accounts.', variant: 'destructive' }); return; }
    if (!(form.phone ?? '').trim()) { toast({ title: 'Phone number is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editingId === 'new') {
        await crmPhonesAPI.create({ workspaceId, ...parent }, form);
      } else if (editingId) {
        await crmPhonesAPI.update(editingId, form);
      }
      cancel();
      await load();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this phone number?')) return;
    try { await crmPhonesAPI.remove(id); await load(); }
    catch (e: any) { toast({ title: 'Failed to delete', description: e?.message, variant: 'destructive' }); }
  };

  const makePrimary = async (id: string) => {
    try {
      // At most one primary — clear the others client-side, then set this one.
      await Promise.all(rows.filter((r) => r.is_primary && r.id !== id).map((r) => crmPhonesAPI.update(r.id, { is_primary: false })));
      await crmPhonesAPI.update(id, { is_primary: true });
      await load();
    } catch (e: any) { toast({ title: 'Failed to set primary', description: e?.message, variant: 'destructive' }); }
  };

  const editor = (
    <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Name *</Label>
          <Input value={form.label ?? ''} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Reception" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone number *</Label>
          <Input type="tel" value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+30 210 123 4567" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={form.phone_type ?? 'other'} onValueChange={(v) => setForm((f) => ({ ...f, phone_type: v as CrmPhoneInput['phone_type'] }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CRM_PHONE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional — e.g. Mon–Fri 9–5" />
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
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" />Phone Numbers
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </CardTitle>
        {editingId === null && (!!companyId || !!contactId) && (
          <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add number</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          Extra numbers beyond the main one on the record — each with its own name (Reception, Warehouse, Accounts…).
        </p>
        {!companyId && !contactId ? (
          <p className="text-xs text-muted-foreground py-2">Save this record first to add phone numbers.</p>
        ) : loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {rows.map((r) => editingId === r.id ? <div key={r.id}>{editor}</div> : (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.label}</span>
                    {r.is_primary && <Badge variant="outline" className="text-[9px] py-0"><Star className="h-2.5 w-2.5 mr-0.5" />Primary</Badge>}
                    <span className="text-[10px] text-muted-foreground capitalize">{r.phone_type}</span>
                  </div>
                  <a href={`tel:${r.phone}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{r.phone}</a>
                  {r.notes && <div className="text-[11px] text-muted-foreground truncate">{r.notes}</div>}
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
              <HubEmptyState
                icon={Phone}
                title="No extra numbers yet"
                description="Beyond the main number on the record — reception, the warehouse, accounts, an after-hours line. Each one gets its own name, so whoever is calling knows which to use."
                action={<Button size="sm" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add number</Button>}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CrmPhonesCard;
