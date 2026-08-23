/**
 * Get a WhatsApp number — search, buy, hold, release.
 *
 * The missing first step. Connecting WhatsApp assumed the workspace already owned a number, so a
 * tenant without one had no route into the product at all; Zernio sells them in 54 countries and
 * nothing here offered it.
 *
 * Two things this screen refuses to blur:
 *  - a purchase that returns a Stripe checkout URL is NOT a purchase yet, and neither is one that
 *    comes back asking for KYC. Both are shown as the step they are.
 *  - a brought-your-own number has no price and no release, because Zernio neither bills it nor
 *    owns its lifecycle. Showing it beside a bought one with a blank price implies "free".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, Search, Loader2, ExternalLink, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMoney } from '@/utils/decimal';
import { loadVocabulary, type VocabularyTerm } from '@/services/vocabularies';
import { messagingService } from '../services/messagingService';
import type { AvailablePhoneNumber, OwnedPhoneNumber } from '../services/types';

const NUMBER_TYPES = [
  { value: 'local', label: 'Local' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'national', label: 'National' },
  { value: 'toll_free', label: 'Toll-free' },
];

/**
 * Zernio prices numbers in USD cents. Delegates to the canonical formatter rather than doing its
 * own `/100` and `$` — a second money formatter is a second set of rounding rules.
 */
const money = (cents: number | null) =>
  cents == null ? '—' : `${formatMoney(cents / 100, 'USD')}/mo`;

const statusVariant = (s: string | null) =>
  s === 'active' ? 'success'
    : s === 'connected' ? 'info'
      : s === 'suspended' || s === 'released' ? 'error'
        : 'warning';

