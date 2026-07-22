import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, BedDouble, Bath, Ruler } from 'lucide-react';
import type { PublicListingCard } from '../services/realEstateService';

const money = (n: number | null, ccy: string) => (n == null ? 'On request' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));

/** Public listing cards linking to the `/p/:token` page. Shared by Discovery + the agency profile tab. */
export const PropertyCardGrid: React.FC<{ listings: PublicListingCard[] }> = ({ listings }) => {
  if (!listings.length) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No listings found.</div>;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => {
        const loc = [l.town, l.region].filter(Boolean).join(', ');
        return (
          <Link key={l.id} to={`/p/${l.public_listing_token}`} className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
            <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
              {l.cover_url
                ? <img src={l.cover_url} alt={l.title ?? ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                : <div className="flex h-full items-center justify-center"><Building2 className="h-8 w-8 text-muted-foreground/50" /></div>}
            </div>
            <div className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{l.title || 'Listing'}</span>
                <span className="shrink-0 text-sm font-semibold text-primary">{money(l.price, l.currency)}</span>
              </div>
              {loc && <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {loc}</div>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {l.bedrooms != null && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" />{l.bedrooms}</span>}
                {l.bathrooms != null && <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{l.bathrooms}</span>}
                {(l.area_built ?? l.plot_area) != null && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{l.area_built ?? l.plot_area} m²</span>}
                <span className="ml-auto capitalize">{String(l.transaction_type || '').replace('_', ' ')}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};
