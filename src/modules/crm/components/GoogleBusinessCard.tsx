import React, { useCallback, useEffect, useState } from 'react';
import {
  Store, Star, Phone, Globe, MapPin, Clock, RefreshCw, Loader2, Search, X,
  AlertTriangle, CheckCircle2, ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { googleBusinessAPI, type GoogleBusinessProfile } from '@/services/crm.service';
import { formatAddressOneLine, googleMapsUrl, type AddressLike } from '@/utils/address';
import { formatDate } from '@/utils/datetime';

interface Props {
  companyId?: string;
  contactId?: string;
  /** The party's name — the default thing to search Google for. */
  partyName?: string | null;
  /** Our own address for this party, shown against Google's so a mismatch is visible. */
  address?: AddressLike | null;
}

/** The weekday timetable DataForSEO returns, in the order a human reads a week. */
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const pad = (n: unknown) => String(n ?? '').padStart(2, '0');

/** "09:00 – 17:00", or the two spans a business that shuts for lunch actually keeps. */
function formatDayHours(spans: unknown): string {
  if (!Array.isArray(spans) || spans.length === 0) return 'Closed';
  return spans
    .map((s: any) => {
      const open = s?.open ? `${pad(s.open.hour)}:${pad(s.open.minute)}` : null;
      const close = s?.close ? `${pad(s.close.hour)}:${pad(s.close.minute)}` : null;
      return open && close ? `${open} – ${close}` : open || close || '';
    })
    .filter(Boolean)
    .join(', ') || 'Closed';
}

function timetableOf(profile: GoogleBusinessProfile): Array<{ day: string; hours: string }> {
  const wh = profile.work_hours as any;
  const timetable = wh?.timetable ?? wh?.work_hours?.timetable ?? null;
  if (!timetable || typeof timetable !== 'object') return [];
  return DAY_ORDER
    .filter((d) => d in timetable)
    .map((d) => ({ day: d[0].toUpperCase() + d.slice(1, 3), hours: formatDayHours(timetable[d]) }));
}

/** Loose comparison — case, punctuation and whitespace are not a disagreement. */
const loose = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const Row: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex items-start gap-2 text-sm">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

/**
 * The counterparty as GOOGLE has them — their Business Profile listing.
 *
 * Why it is a mirror and not an import: Google's record and ours are two independent claims
 * about the same business, and the useful thing is seeing where they differ. A supplier who
 * moved warehouse updates Google long before they update anyone's CRM, and a phone number
 * customers actually reach is worth more than the one on a three-year-old quote. Merging
 * Google's answer into our fields would destroy the comparison and quietly hand an external
 * source write access to our invoicing address — the same rule the AADE and bank mirrors follow.
 *
 * The lookup COSTS CREDITS (DataForSEO Business Data), so it never runs on mount. The panel
 * loads what we already stored and waits to be asked.
 *
 * Four states, kept distinct on purpose (rule 3 — a value or a stated reason there is none):
 *   no row     → nobody has looked
 *   no_match   → Google answered and has no listing under that name
 *   failed     → we never got an answer; this is UNKNOWN, not "no listing"
 *   ok         → the listing
 */
export const GoogleBusinessCard: React.FC<Props> = ({
  companyId, contactId, partyName, address,
}) => {
  const { toast } = useToast();
  const parent = companyId ? { companyId } : { contactId };
  const [profile, setProfile] = useState<GoogleBusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingQuery, setEditingQuery] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!companyId && !contactId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { profile: p, suggestedQuery } = await googleBusinessAPI.get(parent);
      setProfile(p);
      setQuery(p?.query || suggestedQuery || partyName || '');
    } catch (e) {
      // A read failure is not "no listing" — say so rather than rendering an empty panel.
      toast({ title: 'Could not load the Google listing', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId]);

  useEffect(() => { void load(); }, [load]);

  const runLookup = async () => {
    setBusy(true);
    try {
      const { profile: p, error } = await googleBusinessAPI.lookup(parent, query);
      setProfile(p);
      setEditingQuery(false);
      if (error) {
        toast({ title: 'Google lookup failed', description: error, variant: 'destructive' });
      } else if (p.fetch_status === 'no_match') {
        toast({ title: 'No listing found', description: `Google has no Business Profile matching "${p.query}".` });
      }
    } catch (e) {
      toast({ title: 'Google lookup failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!profile) return;
    try {
      await googleBusinessAPI.remove(profile.id);
      setProfile(null);
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const ourAddress = address ? formatAddressOneLine(address) : '';
  const addressDiffers = Boolean(
    profile?.fetch_status === 'ok' && profile.address && ourAddress &&
    !loose(profile.address).includes(loose(ourAddress)) &&
    !loose(ourAddress).includes(loose(profile.address)),
  );

  const lookupButton = (
    <Button size="sm" variant="outline" onClick={() => (editingQuery ? runLookup() : setEditingQuery(true))} disabled={busy} className="shrink-0">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : profile ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      {busy ? 'Searching…' : profile ? 'Refresh' : 'Find on Google'}
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" /> Google Business Profile
            {profile?.fetch_status === 'ok' && profile.is_claimed && (
              <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Claimed</Badge>
            )}
          </CardTitle>
          <CardDescription>
            What Google publishes about this business — checked against what we hold, never merged into it.
          </CardDescription>
        </div>
        {lookupButton}
      </CardHeader>

      <CardContent className="space-y-3">
        {editingQuery && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline bg-surface-sunken p-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <label htmlFor="gbp-query" className="text-xs font-medium text-muted-foreground">Search Google for</label>
              <Input
                id="gbp-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runLookup(); } }}
                placeholder="Business name, town"
              />
              <p className="text-[11px] text-muted-foreground">
                Uses one Business Data lookup — it costs credits. The town is what tells two
                businesses of the same name apart.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingQuery(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={runLookup} disabled={busy || !query.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
              </Button>
            </div>
          </div>
        )}

        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {!loading && !profile && !editingQuery && (
          <HubEmptyState
            icon={Store}
            title="Not looked up yet"
            description="Pull this counterparty's Google listing — pin on the map, opening hours, the phone customers actually call, and their rating — so you can check it against what we hold."
            action={<Button onClick={() => setEditingQuery(true)}><Search className="h-4 w-4" /> Find on Google</Button>}
          />
        )}

        {!loading && profile?.fetch_status === 'failed' && (
          <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <div className="min-w-0">
              <p className="font-medium text-[hsl(var(--warning))]">We could not reach Google</p>
              {/* NOT "no listing" — this is unknown, and saying "0 reviews" here would be a lie. */}
              <p className="text-muted-foreground">
                {profile.source_error || 'The lookup did not complete.'} Nothing is known about this
                business&apos;s listing — try again.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Attempted {formatDate(profile.fetched_at)} · searched for “{profile.query}”</p>
            </div>
          </div>
        )}

        {!loading && profile?.fetch_status === 'no_match' && (
          <div className="space-y-2 rounded-md border border-hairline p-3 text-sm">
            <p className="font-medium">No Google listing under that name</p>
            <p className="text-muted-foreground">
              Google answered and has no Business Profile matching “{profile.query}”. Many
              wholesalers and manufacturers genuinely have none — try the trading name, or add
              the town.
            </p>
            <p className="text-[11px] text-muted-foreground">Checked {formatDate(profile.fetched_at)}</p>
          </div>
        )}

        {!loading && profile?.fetch_status === 'ok' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{profile.title || '—'}</span>
              {profile.category && <Badge variant="secondary">{profile.category}</Badge>}
              {profile.rating != null && (
                <Badge variant="info" className="gap-1">
                  <Star className="h-3 w-3" />
                  {profile.rating.toFixed(1)}
                  {profile.reviews_count != null && <span className="opacity-80">· {profile.reviews_count} reviews</span>}
                </Badge>
              )}
              {profile.rating == null && (
                <span className="text-xs text-muted-foreground">No rating on the listing</span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {profile.address && (
                <Row icon={MapPin}>
                  <span className="break-words">{profile.address}</span>
                  {addressDiffers && (
                    <p className="mt-0.5 text-[11px] text-[hsl(var(--warning))]">
                      Differs from the address on file ({ourAddress}) — check which is current.
                    </p>
                  )}
                </Row>
              )}
              {profile.phone && (
                <Row icon={Phone}>
                  <a href={`tel:${profile.phone}`} className="hover:underline">{profile.phone}</a>
                </Row>
              )}
              {profile.website && (
                <Row icon={Globe}>
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="break-all hover:underline">
                    {profile.website}
                  </a>
                </Row>
              )}
              {timetableOf(profile).length > 0 && (
                <Row icon={Clock}>
                  <div className="grid grid-cols-[3ch_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {timetableOf(profile).map((d) => (
                      <React.Fragment key={d.day}>
                        <span className="text-muted-foreground">{d.day}</span>
                        <span className="tabular-nums">{d.hours}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </Row>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
              <span className="text-[11px] text-muted-foreground">
                From Google {formatDate(profile.fetched_at)} · searched “{profile.query}”
              </span>
              <div className="flex items-center gap-2">
                {/* The listing's own place_id/cid — Maps opens THIS business, not a text guess. */}
                {(() => {
                  const href = profile.maps_url
                    || googleMapsUrl({ address: profile.address }, { place_id: profile.place_id, cid: profile.cid });
                  return href ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        <MapPin className="h-4 w-4" /> Open on Maps <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    </Button>
                  ) : null;
                })()}
                <Button size="sm" variant="ghost" onClick={discard} title="Wrong business? Discard this listing.">
                  <X className="h-4 w-4" /> Not them
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GoogleBusinessCard;
