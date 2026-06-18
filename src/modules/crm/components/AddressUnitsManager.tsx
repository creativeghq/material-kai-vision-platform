import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, Star } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  addressUnitsAPI, formatAddressLine, type AddressUnit, type AddressUnitInput,
} from '@/services/crm.service';

interface Props {
  /** Exactly one of companyId / contactId identifies the parent party. */
  companyId?: string;
  contactId?: string;
  /** Hide add/edit/delete controls (read-only view). */
  readOnly?: boolean;
}

const EMPTY: AddressUnitInput = {
  label: '', branch_number: null, street: '', street_number: '',
  postal_code: '', city: '', state: '', country: '', is_default: false,
};

/**
 * Manage the secondary "sub-unit" addresses (branches / establishments / warehouses)
 * of a CRM company or contact. The party's main address lives on the party row itself;
 * these are additional named units that invoices / quotes / projects / delivery notes
 * can be addressed to instead of the main address.
 */
export const AddressUnitsManager: React.FC<Props> = ({ companyId, contactId, readOnly }) => {
  const { toast } = useToast();
  const [units, setUnits] = useState<AddressUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressUnitInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const parent = companyId ? { companyId } : { contactId: contactId! };
  const hasParent = !!companyId || !!contactId;

  const load = useCallback(async () => {
    if (!hasParent) return;
    setLoading(true);
    try {
      setUnits(await addressUnitsAPI.list(parent));
    } catch (e) {
      console.error('Failed to load address units', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (u: AddressUnit) => {
    setEditingId(u.id);
    setForm({
      label: u.label, branch_number: u.branch_number, street: u.street, street_number: u.street_number,
      postal_code: u.postal_code, city: u.city, state: u.state, country: u.country,
      country_code: u.country_code, is_default: u.is_default,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label || form.label.trim() === '') {
      toast({ title: 'Label required', description: 'Give the sub-unit a name (e.g. "Warehouse").', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await addressUnitsAPI.update(editingId, form);
      } else {
        await addressUnitsAPI.create(parent, form);
      }
      setDialogOpen(false);
      await load();
      toast({ title: 'Saved', description: 'Sub-unit address saved.' });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: AddressUnit) => {
    if (!confirm(`Delete sub-unit "${u.label}"?`)) return;
    try {
      await addressUnitsAPI.remove(u.id);
      await load();
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const setField = (k: keyof AddressUnitInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Sub Units
          {units.length > 0 && <Badge variant="secondary">{units.length}</Badge>}
        </CardTitle>
        {!readOnly && hasParent && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add sub-unit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasParent && (
          <p className="text-sm text-muted-foreground">Save this record first to add sub-units.</p>
        )}
        {hasParent && !loading && units.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sub-units. Add a branch, warehouse, or establishment address to use on documents instead of the main address.
          </p>
        )}
        {units.map((u) => (
          <div key={u.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{u.label}</span>
                {u.is_default && (
                  <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Default</Badge>
                )}
                {u.branch_number != null && (
                  <Badge variant="outline">Branch #{u.branch_number}</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {formatAddressLine(u) || '—'}
              </div>
            </div>
            {!readOnly && (
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label="Edit sub-unit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(u)} aria-label="Delete sub-unit">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit sub-unit' : 'Add sub-unit'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="su-label">Name *</Label>
              <Input id="su-label" value={form.label || ''} onChange={(e) => setField('label', e.target.value)} placeholder="Warehouse / Branch A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-street">Street</Label>
              <Input id="su-street" value={form.street || ''} onChange={(e) => setField('street', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-num">Number</Label>
              <Input id="su-num" value={form.street_number || ''} onChange={(e) => setField('street_number', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-postal">Postal Code</Label>
              <Input id="su-postal" value={form.postal_code || ''} onChange={(e) => setField('postal_code', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-city">City</Label>
              <Input id="su-city" value={form.city || ''} onChange={(e) => setField('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-state">State/Region</Label>
              <Input id="su-state" value={form.state || ''} onChange={(e) => setField('state', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-country">Country</Label>
              <Input id="su-country" value={form.country || ''} onChange={(e) => setField('country', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-branch">ΑΑΔΕ Branch # (optional)</Label>
              <Input
                id="su-branch" type="number" inputMode="numeric"
                value={form.branch_number ?? ''}
                onChange={(e) => setField('branch_number', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="e.g. 1 (myDATA establishment)"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch id="su-default" checked={!!form.is_default} onCheckedChange={(v) => setField('is_default', v)} />
              <Label htmlFor="su-default">Pre-select this unit on new documents for this party</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AddressUnitsManager;
