import React, { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { realEstatePublic, type PublicListingCard, type DiscoverFilters } from '../services/realEstateService';
import { PropertyCardGrid } from './PropertyCardGrid';

const TX = ['', 'sale', 'rent', 'short_let', 'business_transfer'];
const TYPES = ['', 'residential', 'commercial', 'land', 'other'];

// cross-workspace property Discovery (Discover → Properties). Reads the same toPublic()
// projection the public listing page uses; only active + public + in_discovery listings surface.
export const PropertyDiscoveryTab: React.FC = () => {
  const [filters, setFilters] = useState<DiscoverFilters>({});
  const [listings, setListings] = useState<PublicListingCard[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (f: DiscoverFilters) => {
    setLoading(true);
    try { setListings(await realEstatePublic.discover(f)); } catch { setListings([]); } finally { setLoading(false); }
  };
  useEffect(() => { void run({}); }, []);

  const set = (k: keyof DiscoverFilters, v: any) => setFilters((p) => ({ ...p, [k]: v === '' ? undefined : v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-[2]">
          <Input placeholder="Describe it — e.g. bright two-bed near the sea with a balcony" value={filters.query ?? ''} onChange={(e) => set('query', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(filters)} />
        </div>
        <div className="min-w-[140px] flex-1">
          <Input placeholder="Town" value={filters.town ?? ''} onChange={(e) => set('town', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(filters)} />
        </div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm capitalize" value={filters.transaction_type ?? ''} onChange={(e) => set('transaction_type', e.target.value)}>
          {TX.map((o) => <option key={o} value={o}>{o === '' ? 'Any transaction' : o.replace('_', ' ')}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm capitalize" value={filters.property_type ?? ''} onChange={(e) => set('property_type', e.target.value)}>
          {TYPES.map((o) => <option key={o} value={o}>{o === '' ? 'Any type' : o}</option>)}
        </select>
        <Input type="number" placeholder="Max €" className="w-28" value={filters.price_max ?? ''} onChange={(e) => set('price_max', e.target.value === '' ? '' : Number(e.target.value))} />
        <Input type="number" placeholder="Min beds" className="w-24" value={filters.bedrooms_min ?? ''} onChange={(e) => set('bedrooms_min', e.target.value === '' ? '' : Number(e.target.value))} />
        <Button className="rounded-full" onClick={() => run(filters)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
      </div>

      {listings === null || loading
        ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-[4/3] rounded-xl skeleton" />)}</div>
        : <PropertyCardGrid listings={listings} />}
    </div>
  );
};
