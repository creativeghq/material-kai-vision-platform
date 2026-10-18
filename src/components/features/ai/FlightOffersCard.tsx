import React from 'react';
import { Link } from 'react-router-dom';
import { Plane } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { FLIGHT_CABIN_LABELS, type FlightCabin } from '@/modules/travel/travelVocabulary';
import { financeTabUrl, FINANCE_TAB } from '@/modules/finance/routes';
import { formatMoney } from '@/utils/decimal';
import type { FlightOffer } from '@/modules/travel/travelService';
import { flightDuration as duration, flightTime as time } from '@/modules/travel/flightFormat';

/** The fares a search_flights call returned, cheapest first. A failed or exhausted search says so. */
export const FlightOffersCard: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  if (data.status !== 'ok') {
    const why = data.status === 'collecting'
      ? 'The provider is still collecting fares. Ask again in a minute; the same search does not count twice.'
      : data.error || 'The search did not return fares.';
    return (
      <div className="rounded-md border border-hairline bg-card p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium"><Plane className="h-4 w-4" /> No fares</div>
        <p className="text-muted-foreground">{why}</p>
        {data.status === 'quota_exhausted' && (
          <Link className="mt-2 inline-block text-xs text-primary underline" to="/profile?tab=keys&section=data">Connect your own Bright Data key</Link>
        )}
      </div>
    );
  }
  const offers: FlightOffer[] = data.offers ?? [];
  return (
    <div className="rounded-md border border-hairline bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 text-sm">
        <Plane className="h-4 w-4" />
        <span className="font-medium">{data.origin} → {data.destination}</span>
        <span className="text-muted-foreground">{data.departure_date}{data.return_date ? ` – ${data.return_date}` : ''}</span>
        <Badge variant="neutral">{FLIGHT_CABIN_LABELS[data.cabin as FlightCabin] ?? data.cabin}</Badge>
        {data.cached && <Badge variant="info">From a search in the last 24h</Badge>}
      </div>
      {offers.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Google Flights showed no fares for this route and date.</p>
      ) : (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-[11px] font-semibold text-muted-foreground">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">Airline</th>
                <th className="px-3 py-1.5 text-left">Departs</th>
                <th className="px-3 py-1.5 text-left">Arrives</th>
                <th className="px-3 py-1.5 text-right">Duration</th>
                <th className="px-3 py-1.5 text-right">Stops</th>
                <th className="px-3 py-1.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {offers.slice(0, 15).map((o, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{i}</td>
                  <td className="px-3 py-1.5">{o.airline ?? '—'}{o.flight_number ? <span className="ml-1 text-xs text-muted-foreground">{o.flight_number}</span> : null}</td>
                  <td className="px-3 py-1.5 tabular-nums">{time(o.departure_time)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{time(o.arrival_time)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{duration(o.duration_minutes)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{o.stops ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{o.price != null && o.currency ? formatMoney(o.price, o.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-hairline px-3 py-2 text-xs text-muted-foreground">
        Nothing is booked. Ask me to add one to your trip card by its #, or open{' '}
        <Link className="text-primary underline" to={financeTabUrl(FINANCE_TAB.travel)}>Finance → Travel</Link>.
      </div>
    </div>
  );
};
