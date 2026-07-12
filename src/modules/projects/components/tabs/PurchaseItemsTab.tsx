/**
 * Project Purchase Items — made-to-order doors / windows (and other custom purchases) with a
 * structured measurement spec and a PDF generator (combined schedule + per-item spec sheets).
 *
 * Image handling (the key flow): a purchase item shows a real photo when LINKED to a catalog
 * product, otherwise it has NO photo until the user clicks "Generate image", which renders a
 * studio product shot of the configured door/window from its spec (generate-interior-gemini
 * `product-shot` mode). Either way `design_image_url` is what the purchase sheet embeds.
 *
 * Owner-only (operator/dealer/architect) — end-customer collaborators never reach this tab.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Hammer, Loader2, Plus, Trash2, Pencil, Sparkles, FileDown, Search, X, DoorOpen, Square, Package,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import {
  projectsService,
  PURCHASE_ITEM_TYPES,
  type PurchaseItemType,
  type PurchaseItemDetails,
  type ProjectPurchaseItem,
  type ProjectRoom,
} from '../../services/projectsService';

const TYPE_LABELS: Record<string, string> = { door: 'Door', window: 'Window', other: 'Other' };
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  door: DoorOpen, window: Square, other: Package,
};

const money = (n: number | null | undefined, c: string | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'EUR' }).format(n);

// Compact spec summary shown on the row (the most identifying keys per type).
function specSummary(it: ProjectPurchaseItem): string {
  const d = it.details || {};
  const parts: string[] = [];
  if (d.width_mm || d.height_mm) parts.push(`${d.width_mm ?? '?'}×${d.height_mm ?? '?'} mm`);
  if (it.item_type === 'door') {
    if (d.finish) parts.push(String(d.finish));
    if (d.opening) parts.push(`opens ${d.opening}`);
    if (d.handing) parts.push(`${d.handing}-hand`);
  } else if (it.item_type === 'window') {
    if (d.opening_type) parts.push(String(d.opening_type));
    if (d.glazing) parts.push(String(d.glazing));
    if (d.finish) parts.push(String(d.finish));
  } else if (d.finish) parts.push(String(d.finish));
  return parts.join(' · ');
}

export const PurchaseItemsTab: React.FC<{ projectId: string; workspaceId?: string | null; projectName: string }> = ({
  projectId, workspaceId, projectName,
}) => {
  const { toast } = useToast();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [rows, setRows] = useState<ProjectPurchaseItem[]>([]);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogItem, setDialogItem] = useState<ProjectPurchaseItem | 'new' | null>(null);
  const [sheetMode, setSheetMode] = useState<'both' | 'schedule' | 'per_item' | 'order'>('both');
  const [generatingSheet, setGeneratingSheet] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [items, rm] = await Promise.all([
        projectsService.listPurchaseItems(projectId),
        projectsService.listRooms(projectId),
      ]);
      setRows(items);
      setRooms(rm);
    } catch {
      toast({ title: 'Failed to load purchase items', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);
  useEffect(() => { load(); }, [load]);

  const genImage = async (item: ProjectPurchaseItem) => {
    setBusy(item.id);
    try {
      const url = await projectsService.generatePurchaseItemImage(item.id);
      setRows(prev => prev.map(r => r.id === item.id ? { ...r, design_image_url: url } : r));
      toast({ title: 'Image generated' });
    } catch (err: any) {
      toast({ title: 'Image generation failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this purchase item?')) return;
    setBusy(id);
    try {
      await projectsService.deletePurchaseItem(id);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch { toast({ title: 'Failed to remove', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const generateSheet = async () => {
    if (rows.length === 0) { toast({ title: 'Add at least one item first', variant: 'destructive' }); return; }
    setGeneratingSheet(true);
    try {
      const res = await projectsService.generatePurchaseSheet(projectId, { mode: sheetMode, project_name: projectName });
      toast({ title: `Sheet ready — ${res.page_count} page${res.page_count === 1 ? '' : 's'}` });
      window.open(res.pdf_url, '_blank', 'noopener');
    } catch (err: any) {
      if (await handleEmailSendError(err, { workspaceId, feature: 'purchase order' })) return;
      toast({ title: 'Sheet generation failed', description: err?.message, variant: 'destructive' });
    } finally { setGeneratingSheet(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2"><Hammer className="h-4 w-4" /> Purchase Items</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Made-to-order doors, windows &amp; custom purchases — with a spec sheet for the supplier.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sheetMode} onValueChange={(v) => setSheetMode(v as typeof sheetMode)}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Elevation schedule + spec sheets</SelectItem>
              <SelectItem value="schedule">Elevation schedule only</SelectItem>
              <SelectItem value="order">Order sheet (per item)</SelectItem>
              <SelectItem value="per_item">Spec sheets only</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="rounded-full" onClick={generateSheet} disabled={generatingSheet || rows.length === 0}>
            {generatingSheet ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
            Generate sheet
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => setDialogItem('new')}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="dashboard-card"><CardContent className="py-12 text-center">
          <Hammer className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No purchase items yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add a door or window with its measurements — link a catalog product for a real photo, or generate one from the spec.</p>
        </CardContent></Card>
      ) : (
        <Card className="dashboard-card"><CardContent className="p-0"><div className="divide-y divide-white/8">
          {rows.map((it) => {
            const TypeIcon = TYPE_ICONS[it.item_type] || Package;
            return (
              <div key={it.id} className="p-4 flex items-center gap-3 flex-wrap">
                <div className="h-14 w-14 rounded-md overflow-hidden bg-muted/40 border border-white/10 flex items-center justify-center shrink-0">
                  {it.design_image_url
                    ? <img src={it.design_image_url} alt={it.name} className="h-full w-full object-cover" />
                    : <TypeIcon className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{it.name}</p>
                    <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[it.item_type] || it.item_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{specSummary(it) || 'No spec yet'}</p>
                </div>

                <div className="text-right w-[120px]">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty × Unit</p>
                  <p className="text-sm">{it.quantity} × {money(it.unit_cost, it.currency)}</p>
                </div>

                <Button size="icon" variant="ghost" className="h-8 w-8" title={it.design_image_url ? 'Regenerate image' : 'Generate image from spec'}
                  onClick={() => genImage(it)} disabled={busy === it.id}>
                  {busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDialogItem(it)} disabled={busy === it.id}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(it.id)} disabled={busy === it.id}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div></CardContent></Card>
      )}

      {dialogItem && workspaceId && (
        <PurchaseItemDialog
          open={!!dialogItem}
          item={dialogItem === 'new' ? null : dialogItem}
          projectId={projectId}
          workspaceId={workspaceId}
          rooms={rooms}
          onClose={() => setDialogItem(null)}
          onSaved={() => { setDialogItem(null); load(); }}
        />
      )}
      {dialogItem && !workspaceId && (() => { toast({ title: 'This project has no workspace — purchase items need one.', variant: 'destructive' }); setDialogItem(null); return null; })()}
      {connectEmailGate}
    </div>
  );
};

// ---------------------------------------------------------------------------

const DOOR_FIELDS: Array<{ key: keyof PurchaseItemDetails; label: string; type?: 'number'; options?: string[] }> = [
  { key: 'width_mm', label: 'Width (mm)', type: 'number' },
  { key: 'height_mm', label: 'Height (mm)', type: 'number' },
  { key: 'thickness_mm', label: 'Thickness (mm)', type: 'number' },
  { key: 'finish', label: 'Finish' },
  { key: 'frame', label: 'Frame' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'opening', label: 'Opening', options: ['inward', 'outward'] },
  { key: 'handing', label: 'Handing', options: ['left', 'right'] },
  { key: 'hinge_side', label: 'Hinge side' },
];

const WINDOW_FIELDS: Array<{ key: keyof PurchaseItemDetails; label: string; type?: 'number'; options?: string[] }> = [
  { key: 'width_mm', label: 'Width (mm)', type: 'number' },
  { key: 'height_mm', label: 'Height (mm)', type: 'number' },
  { key: 'frame_type', label: 'Frame type' },
  { key: 'glazing', label: 'Glazing' },
  { key: 'opening_type', label: 'Opening type', options: ['tilt-turn', 'casement', 'sliding', 'fixed'] },
  { key: 'finish', label: 'Finish' },
];

const OTHER_FIELDS: Array<{ key: keyof PurchaseItemDetails; label: string; type?: 'number'; options?: string[] }> = [
  { key: 'width_mm', label: 'Width (mm)', type: 'number' },
  { key: 'height_mm', label: 'Height (mm)', type: 'number' },
  { key: 'finish', label: 'Finish / material' },
];

const PurchaseItemDialog: React.FC<{
  open: boolean;
  item: ProjectPurchaseItem | null;
  projectId: string;
  workspaceId: string;
  rooms: ProjectRoom[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, item, projectId, workspaceId, rooms, onClose, onSaved }) => {
  const { toast } = useToast();
  const isEdit = !!item;
  const [busy, setBusy] = useState(false);

  const [itemType, setItemType] = useState<PurchaseItemType | string>(item?.item_type || 'door');
  const [name, setName] = useState(item?.name || '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [unitCost, setUnitCost] = useState(item?.unit_cost != null ? String(item.unit_cost) : '');
  const [currency, setCurrency] = useState(item?.currency || 'EUR');
  const [roomId, setRoomId] = useState(item?.room_id || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [details, setDetails] = useState<PurchaseItemDetails>(item?.details || {});
  const [imageUrl, setImageUrl] = useState<string | null>(item?.design_image_url || null);

  // catalog link (optional — sets a real photo + name)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  const fields = itemType === 'window' ? WINDOW_FIELDS : itemType === 'other' ? OTHER_FIELDS : DOOR_FIELDS;

  const setField = (k: keyof PurchaseItemDetails, raw: string, isNumber?: boolean) => {
    setDetails(prev => {
      const next = { ...prev };
      if (raw.trim() === '') delete next[k];
      else next[k] = isNumber ? Number(raw) : raw;
      return next;
    });
  };

  const runSearch = useMemo(() => {
    let t: any;
    return (val: string) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (!val.trim()) { setResults([]); return; }
        setSearching(true);
        try { setResults(await projectsService.searchProducts(val)); }
        catch { /* ignore */ }
        finally { setSearching(false); }
      }, 250);
    };
  }, []);

  const pickProduct = async (p: { id: string; name: string; sku: string | null }) => {
    setResults([]); setQuery('');
    if (!name.trim()) setName(p.name);
    try {
      const url = await projectsService.getProductPrimaryImageUrl(p.id);
      if (url) { setImageUrl(url); toast({ title: 'Linked catalog photo' }); }
      else toast({ title: 'Product has no photo — you can generate one from the spec instead' });
    } catch { /* ignore */ }
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const payload = {
        item_type: itemType,
        name: name.trim(),
        quantity: Number(quantity) || 1,
        unit_cost: unitCost.trim() === '' ? null : Number(unitCost),
        currency,
        room_id: roomId || null,
        notes: notes.trim() || null,
        details,
        design_image_url: imageUrl,
      };
      if (isEdit && item) {
        await projectsService.updatePurchaseItem(item.id, payload);
      } else {
        await projectsService.addPurchaseItem({ project_id: projectId, workspace_id: workspaceId, ...payload });
      }
      toast({ title: isEdit ? 'Item updated' : 'Item added' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit purchase item' : 'Add purchase item'}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={itemType} onValueChange={(v) => setItemType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PURCHASE_ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Room (optional)</Label>
              <Select value={roomId || '__none'} onValueChange={(v) => setRoomId(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={itemType === 'window' ? 'e.g. Living room tilt-turn window' : 'e.g. Master bedroom oak door'} />
          </div>

          {/* Optional catalog link → real photo */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Link a catalog product for a real photo (optional)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search catalog products…" value={query}
                onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }} />
            </div>
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
            {results.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-md border border-white/10 divide-y divide-white/8">
                {results.map(p => (
                  <button key={p.id} type="button" className="w-full text-left p-2 hover:bg-muted/40" onClick={() => pickProduct(p)}>
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                  </button>
                ))}
              </div>
            )}
            {imageUrl && (
              <div className="flex items-center gap-2 rounded-md border border-white/10 p-2">
                <img src={imageUrl} alt="design" className="h-12 w-12 rounded object-cover" />
                <span className="text-xs text-muted-foreground flex-1 truncate">Image attached (catalog photo or generated)</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setImageUrl(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            {!imageUrl && (
              <p className="text-[11px] text-muted-foreground">No photo — after saving, use the ✨ button on the row to generate one from the spec.</p>
            )}
          </div>

          {/* Spec / measurements */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Measurements &amp; spec</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {fields.map(f => (
                <div key={String(f.key)} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  {f.options ? (
                    <Select value={(details[f.key] as string) || '__none'} onValueChange={(v) => setField(f.key, v === '__none' ? '' : v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={details[f.key] != null ? String(details[f.key]) : ''}
                      onChange={(e) => setField(f.key, e.target.value, f.type === 'number')}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Unit cost</Label><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="—" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['EUR', 'USD', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1"><Label className="text-xs">Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {isEdit ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
