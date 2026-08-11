import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock, CheckCircle2, Download, History, Loader2, Paperclip, Plus, ShieldCheck,
  Trash2, Wrench, SkipForward,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import {
  customerAssetsService, describeInterval, warrantyState,
  type AssetDetail, type AssetWarranty, type CustomerAsset, type ServiceDueRow,
  type ServiceHistoryRow, type WarrantyKind,
} from '@/services/customerAssetsService';

interface EquipmentServiceTabProps {
  /** Exactly one of these identifies whose equipment this is. */
  companyId?: string;
  contactId?: string;
  /** Optional: scope the list to one project (used from the project workbench). */
  projectId?: string;
}

const WARRANTY_KINDS: Array<{ value: WarrantyKind; label: string }> = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'extended', label: 'Extended' },
  { value: 'installer', label: 'Installer / labour' },
  { value: 'insurance', label: 'Insurance' },
];

const today = () => new Date().toISOString().slice(0, 10);

/** "in 12 days" / "3 days overdue" — the only place a due date becomes a phrase. */
function dueLabel(row: { due_on: string; days_until_due: number; is_overdue: boolean }): string {
  if (row.is_overdue) {
    const late = Math.abs(row.days_until_due);
    return late === 0 ? 'due today' : `${late} day${late === 1 ? '' : 's'} overdue`;
  }
  if (row.days_until_due === 0) return 'due today';
  return `in ${row.days_until_due} day${row.days_until_due === 1 ? '' : 's'}`;
}

/**
 * Equipment & Service — the customer's installed base (#343).
 *
 * Shows what they own, whether it is still under warranty, and what maintenance is coming up.
 * "Next due" is never computed here: it is the open occurrence the server returns, because a
 * second derivation of it on the client is exactly the drift CLAUDE.md forbids.
 */