export const PhoneNumbersTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { isOperator } = usePermissions();
  const { toast } = useToast();

  const [countries, setCountries] = useState<VocabularyTerm[]>([]);
  const [owned, setOwned] = useState<OwnedPhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [numberType, setNumberType] = useState<string>('local');
  const [areaCode, setAreaCode] = useState('');
  const [wantsSms, setWantsSms] = useState(false);
  const [results, setResults] = useState<AvailablePhoneNumber[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: 'checkout' | 'kyc'; url: string } | null>(null);

  /**
   * One intent id per (workspace, country, type, area code). Regenerating it on every click would
   * defeat both Zernio's idempotency and its 10-minute velocity check — which is the difference
   * between an impatient operator owning one number and owning four.
   */
  const purchaseIntentId = useMemo(
    () => `ws:${activeWorkspaceId}:${country}:${numberType}:${areaCode || 'any'}`,
    [activeWorkspaceId, country, numberType, areaCode],
  );

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      setOwned(await messagingService.listPhoneNumbers(activeWorkspaceId));
    } catch (err) {
      toast({
        title: 'Could not read your numbers',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  // Which countries we offer is DATA (`phone_number_countries`), not a constant: Zernio sells in
  // 54 and which of them this platform is willing to buy in is an operator decision that must not
  // need a deploy. No fallback list — an empty select says "nobody configured this", which is the
  // truth, where a hard-coded default would quietly ignore the operator's edits forever.
  useEffect(() => {
    loadVocabulary('phone_number_countries')
      .then((terms) => {
        setCountries(terms);
        if (terms.length && !terms.some((t) => t.value === country)) setCountry(terms[0].value);
      })
      .catch((err) => toast({
        title: 'Could not load the country list',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (!activeWorkspaceId) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await messagingService.searchPhoneNumbers(activeWorkspaceId, {
        country, numberType, prefix: areaCode || undefined, sms: wantsSms, limit: 20,
      });
      setResults(res.numbers);
    } catch (err) {
      toast({
        title: 'Search failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const buy = async () => {
    if (!activeWorkspaceId) return;
    setBuying(true);
    setPending(null);
    try {
      const outcome = await messagingService.purchasePhoneNumber(activeWorkspaceId, {
        country,
        numberType: numberType as 'local' | 'mobile' | 'national' | 'toll_free',
        areaCode: areaCode || undefined,
        wantsSms,
        purchaseIntentId,
      });
      if (outcome.kind === 'checkout') {
        setPending({ kind: 'checkout', url: outcome.checkoutUrl });
        toast({ title: 'One step left', description: 'Complete payment to finish the purchase.' });
      } else if (outcome.kind === 'kyc_required') {
        setPending({ kind: 'kyc', url: outcome.kycUrl });
        toast({ title: 'Identity check required', description: `${outcome.country ?? 'This country'} requires KYC before a number can be issued.` });
      } else {
        toast({ title: 'Number purchased' });
        await load();
      }
    } catch (err) {
      toast({
        title: 'Purchase failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBuying(false);
    }
  };

  const release = async (n: OwnedPhoneNumber) => {
    if (!activeWorkspaceId) return;
    // Irreversible, it cancels a subscription line, and it disconnects the WhatsApp account on the
    // number. That earns a confirmation naming the actual number, not a generic "are you sure".
    const ok = window.confirm(
      `Release ${n.phoneNumber}?\n\nThis cannot be undone. The number is returned to the carrier, `
      + 'the WhatsApp account connected to it is disconnected, and the monthly charge stops.',
    );
    if (!ok) return;
    setReleasing(n.id);
    try {
      await messagingService.releasePhoneNumber(activeWorkspaceId, n.id);
      toast({ title: `${n.phoneNumber} released` });
      await load();
    } catch (err) {
      toast({
        title: 'Release failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Your numbers
          </CardTitle>
          <CardDescription>
            Numbers held by this workspace. Bought numbers are billed monthly and can be released
            here; one you connected yourself is not billed by us and is managed by disconnecting
            the channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-sm bg-muted/40" />
              ))}
            </div>
          ) : owned.length === 0 ? (
            <div className="p-4">
              <HubEmptyState
                variant="empty"
                icon={Phone}
                title="No number yet"
                description="WhatsApp needs a phone number. Search below for one in your country, or connect a number you already own from Number & channel."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owned.map(n => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-sm">
                        {n.phoneNumber}
                        {n.broughtYourOwn && (
                          <span className="ml-2 text-xs text-muted-foreground">(yours)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{n.country ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(n.status)} className="capitalize">
                          {(n.status ?? 'unknown').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {n.broughtYourOwn ? 'Not billed here' : money(n.monthlyCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!n.broughtYourOwn && isOperator && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void release(n)}
                            disabled={releasing === n.id}
                          >
                            {releasing === n.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Get a number
          </CardTitle>
          <CardDescription>
            $3–$21 per month depending on the country, charged to the platform&rsquo;s Zernio
            subscription. WhatsApp is enabled on it automatically — a number you then have to
            connect by hand is the same dead end in two steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="pn-country">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="pn-country"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn-type">Type</Label>
              <Select value={numberType} onValueChange={setNumberType}>
                <SelectTrigger id="pn-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NUMBER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn-area">Area code</Label>
              <Input
                id="pn-area"
                value={areaCode}
                onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="optional"
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => void search()} disabled={searching || !country}>
                {searching
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Searching…</>
                  : <><Search className="h-4 w-4 mr-1" /> Check availability</>}
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wantsSms}
              onChange={e => setWantsSms(e.target.checked)}
              className="h-4 w-4 rounded-sm border-hairline"
            />
            Only numbers that can also send SMS
          </label>

          {results && (
            results.length === 0 ? (
              <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-sm text-muted-foreground">
                Nothing available with those filters. Try another area code, or a different number type.
              </div>
            ) : (
              <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
                <p className="text-sm font-medium">{results.length} available</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Zernio assigns one from this pool at purchase — you are choosing a country and a
                  shape, not a specific line.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {results.slice(0, 12).map(n => (
                    <code key={n.phoneNumber} className="rounded-sm bg-card px-2 py-1 font-mono text-xs">
                      {n.phoneNumber}
                    </code>
                  ))}
                </div>
              </div>
            )
          )}

          {pending && (
            <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
              {pending.kind === 'checkout'
                ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--info))]" />}
              <div>
                <p className="font-medium">
                  {pending.kind === 'checkout' ? 'Not bought yet — payment outstanding' : 'Identity check required first'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {pending.kind === 'checkout'
                    ? 'Zernio returned a checkout link. The number is only issued once it is paid.'
                    : 'This country is regulated. Complete the KYC form, then buy again.'}
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-2">
                  <a href={pending.url} target="_blank" rel="noopener noreferrer">
                    {pending.kind === 'checkout' ? 'Complete payment' : 'Open KYC form'}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          {isOperator ? (
            <div className="flex items-center gap-3 border-t border-hairline pt-4">
              <Button onClick={() => void buy()} disabled={buying || !country}>
                {buying
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Buying…</>
                  : <>Buy a {countries.find(c => c.value === country)?.label ?? country} number</>}
              </Button>
              <span className="text-xs text-muted-foreground">
                Recurring charge. Released any time, from the table above.
              </span>
            </div>
          ) : (
            <div className="border-t border-hairline pt-4 text-sm text-muted-foreground">
              Checking availability is open to you; buying puts a recurring charge on the platform
              account, so it is done by a platform administrator. Send them the country and area
              code you need.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PhoneNumbersTab;
