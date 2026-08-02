// Buyer portal: a saved search's shareable matches page. The buyer opens /buyer/:token
// (no login), sees listings that match their criteria, favourites them, and requests viewings.
import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useParams, Link } from 'react-router-dom';
import { Heart, CalendarPlus, Home, Loader2, Building2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { realEstatePublic, type PublicListingCard } from '@/modules/real-estate/services/realEstateService';

const money = (n: number | null | undefined, ccy = 'EUR') => formatMoney(n, ccy || 'EUR', { decimals: 0, fallback: 'Price on request' });

function criteriaSummary(c: Record<string, any>): string {
  const parts: string[] = [];
  if (c?.type) parts.push(String(c.type));
  if (c?.transaction_type) parts.push(String(c.transaction_type));
  if (c?.location) parts.push(String(c.location));
  if (c?.beds != null) parts.push(`${c.beds}+ beds`);
  if (c?.price_max != null) parts.push(`≤ ${money(Number(c.price_max))}`);
  return parts.join(' · ') || 'your saved search';
}

export default function BuyerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof realEstatePublic.buyerPortal>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await realEstatePublic.buyerPortal(token);
      setData(d); setFavs(new Set(d.favorites));
    } catch (e) { setError((e as Error).message || 'This link is no longer active.'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const toggleFav = async (id: string) => {
    if (!token) return;
    const on = !favs.has(id);
    setFavs((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
    try { await realEstatePublic.buyerFavorite(token, id, on); }
    catch { setFavs((prev) => { const n = new Set(prev); on ? n.delete(id) : n.add(id); return n; }); toast({ title: 'Could not update favourite', variant: 'destructive' }); }
  };
  const requestViewing = async (id: string) => {
    if (!token) return;
    try { await realEstatePublic.buyerRequestViewing(token, id); setRequested((prev) => new Set(prev).add(id)); toast({ title: 'Viewing requested', description: 'The agent will be in touch.' }); }
    catch (e) { toast({ title: 'Could not request', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="dashboard-card max-w-sm p-8 text-center"><Home className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><div className="text-sm text-muted-foreground">{error}</div></div>
    </div>
  );
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          {data.agency && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> {data.agency}</div>}
          <h1 className="mt-1 text-2xl font-display font-semibold">Your property matches</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{data.requirement.label || criteriaSummary(data.requirement.criteria)} · {data.listings.length} match{data.listings.length === 1 ? '' : 'es'}</p>
        </div>

        {data.listings.length === 0 ? (
          <div className="dashboard-card p-12 text-center text-sm text-muted-foreground">No matches right now — we'll email you when new listings fit your search.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.listings.map((l: PublicListingCard) => {
              const faved = favs.has(l.id);
              return (
                <div key={l.id} className="dashboard-card overflow-hidden">
                  <div className="relative aspect-[4/3] bg-muted">
                    {l.cover_url ? <img src={l.cover_url} alt={l.title || 'Listing'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Home className="h-8 w-8 text-muted-foreground/40" /></div>}
                    <button onClick={() => toggleFav(l.id)} aria-label="Favourite" className={`absolute right-2 top-2 rounded-full p-2 backdrop-blur ${faved ? 'bg-rose-500/90 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}>
                      <Heart className={`h-4 w-4 ${faved ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate font-semibold">{money(l.price, l.currency)}</div>
                      {l.bedrooms != null && <div className="shrink-0 text-xs text-muted-foreground">{l.bedrooms} bed</div>}
                    </div>
                    <div className="mt-0.5 truncate text-sm">{l.title || 'Listing'}</div>
                    {l.town && <div className="text-xs text-muted-foreground">{l.town}</div>}
                    <div className="mt-2 flex items-center gap-1.5">
                      {l.public_listing_token && (
                        <Link to={`/p/${l.public_listing_token}`} target="_blank" className="flex-1">
                          <Button size="sm" variant="outline" className="w-full rounded-full"><ExternalLink className="mr-1 h-3.5 w-3.5" /> View</Button>
                        </Link>
                      )}
                      <Button size="sm" className="flex-1 rounded-full" disabled={requested.has(l.id)} onClick={() => requestViewing(l.id)}>
                        <CalendarPlus className="mr-1 h-3.5 w-3.5" /> {requested.has(l.id) ? 'Requested' : 'Viewing'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-8 text-center text-[11px] text-muted-foreground">Powered by your agent · listings update automatically</div>
      </div>
    </div>
  );
}
