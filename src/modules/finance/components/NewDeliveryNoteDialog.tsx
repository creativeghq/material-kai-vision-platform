/**
 * Create a delivery note. Pick a customer (optional), add warehouse
 * items as lines, save as draft or issue immediately. Issuing decrements stock for each
 * warehouse-linked line.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Plus, Trash2, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { deliveryNotesService, type WarehousePick, type DeliveryLineInput } from '@/modules/finance/services/deliveryNotesService';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';
import { AddressUnitSelect } from '@/modules/crm/components/AddressUnitSelect';

export const NewDeliveryNoteDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [warehouse, setWarehouse] = useState<WarehousePick[]>([]);
  const [kind, setKind] = useState<'dispatch' | 'receipt'>('dispatch');
  const [customer, setCustomer] = useState<string>('');
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  const [branchCode, setBranchCode] = useState<string>('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DeliveryLineInput[]>([]);
  // Transport details
  const [transportDate, setTransportDate] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [movePurpose, setMovePurpose] = useState('1');
  // Structured from/to addresses (myDATA 9.3). Loading prefills from your business,
  // delivery prefills from the selected customer; both editable per note.
  const emptyAddr = { street: '', number: '', postal: '', city: '' };
  const [fromAddr, setFromAddr] = useState({ ...emptyAddr });
  const [toAddr, setToAddr] = useState({ ...emptyAddr });
  // Chosen customer sub-unit as the delivery point (null = main address).
  const [toUnitId, setToUnitId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('dispatch'); setCustomer(''); setNotes(''); setLines([]); setBranchCode('0');
    setTransportDate(''); setVehicleNumber(''); setMovePurpose('1');
    setFromAddr({ ...emptyAddr }); setToAddr({ ...emptyAddr }); setToUnitId(null);
    (async () => {
      const [{ data: cos }, wh, { data: fs }, br] = await Promise.all([
        supabase.from('crm_companies').select('id, name').eq('workspace_id', workspaceId).order('name').limit(500),
        deliveryNotesService.listWarehouse(workspaceId),
        supabase.from('finance_settings').select('business_address, business_street_number, business_postal_code, business_city').eq('workspace_id', workspaceId).maybeSingle(),
        invoicingSetupService.listBranches(workspaceId).catch(() => [] as FinanceBranch[]),
      ]);
      setCompanies((cos ?? []) as any);
      setWarehouse(wh);
      setBranches(br);
      // Loading address defaults to your premises.
      if (fs) setFromAddr({ street: fs.business_address ?? '', number: fs.business_street_number ?? '', postal: fs.business_postal_code ?? '', city: fs.business_city ?? '' });
    })();
  }, [open, workspaceId]);

  // Prefill the delivery address from the selected customer's main CRM address, and reset
  // any previously-chosen sub-unit (the picker re-adopts the new customer's default).
  useEffect(() => {
    setToUnitId(null);
    if (!open || !customer) return;
    (async () => {
      const { data: c } = await supabase
        .from('crm_companies').select('street, street_number, postal_code, city')
        .eq('id', customer).maybeSingle();
      if (c) setToAddr({ street: (c as any).street ?? '', number: (c as any).street_number ?? '', postal: (c as any).postal_code ?? '', city: (c as any).city ?? '' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, open]);

  // myDATA 9.3 needs a complete delivery address. Warn before issuing a dispatch note.
  const toIncomplete = kind === 'dispatch' && (!toAddr.street.trim() || !toAddr.postal.trim() || !toAddr.city.trim());

  const addItem = (id: string) => {
    const w = warehouse.find((x) => x.id === id);
    if (!w) return;
    setLines((ls) => [...ls, { warehouse_item_id: w.id, product_id: w.product_id, description: w.name, sku: w.sku, quantity: 1, unit: w.unit }]);
  };
  const setQty = (i: number, q: number) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, quantity: q } : l));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const submit = async (issue: boolean) => {
    if (lines.length === 0) { toast({ title: 'Add at least one item', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const id = await deliveryNotesService.create(workspaceId, {
        kind, customerCompanyId: customer || null, branchCode: parseInt(branchCode, 10) || 0, notes, lines,
        transportDate, vehicleNumber, movePurpose,
        shipFrom: [fromAddr.street, fromAddr.number].filter(Boolean).join(' ') || undefined,
        shipTo: [toAddr.street, toAddr.number].filter(Boolean).join(' ') || undefined,
        shipFromStreet: fromAddr.street || undefined, shipFromNumber: fromAddr.number || undefined,
        shipFromPostal: fromAddr.postal || undefined, shipFromCity: fromAddr.city || undefined,
        shipToStreet: toAddr.street || undefined, shipToNumber: toAddr.number || undefined,
        shipToPostal: toAddr.postal || undefined, shipToCity: toAddr.city || undefined,
        shipToAddressUnitId: toUnitId,
      });
      if (issue) await deliveryNotesService.issue(id);
      toast({ title: issue ? 'Delivery note issued' : 'Draft saved' });
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> New {kind === 'receipt' ? 'goods-receipt note' : 'delivery note'}</DialogTitle><DialogDescription className="sr-only">Create a delivery note or goods-receipt note.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatch">Delivery note (dispatch · stock out)</SelectItem>
                <SelectItem value="receipt">Goods-receipt note (receive · stock in)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{kind === 'receipt' ? 'Supplier' : 'Customer'} (optional)</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {/* Deliver to one of the customer's additional addresses (prefills the address below). */}
              {customer && (
                <AddressUnitSelect
                  companyId={customer}
                  value={toUnitId}
                  label="Deliver to"
                  onChange={(id, unit) => {
                    setToUnitId(id);
                    if (unit) {
                      setToAddr({
                        street: unit.street ?? unit.address ?? '',
                        number: unit.street_number ?? '',
                        postal: unit.postal_code ?? '',
                        city: unit.city ?? '',
                      });
                    }
                  }}
                />
              )}
            </div>
            {branches.length > 1 && (
              <div className="space-y-1">
                <Label>Establishment</Label>
                <Select value={branchCode} onValueChange={setBranchCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.branch_code)}>#{b.branch_code} {b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Transport details */}
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Transport date</Label>
              <Input type="date" className="h-8 text-xs" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle no.</Label>
              <Input className="h-8 text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="ABC-1234" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Purpose</Label>
              <Select value={movePurpose} onValueChange={setMovePurpose}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Sale</SelectItem>
                  <SelectItem value="2">2 — Sale on behalf of third party</SelectItem>
                  <SelectItem value="3">3 — Sampling</SelectItem>
                  <SelectItem value="4">4 — Exhibition</SelectItem>
                  <SelectItem value="5">5 — Return</SelectItem>
                  <SelectItem value="6">6 — Movement between premises</SelectItem>
                  <SelectItem value="7">7 — Consignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Structured from/to addresses (myDATA 9.3) */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 rounded-md border border-border/60 p-3">
              <Label className="text-xs font-medium">Loading place (from)</Label>
              <AddressFields value={fromAddr} onChange={setFromAddr} />
            </div>
            <div className="space-y-1 rounded-md border border-border/60 p-3">
              <Label className="text-xs font-medium">Delivery place (to)</Label>
              <AddressFields value={toAddr} onChange={setToAddr} />
            </div>
          </div>
          {toIncomplete && (
            <p className="text-[11px] text-amber-500">
              Delivery address looks incomplete (street, postal code and city are needed). myDATA may reject this 9.3 note until it’s filled.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Select value="" onValueChange={addItem}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="+ Add warehouse item" /></SelectTrigger>
                <SelectContent>
                  {warehouse.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No warehouse items</div>
                    : warehouse.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.qty_on_hand != null ? ` (${w.qty_on_hand})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items yet.</p>
            ) : (
              <div className="space-y-1">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0 truncate">{l.description}{l.unit ? <span className="text-muted-foreground"> /{l.unit}</span> : ''}</div>
                    <Input type="number" min="1" step="1" className="h-8 w-20 text-xs" value={l.quantity}
                      onChange={(e) => setQty(i, Number(e.target.value) || 1)} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shipping reference, vehicle, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => submit(false)} disabled={busy}>Save draft</Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue ({kind === 'receipt' ? 'add to stock' : 'decrement stock'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type Addr = { street: string; number: string; postal: string; city: string };
const AddressFields: React.FC<{ value: Addr; onChange: (a: Addr) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    <Input className="h-8 text-xs col-span-2" value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Street" />
    <Input className="h-8 text-xs" value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder="No." />
    <Input className="h-8 text-xs" value={value.postal} onChange={(e) => onChange({ ...value, postal: e.target.value })} placeholder="Postal code" />
    <Input className="h-8 text-xs col-span-2" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" />
  </div>
);
