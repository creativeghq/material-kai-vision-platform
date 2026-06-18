import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, MapPin, Store, Loader2, Tag, Truck, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMaterialCategory } from '@/utils/productMetadata';
import { MATERIAL_CATS, catLabel } from '@/lib/materialCategories';
import { marketplaceService, type MarketplaceListing } from '@/services/marketplaceService';

const CONDITION_LABEL: Record<string, string> = {
  new: 'New', open_box: 'Open box', remnant: 'Remnant', lot: 'Mixed lot',
};
const DELIVERY_LABEL: Record<string, string> = {
  pickup: 'Pickup only', ship: 'Shipping', both: 'Pickup or shipping',
};

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ l, onOpen }: { l: MarketplaceListing; onOpen: (l: MarketplaceListing) => void }) {
  const img = l.image_urls?.[0];
  return (
    <Card onClick={() => onOpen(l)} className="rounded-2xl cursor-pointer overflow-hidden transition-all hover:shadow-md hover:ring-1 hover:ring-primary/30">
      <div className="h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
        {img ? (
          <img src={img} alt={l.title} loading="lazy" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : <Package className="h-8 w-8 text-muted-foreground/40" />}
      </div>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium line-clamp-1">{l.title}</p>
          <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-500 text-[10px]">{CONDITION_LABEL[l.condition] ?? l.condition}</Badge>
        </div>
        <p className="text-base font-semibold tabular-nums">€{l.price} <span className="text-xs font-normal text-muted-foreground">/ {l.unit}</span></p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{l.seller_name || 'Seller'}</span>
          <span className="tabular-nums">{l.qty_remaining} {l.unit} left</span>
        </div>
        {l.location_city && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location_city}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Detail + contact ───────────────────────────────────────────────────────

function ListingDetailModal({
  listing, onClose, onChanged,
}: { listing: MarketplaceListing | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const { isOperator } = usePermissions();
  const [contactOpen, setContactOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (listing) { marketplaceService.incrementView(listing.id); setContactOpen(false); setQty(''); setMessage(''); }
  }, [listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!listing) return null;
  const ownListing = activeWorkspaceId === listing.workspace_id;
  const specEntries = Object.entries(listing.specs || {}).filter(([, v]) => v != null && String(v).length > 0);

  const sendInquiry = async () => {
    if (!activeWorkspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const r = await marketplaceService.createInquiry({
        listingId: listing.id, buyerWorkspaceId: activeWorkspaceId,
        qtyWanted: qty ? parseFloat(qty) : null, message: message.trim() || undefined,
      });
      toast({ title: 'Message sent to seller', description: 'Continue the conversation in your Inbox.' });
      navigate(`/inbox?thread=${r.thread_id}`);
    } catch (err: any) {
      toast({ title: 'Failed to contact seller', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const moderate = async () => {
    if (!confirm('Remove this listing from the marketplace?')) return;
    try { await marketplaceService.withdraw(listing.id); toast({ title: 'Listing removed' }); onChanged(); onClose(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Dialog open={!!listing} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{listing.title}</DialogTitle></DialogHeader>

        {listing.image_urls?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {listing.image_urls.map((u) => (
              <img key={u} src={u} alt="" className="h-28 w-28 rounded-md object-cover border border-border/40 shrink-0" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="text-2xl font-semibold tabular-nums">€{listing.price} <span className="text-sm font-normal text-muted-foreground">/ {listing.unit}</span></div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">{CONDITION_LABEL[listing.condition] ?? listing.condition}</Badge>
              {listing.material_category && <Badge variant="outline" className="capitalize">{formatMaterialCategory(listing.material_category)}</Badge>}
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5"><Tag className="h-4 w-4" />{listing.qty_remaining} {listing.unit} available</p>
            {listing.batch_lot && <p className="text-muted-foreground">Batch / lot: <span className="text-foreground">{listing.batch_lot}</span></p>}
            <p className="text-muted-foreground flex items-center gap-1.5"><Truck className="h-4 w-4" />{DELIVERY_LABEL[listing.delivery_option] ?? listing.delivery_option}</p>
            {listing.location_city && <p className="text-muted-foreground flex items-center gap-1.5"><MapPin className="h-4 w-4" />{[listing.location_city, listing.location_region].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground flex items-center gap-1.5"><Store className="h-4 w-4" />{listing.seller_name || 'Seller'}</p>
            {specEntries.length > 0 && (
              <div className="rounded-md border border-border/60 p-2 space-y-1">
                {specEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground capitalize">{k}</span>
                    <span className="text-right">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {listing.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{listing.description}</p>}

        {contactOpen && !ownListing && (
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>Qty wanted</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={`${listing.unit}`} /></div>
              <div className="col-span-2 space-y-1"><Label>Message</Label><Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note to the seller" /></div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {isOperator && (
            <Button variant="outline" className="mr-auto text-destructive" onClick={moderate}>
              <ShieldAlert className="h-4 w-4 mr-1" /> Remove
            </Button>
          )}
          {ownListing ? (
            <span className="text-xs text-muted-foreground self-center">This is your own listing.</span>
          ) : !contactOpen ? (
            <Button onClick={() => setContactOpen(true)}><Store className="h-4 w-4 mr-1" /> Contact seller</Button>
          ) : (
            <Button onClick={sendInquiry} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send inquiry'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export const MarketplaceTab: React.FC = () => {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [selected, setSelected] = useState<MarketplaceListing | null>(null);
  const seq = useRef(0);

  const load = async () => {
    const mySeq = ++seq.current;
    setLoading(true);
    try {
      const rows = await marketplaceService.browse({
        q: search.trim() || undefined,
        materialCategory: cat === 'all' ? undefined : cat,
        limit: 60,
      });
      if (mySeq === seq.current) setListings(rows);
    } catch {
      if (mySeq === seq.current) setListings([]);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  };

  // Debounce search + category into the server query.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, cat]);

  const count = useMemo(() => listings.length, [listings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search surplus by name or seller…" className="pl-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {MATERIAL_CATS.map((c) => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Surplus &amp; last-stock materials listed by dealers, operators and architects — contact the seller directly, zero platform commission.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-60 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : count === 0 ? (
        <Empty text="No surplus listings yet — be the first to list from your warehouse." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} onOpen={setSelected} />)}
        </div>
      )}

      <ListingDetailModal listing={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
};
