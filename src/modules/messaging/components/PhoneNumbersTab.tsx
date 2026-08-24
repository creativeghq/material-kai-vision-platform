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
import { Phone, Search, Loader2, ExternalLink, ShieldCheck, Trash2, AlertTriangle, Receipt, PauseCircle, RotateCw } from 'lucide-react';
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
import { formatMoney, formatNumber } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { supabase } from '@/integrations/supabase/client';
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

/**
 * Our OWN record of a number, which is not the same thing as Zernio's.
 *
 * A hold is deliberately invisible at the carrier — we stop the sending and keep paying for the
 * line, so the number survives and comes back on payment. That means Zernio keeps reporting the
 * number as `active`, and any hold check against the listed status silently matches nothing.
 */
interface LocalNumberRow {
  zernio_number_id: string | null;
  phone_number: string;
  status: string | null;
  held_at: string | null;
  held_reason: string | null;
}

interface ChargeRow {
  id: string;
  period_month: string;
  quantity: number;
  credits_charged: number;
  status: string;
  attempts: number;
  charged_at: string | null;
}

const statusVariant = (s: string | null) =>
  s === 'active' ? 'success'
    : s === 'connected' ? 'info'
      : s === 'suspended' || s === 'released' ? 'error'
        : 'warning';

export const PhoneNumbersTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  // Not `isOperator`. Giving up a number and settling a failed month are the tenant's own
  // business now — the edge function gates both on workspace owner/admin, and a UI that still
  // asked for operator would hide the button from everyone it was opened to.
  // Two different gates, and they are not the same person. BUYING spends the platform's money
  // on the platform's Zernio account, so it stays with the operator; GIVING ONE UP and settling
  // a failed month are the tenant's own business (decided 2026-08-24) and belong to whoever
  // runs the workspace. The edge function enforces exactly this split.
  const { isOperator, isWorkspaceManager } = usePermissions();
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
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [localRows, setLocalRows] = useState<LocalNumberRow[]>([]);
  const [retrying, setRetrying] = useState(false);

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
      // Charges are read directly: `channel_recurring_charges` carries a workspace-member SELECT
      // policy and no write policy, so RLS is the boundary and no edge round-trip earns its keep.
      const [numbers, charged, local] = await Promise.all([
        messagingService.listPhoneNumbers(activeWorkspaceId),
        supabase
          .from('channel_recurring_charges')
          .select('id, period_month, quantity, credits_charged, status, attempts, charged_at')
          .eq('workspace_id', activeWorkspaceId)
          .order('period_month', { ascending: false })
          .limit(24),
        supabase
          .from('workspace_phone_numbers')
          .select('zernio_number_id, phone_number, status, held_at, held_reason')
          .eq('workspace_id', activeWorkspaceId)
          .is('released_at', null),
      ]);
      setOwned(numbers);
      setCharges((charged.data ?? []) as ChargeRow[]);
      setLocalRows((local.data ?? []) as LocalNumberRow[]);
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

  const retry = async () => {
    if (!activeWorkspaceId) return;
    setRetrying(true);
    try {
      const r = await messagingService.retryFailedCharges(activeWorkspaceId);
      // Three outcomes, and they need different words. "Settled but still on hold" is the one
      // that would otherwise look like a broken button: an older month is still owed.
      if (r.restored > 0) {
        toast({ title: 'Back on', description: `Settled and your number${r.restored === 1 ? '' : 's'} came back.` });
      } else if (r.settled > 0) {
        toast({ title: `${r.settled} month(s) settled`, description: 'An earlier month is still outstanding, so the hold stays until it clears.' });
      } else {
        toast({
          title: 'Still unpaid',
          description: 'The charge could not be taken — top up your credits and try again.',
          variant: 'destructive',
        });
      }
      await load();
    } catch (err) {
      toast({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRetrying(false);
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

  // Matched on either key: `zernio_number_id` is the reliable one, but a row written before the
  // id was known still has the E.164 number, and a hold that fails to match renders as no hold.
  const holdOf = (n: OwnedPhoneNumber): LocalNumberRow | undefined =>
    localRows.find((r) => r.status === 'on_hold'
      && (r.zernio_number_id === n.id || r.phone_number === n.phoneNumber));
  const held = owned.filter((n) => holdOf(n));
  const failedCharges = charges.filter((c) => c.status === 'failed');

  return (
    <div className="space-y-6">
      {/* On hold, first and loud. This is a state the customer is FEELING — their WhatsApp has
          stopped — and before this screen its only trace was a console warning on the server. */}
      {held.length > 0 && (
        <Card className="border-[hsl(var(--error))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--error))]">
              <PauseCircle className="h-4 w-4" />
              {held.length === 1 ? 'Your number is on hold' : `${held.length} of your numbers are on hold`}
            </CardTitle>
            <CardDescription>
              A monthly charge could not be taken, so sending is paused. Nothing has been given
              up &mdash; the number is still yours and comes straight back once the balance
              clears. Top up your credits, then retry.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {isWorkspaceManager ? (
              <Button onClick={() => void retry()} disabled={retrying}>
                {retrying
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Retrying</>
                  : <><RotateCw className="mr-2 h-4 w-4" /> Retry the charge</>}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                An owner or admin of this workspace can settle it.
              </p>
            )}
            <span className="text-xs text-muted-foreground">
              Retried automatically each night, so this only saves you the wait.
            </span>
          </CardContent>
        </Card>
      )}

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
                        {/* Our hold wins over Zernio's status: the carrier still calls it
                            active, because that is exactly what we are paying it to do. */}
                        <Badge
                          variant={holdOf(n) ? 'error' : statusVariant(n.status)}
                          className="capitalize"
                        >
                          {holdOf(n) ? 'on hold' : (n.status ?? 'unknown').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {n.broughtYourOwn ? 'Not billed here' : money(n.monthlyCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!n.broughtYourOwn && isWorkspaceManager && (
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

      {/* What they have actually been charged. A recurring charge a customer cannot see is a
          support ticket waiting to be raised. Only rendered once there is history — an empty
          billing table on a workspace that has never bought a number says nothing. */}
      {charges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Monthly charges
            </CardTitle>
            <CardDescription>
              Your number rental, billed in credits at the start of each month.
              {failedCharges.length > 0 && ' Anything marked failed is still owed.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Numbers</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Charged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((c) => (
                    <TableRow key={c.id}>
                      {/* `period_month` is a date of record; parsed bare it is UTC midnight and
                          renders as the previous month west of Greenwich. */}
                      <TableCell className="text-sm">{formatDate(`${c.period_month}T00:00:00`)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.credits_charged)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'charged' ? 'success' : c.status === 'failed' ? 'error' : 'neutral'}>
                          {c.status}
                        </Badge>
                        {c.status === 'failed' && c.attempts > 1 && (
                          <span className="ml-2 text-xs text-muted-foreground">{c.attempts} tries</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.charged_at ? formatDate(c.charged_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
