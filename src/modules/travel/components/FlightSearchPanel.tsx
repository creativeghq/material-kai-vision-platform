import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plane, Plus, Search } from 'lucide-react';

import { HubDataTable, HubEmptyState, type HubColumn } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { tripExpenseService, type TripExpenseReport } from '@/modules/finance/services/tripExpenseService';
import { formatMoney } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';
import {
  travelService, FlightSearchRefused, type FlightOffer, type FlightQuota, type FlightSearch,
} from '../travelService';
import { FLIGHT_CABINS, FLIGHT_CABIN_LABELS, type FlightCabin } from '../travelVocabulary';
import { flightDuration as duration, flightTime as clock } from '../flightFormat';

const NEW_CARD = '__new__';

interface Prefill { destination?: string | null; departure?: string | null; return?: string | null }

/** Find a fare and cost it onto a trip card as a PLANNED line. Read-only against the airline: nothing is booked. */
export const FlightSearchPanel: React.FC<{
  workspaceId: string;
  prefill?: Prefill;
  /** Add straight to this card (the trip card's own "Add flight"); otherwise pick a draft card. */
  targetCardId?: string;
  onAdded?: () => void;
}> = ({ workspaceId, prefill, targetCardId, onAdded }) => {
  const { toast } = useToast();
  const [form, setForm] = useState({
    origin: '', destination: (prefill?.destination ?? '').slice(0, 3).toUpperCase(),
    departure: prefill?.departure ?? '', ret: prefill?.return ?? '', adults: '1', cabin: 'economy' as FlightCabin,
  });
  const [quota, setQuota] = useState<FlightQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ search: FlightSearch; cached: boolean; collecting: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<TripExpenseReport[]>([]);
  const [cardId, setCardId] = useState<string>(targetCardId ?? '');
  const [adding, setAdding] = useState<number | null>(null);

  const loadQuota = useCallback(() => {
    travelService.quota(workspaceId).then(setQuota).catch(() => setQuota(null));
  }, [workspaceId]);

  useEffect(() => { loadQuota(); }, [loadQuota]);
  useEffect(() => {
    if (targetCardId) return;
    tripExpenseService.listReports({ workspaceId, mine: true, status: ['draft'] })
      .then((r) => { setCards(r); setCardId((c) => c || r[0]?.id || NEW_CARD); })
      .catch(() => setCards([]));
  }, [workspaceId, targetCardId]);

  const exhausted = quota?.mode === 'free' && (quota.remaining ?? 0) <= 0;

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await travelService.search(workspaceId, {
        origin: form.origin.trim().toUpperCase(), destination: form.destination.trim().toUpperCase(),
        departure: form.departure, return: form.ret || undefined, adults: Number(form.adults) || 1, cabin: form.cabin,
      });
      setResult(r);
      if (r.search.status === 'failed') setError(r.search.error ?? 'The search failed. It did not count against your allowance.');
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof FlightSearchRefused && e.quota) setQuota(e.quota);
    } finally {
      setBusy(false);
      loadQuota();
    }
  };

  const add = async (offer: FlightOffer, index: number) => {
    if (!result || offer.price == null || !offer.currency) return;
    setAdding(index);
    try {
      let reportId = targetCardId ?? cardId;
      const s = result.search;
      if (!reportId || reportId === NEW_CARD) {
        const card = await tripExpenseService.createReport({
          workspaceId, title: `Trip to ${s.destination} · ${s.departure_date}`, card_type: 'trip',
          destination: s.destination, trip_start: s.departure_date, trip_end: s.return_date ?? s.departure_date,
          currency: offer.currency,
        });
        reportId = card.id;
        setCards((c) => [card, ...c]);
        setCardId(card.id);
      }
      await tripExpenseService.addItem({
        report_id: reportId, expense_date: s.departure_date, category: 'transport', vendor: offer.airline,
        amount: offer.price, estimated_amount: offer.price, currency: offer.currency, commitment: 'planned',
        flight_search_id: s.id,
        description: `Flight ${s.origin}→${s.destination}${offer.flight_number ? ` · ${offer.flight_number}` : ''} · ${FLIGHT_CABIN_LABELS[s.cabin]}${s.adults > 1 ? ` · ${s.adults} pax` : ''}`,
      });
      toast({ title: 'Added to the trip card as planned', description: 'Submit the card to ask finance for approval before you book.' });
      onAdded?.();
    } catch (e) {
      toast({ title: 'Could not add the flight', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setAdding(null);
    }
  };

  const offers = result?.search.status === 'ok' ? result.search.offers : [];
  const columns: HubColumn<FlightOffer & { _i: number }>[] = [
    { id: 'airline', header: 'Airline', cell: (o) => <span>{o.airline ?? '—'}{o.flight_number && <span className="ml-1 text-xs text-muted-foreground">{o.flight_number}</span>}</span> },
    { id: 'dep', header: 'Departs', cell: (o) => <span className="tabular-nums">{clock(o.departure_time)}</span> },
    { id: 'arr', header: 'Arrives', hideBelow: 'sm', cell: (o) => <span className="tabular-nums">{clock(o.arrival_time)}</span> },
    { id: 'dur', header: 'Duration', align: 'right', hideBelow: 'md', cell: (o) => <span className="tabular-nums">{duration(o.duration_minutes)}</span> },
    { id: 'stops', header: 'Stops', align: 'right', hideBelow: 'md', cell: (o) => (o.stops ?? '—') },
    { id: 'price', header: 'Price', align: 'right', cell: (o) => <span className="tabular-nums">{o.price != null && o.currency ? formatMoney(o.price, o.currency) : '—'}</span> },
    {
      id: 'add', header: '', align: 'right',
      cell: (o) => (
        <Button size="sm" variant="outline" disabled={o.price == null || !o.currency || adding !== null}
          onClick={(e) => { e.stopPropagation(); void add(o, o._i); }}>
          {adding === o._i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          <span className="ml-1">Add to trip card</span>
        </Button>
      ),
    },
  ];

  const valid = /^[A-Za-z]{3}$/.test(form.origin.trim()) && /^[A-Za-z]{3}$/.test(form.destination.trim()) && !!form.departure;

  return (
    <Card className="dashboard-card overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Plane className="h-4 w-4 text-primary" /> Find a flight</CardTitle>
        <CardDescription>
          Fares from Google Flights, right now. Nothing is booked: add a fare to a trip card as a planned cost, finance
          approves it, then book it on the airline&apos;s site and enter the price you paid.
        </CardDescription>
        {quota && (
          <p className={`text-xs ${exhausted ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
            {quota.reason}
            {quota.mode === 'free' && <> <Link className="text-primary underline" to="/profile?tab=keys&section=data">Use your own Bright Data key</Link></>}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <FormGrid>
          <FormField label="From (airport code)">
            <Input value={form.origin} maxLength={3} placeholder="ATH" onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          </FormField>
          <FormField label="To (airport code)">
            <Input value={form.destination} maxLength={3} placeholder="FCO" onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </FormField>
          <FormField label="Depart">
            <Input type="date" min={todayLocalISO()} value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} />
          </FormField>
          <FormField label="Return (optional)">
            <Input type="date" min={form.departure || todayLocalISO()} value={form.ret} onChange={(e) => setForm({ ...form, ret: e.target.value })} />
          </FormField>
          <FormField label="Passengers">
            <Input type="number" min={1} max={9} value={form.adults} onChange={(e) => setForm({ ...form, adults: e.target.value })} />
          </FormField>
          <FormField label="Cabin">
            <Select value={form.cabin} onValueChange={(v) => setForm({ ...form, cabin: v as FlightCabin })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLIGHT_CABINS.map((c) => <SelectItem key={c} value={c}>{FLIGHT_CABIN_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </FormGrid>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void search()} disabled={!valid || busy || exhausted}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />} Search fares
          </Button>
          {!targetCardId && offers.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Add to
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  <SelectItem value={NEW_CARD}>A new trip card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {result?.cached && <Badge variant="info">From a search in the last 24h: not counted again</Badge>}
        </div>

        {error && <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}
        {result?.collecting && (
          <p className="text-sm text-muted-foreground">The provider is still collecting fares. Search again in a minute; it will not count twice.</p>
        )}
        {result && result.search.status === 'ok' && (
          <HubDataTable
            rows={offers.map((o, i) => ({ ...o, _i: i }))}
            columns={columns}
            rowId={(o) => String(o._i)}
            empty={<HubEmptyState icon={Plane} title="No fares" description="Google Flights showed no fares for this route and date. Try another date or a nearby airport." />}
          />
        )}
        {!result && !error && (
          <HubEmptyState icon={Plane} title="No search yet" description="Enter a route and a date. The same search within 24 hours is free and does not count against the allowance." />
        )}
      </CardContent>
    </Card>
  );
};