export const EquipmentServiceTab: React.FC<EquipmentServiceTabProps> = ({
  companyId, contactId, projectId,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<CustomerAsset[]>([]);
  const [due, setDue] = useState<ServiceDueRow[]>([]);
  const [history, setHistory] = useState<ServiceHistoryRow[]>([]);
  const [openAsset, setOpenAsset] = useState<AssetDetail | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const scope = useMemo(() => ({
    ...(companyId ? { customer_company_id: companyId } : {}),
    ...(contactId ? { customer_contact_id: contactId } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  }), [companyId, contactId, projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, d, h] = await Promise.all([
        customerAssetsService.list(scope),
        customerAssetsService.serviceDue(scope),
        customerAssetsService.serviceHistory(scope),
      ]);
      setAssets(a);
      setDue(d);
      setHistory(h);
    } catch (err) {
      toast({
        title: 'Could not load equipment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [scope, toast]);

  useEffect(() => { void load(); }, [load]);

  const dueByAsset = useMemo(() => {
    const m = new Map<string, ServiceDueRow[]>();
    for (const row of due) {
      const list = m.get(row.asset_id) ?? [];
      list.push(row);
      m.set(row.asset_id, list);
    }
    return m;
  }, [due]);

  const openDetail = async (assetId: string) => {
    try {
      setOpenAsset(await customerAssetsService.get(assetId));
    } catch (err) {
      toast({
        title: 'Could not open equipment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const completeService = async (eventId: string, skip: boolean) => {
    setBusy(true);
    try {
      if (skip) await customerAssetsService.skipService(eventId);
      else await customerAssetsService.completeService(eventId);
      toast({ title: skip ? 'Service skipped' : 'Service logged', description: 'The next one has been scheduled.' });
      await load();
      if (openAsset) await openDetail(openAsset.asset.id);
    } catch (err) {
      toast({
        title: 'Could not update the service',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const overdueCount = due.filter((d) => d.is_overdue).length;
  const soonCount = due.filter((d) => !d.is_overdue && d.is_within_lead_time).length;

  return (
    <div className="space-y-4">
      {/* ── Coming up ─────────────────────────────────────────────────────── */}
      {due.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service coming up
            </CardTitle>
            <CardDescription>
              {overdueCount > 0 && <span className="text-red-500 dark:text-red-400">{overdueCount} overdue</span>}
              {overdueCount > 0 && soonCount > 0 && ' · '}
              {soonCount > 0 && <span>{soonCount} inside the reminder window</span>}
              {overdueCount === 0 && soonCount === 0 && 'Nothing needs attention yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.map((row) => (
                  <TableRow key={row.event_id}>
                    <TableCell className="font-medium">
                      <button type="button" className="hover:underline text-left" onClick={() => void openDetail(row.asset_id)}>
                        {row.asset_name}
                      </button>
                      {row.serial_number && (
                        <div className="text-xs text-muted-foreground font-mono">{row.serial_number}</div>
                      )}
                    </TableCell>
                    <TableCell>{row.plan_title}</TableCell>
                    <TableCell>
                      <span className={statusTone(row.is_overdue ? 'overdue' : 'due')}>
                        {row.due_on} · {dueLabel(row)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[row.project_name, row.location_note].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void completeService(row.event_id, false)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Done
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void completeService(row.event_id, true)}>
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── The register ──────────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>Equipment</CardTitle>
            <CardDescription>
              Units this customer owns. Anything sold on a delivered order is registered
              automatically when the product is marked serviceable.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add equipment
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…
            </div>
          ) : assets.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No equipment registered yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Next service</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => {
                  const next = (dueByAsset.get(a.id) ?? [])[0];
                  return (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => void openDetail(a.id)}>
                      <TableCell className="font-medium">
                        {a.name}
                        {(a.brand || a.model) && (
                          <div className="text-xs text-muted-foreground">
                            {[a.brand, a.model].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{a.serial_number || '—'}</TableCell>
                      <TableCell className="text-xs">{a.installed_on || a.purchased_on || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {next
                          ? <span className={statusTone(next.is_overdue ? 'overdue' : 'due')}>{next.plan_title} · {next.due_on}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={statusTone(a.status)}>{a.status}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── What has already been done, across every unit this customer owns ─────── */}
      {history.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Service history
            </CardTitle>
            <CardDescription>
              Every visit logged against this customer's equipment. Entries survive the removal
              of the schedule that produced them.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.event_id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {h.happened_on}
                      {h.was_late && <span className="ml-1 text-amber-600 dark:text-amber-400">late</span>}
                    </TableCell>
                    <TableCell className="font-medium">
                      <button type="button" className="hover:underline text-left" onClick={() => void openDetail(h.asset_id)}>
                        {h.asset_name}
                      </button>
                    </TableCell>
                    <TableCell>
                      {h.plan_title}
                      {h.plan_removed && (
                        <span className="ml-1 text-xs text-muted-foreground">(schedule removed)</span>
                      )}
                    </TableCell>
                    <TableCell className={statusTone(h.status)}>{h.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.performed_by_name || '—'}</TableCell>
                    <TableCell className="text-right text-xs">
                      {h.cost != null ? Number(h.cost).toFixed(2) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddEquipmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        contactId={contactId}
        projectId={projectId}
        onSaved={() => { setAddOpen(false); void load(); }}
      />

      <AssetDetailDialog
        detail={openAsset}
        onOpenChange={(o) => { if (!o) setOpenAsset(null); }}
        onChanged={async () => { await load(); if (openAsset) await openDetail(openAsset.asset.id); }}
      />
    </div>
  );
};

// ── Add equipment ──────────────────────────────────────────────────────────
const AddEquipmentDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  contactId?: string;
  projectId?: string;
  onSaved: () => void;
}> = ({ open, onOpenChange, companyId, contactId, projectId, onSaved }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', brand: '', model: '', serial_number: '',
    installed_on: today(), location_note: '', notes: '',
  });

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await customerAssetsService.register({
        name: form.name.trim(),
        customer_company_id: companyId ?? null,
        customer_contact_id: contactId ?? null,
        project_id: projectId ?? null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        installed_on: form.installed_on || null,
        location_note: form.location_note.trim() || null,
        notes: form.notes.trim() || null,
      });
      toast({ title: 'Equipment registered' });
      setForm({ name: '', brand: '', model: '', serial_number: '', installed_on: today(), location_note: '', notes: '' });
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not register the equipment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add equipment</DialogTitle>
          <DialogDescription>
            A unit this customer owns that we did not sell them, or one delivered before
            the register existed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="eq-name">Name</Label>
            <Input id="eq-name" value={form.name} placeholder="Split air conditioner, living room"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="eq-brand">Brand</Label>
              <Input id="eq-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="eq-model">Model</Label>
              <Input id="eq-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="eq-serial">Serial number</Label>
              <Input id="eq-serial" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="eq-installed">Installed on</Label>
              <Input id="eq-installed" type="date" value={form.installed_on}
                onChange={(e) => setForm({ ...form, installed_on: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="eq-location">Location</Label>
            <Input id="eq-location" value={form.location_note} placeholder="Second floor, north wall"
              onChange={(e) => setForm({ ...form, location_note: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="eq-notes">Notes</Label>
            <Textarea id="eq-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Detail: warranties + plans ─────────────────────────────────────────────
const AssetDetailDialog: React.FC<{
  detail: AssetDetail | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => Promise<void>;
}> = ({ detail, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [warranty, setWarranty] = useState({
    kind: 'manufacturer' as WarrantyKind, starts_on: today(), ends_on: '', policy_number: '',
  });
  const [plan, setPlan] = useState({
    title: '', interval_months: '12', lead_days: '14', notify_customer: false, instructions: '',
  });

  if (!detail) return null;
  const { asset, warranties, plans, events } = detail;

  const run = async (fn: () => Promise<unknown>, okTitle: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: okTitle });
      await onChanged();
    } catch (err) {
      toast({
        title: 'That did not save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const addWarranty = () => {
    if (!warranty.ends_on) return;
    return run(() => customerAssetsService.saveWarranty({
      asset_id: asset.id,
      kind: warranty.kind,
      starts_on: warranty.starts_on,
      ends_on: warranty.ends_on,
      policy_number: warranty.policy_number.trim() || null,
    }), 'Warranty added');
  };

  const addPlan = () => {
    const months = Number(plan.interval_months);
    if (!plan.title.trim() || !Number.isFinite(months) || months <= 0) return;
    return run(() => customerAssetsService.savePlan({
      asset_id: asset.id,
      title: plan.title.trim(),
      instructions: plan.instructions.trim() || null,
      interval_months: months,
      interval_days: null,
      lead_days: Number(plan.lead_days) || 14,
      notify_customer: plan.notify_customer,
      anchor_date: asset.installed_on ?? asset.purchased_on ?? today(),
    }), 'Schedule added');
  };

  const history = events.filter((e) => e.status !== 'due').slice(0, 8);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{asset.name}</DialogTitle>
          <DialogDescription>
            {[asset.brand, asset.model, asset.serial_number].filter(Boolean).join(' · ') || 'No model details recorded'}
          </DialogDescription>
        </DialogHeader>

        {/* Retiring a unit keeps its whole history; deleting it is refused by the database
            once any service has been logged, so this is the control that gets used. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <Select
            value={asset.status}
            disabled={busy}
            onValueChange={(v) => void run(
              () => customerAssetsService.update(asset.id, { status: v as CustomerAsset['status'] }),
              'Status updated',
            )}
          >
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
              <SelectItem value="replaced">Replaced</SelectItem>
              <SelectItem value="decommissioned">Decommissioned</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Retiring keeps the service history; deleting the unit would erase it.
          </span>
        </div>

        {/* Warranties */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Warranty</h3>
          {warranties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warranty recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Cover</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warranties.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="capitalize">{w.kind}</TableCell>
                    <TableCell className="text-xs">{w.starts_on} → {w.ends_on}</TableCell>
                    <TableCell className="font-mono text-xs">{w.policy_number || '—'}</TableCell>
                    <TableCell>
                      <WarrantyDocumentCell warranty={w} busy={busy} onChanged={onChanged} />
                    </TableCell>
                    <TableCell className={statusTone(warrantyState(w) === 'expiring' ? 'warning' : warrantyState(w))}>
                      {warrantyState(w)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => void run(() => customerAssetsService.deleteWarranty(w.id), 'Warranty removed')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="w-40">
              <Label className="text-xs">Kind</Label>
              <Select value={warranty.kind} onValueChange={(v) => setWarranty({ ...warranty, kind: v as WarrantyKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WARRANTY_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Starts</Label>
              <Input type="date" value={warranty.starts_on} onChange={(e) => setWarranty({ ...warranty, starts_on: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Ends</Label>
              <Input type="date" value={warranty.ends_on} onChange={(e) => setWarranty({ ...warranty, ends_on: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Policy no.</Label>
              <Input value={warranty.policy_number} onChange={(e) => setWarranty({ ...warranty, policy_number: e.target.value })} />
            </div>
            <Button size="sm" variant="outline" disabled={busy || !warranty.ends_on} onClick={() => void addWarranty()}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
        </section>

        {/* Service plans */}
        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4" />Service schedule</h3>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring service scheduled.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead>How often</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Remind</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => {
                  const open = events.find((e) => e.plan_id === p.id && e.status === 'due');
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell>{describeInterval(p)}</TableCell>
                      <TableCell className="text-xs">{open?.due_on ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.lead_days}d before{p.notify_customer ? ' · customer too' : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => void run(() => customerAssetsService.deletePlan(p.id), 'Schedule removed')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="min-w-48 flex-1">
              <Label className="text-xs">What needs doing</Label>
              <Input value={plan.title} placeholder="Clean the filters" onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
            </div>
            <div className="w-28">
              <Label className="text-xs">Every (months)</Label>
              <Input type="number" min={1} value={plan.interval_months}
                onChange={(e) => setPlan({ ...plan, interval_months: e.target.value })} />
            </div>
            <div className="w-28">
              <Label className="text-xs">Remind (days)</Label>
              <Input type="number" min={0} value={plan.lead_days}
                onChange={(e) => setPlan({ ...plan, lead_days: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="notify-customer" checked={plan.notify_customer}
                onCheckedChange={(v) => setPlan({ ...plan, notify_customer: v })} />
              <Label htmlFor="notify-customer" className="text-xs">Email the customer too</Label>
            </div>
            <Button size="sm" variant="outline" disabled={busy || !plan.title.trim()} onClick={() => void addPlan()}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
        </section>

        {/* History */}
        {history.length > 0 && (
          <section className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><AlarmClock className="h-4 w-4" />History</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{e.due_on}</TableCell>
                    <TableCell className={statusTone(e.status)}>{e.status}</TableCell>
                    <TableCell className="text-xs">{e.completed_on || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Warranty certificate ───────────────────────────────────────────────────
/**
 * Upload / view / remove the certificate for one warranty. The file lives in the private
 * `pdf-documents` bucket; the row stores bucket + path and NEVER a URL, so nothing here can
 * expire. Viewing mints a short-lived signed URL on demand.
 */
const WarrantyDocumentCell: React.FC<{
  warranty: AssetWarranty;
  busy: boolean;
  onChanged: () => Promise<void>;
}> = ({ warranty, busy, onChanged }) => {
  const { toast } = useToast();
  const [working, setWorking] = useState(false);
  const inputId = `warranty-doc-${warranty.id}`;

  const fail = (err: unknown) => toast({
    title: 'That did not work',
    description: err instanceof Error ? err.message : 'Unknown error',
    variant: 'destructive',
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true);
    try {
      await customerAssetsService.uploadWarrantyDocument(warranty.id, file);
      toast({ title: 'Certificate attached' });
      await onChanged();
    } catch (err) { fail(err); } finally { setWorking(false); }
  };

  const view = async () => {
    setWorking(true);
    try {
      const url = await customerAssetsService.warrantyDocumentUrl(warranty.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) { fail(err); } finally { setWorking(false); }
  };

  const detach = async () => {
    setWorking(true);
    try {
      await customerAssetsService.deleteWarrantyDocument(warranty.id);
      toast({ title: 'Certificate removed' });
      await onChanged();
    } catch (err) { fail(err); } finally { setWorking(false); }
  };

  const disabled = busy || working;

  return (
    <div className="flex items-center gap-1">
      <input
        id={inputId}
        type="file"
        className="hidden"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
      />
      {warranty.document_path ? (
        <>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void view()}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void detach()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={disabled} asChild={false}
          onClick={() => document.getElementById(inputId)?.click()}>
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          <span className="ml-1 text-xs">Attach</span>
        </Button>
      )}
    </div>
  );
};

export default EquipmentServiceTab;
