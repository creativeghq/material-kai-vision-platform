import React, { useCallback, useEffect, useState } from 'react';
import { Home, Loader2, ArrowLeft, Wrench, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState, HubStatTile, HubStatGrid } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import {
  ownerPropertiesService, type OwnerProperty, type OwnerPropertyDetail,
} from '@/services/ownerPropertiesService';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'info', under_offer: 'warning', rented: 'success', sold: 'success',
};

const Detail: React.FC<{ propertyId: string; onBack: () => void }> = ({ propertyId, onBack }) => {
  const { toast } = useToast();
  const [d, setD] = useState<OwnerPropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ownerPropertiesService.get(propertyId)
      .then((r) => { if (!cancelled) setD(r); })
      .catch((e) => toast({ title: 'Could not open this property', description: getErrorMessage(e), variant: 'destructive' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId, toast]);

  if (loading) return <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!d) return null;

  const p = d.property;
  const m = d.management;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />All my properties
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle>{p.title || p.address || 'Your property'}</CardTitle>
            <p className="text-sm text-muted-foreground">{[p.address, p.town].filter(Boolean).join(', ')}</p>
          </div>
          {p.listing_status && (
            <Badge variant={STATUS_TONE[p.listing_status] ?? 'neutral'}>{p.listing_status.replace(/_/g, ' ')}</Badge>
          )}
        </CardHeader>
        <CardContent>
          <HubStatGrid>
            <HubStatTile label="Viewings" value={String(d.viewings.length)} />
            <HubStatTile label="Enquiries" value={String(d.enquiries)} />
            <HubStatTile label="Days on market" value={d.performance?.days_on_market != null ? String(d.performance.days_on_market) : '—'} />
            <HubStatTile label="Asking" value={formatMoney(p.price, p.currency ?? 'EUR', { decimals: 0 })} />
          </HubStatGrid>
        </CardContent>
      </Card>

      {d.offers.total > 0 && (
        <Card>
          <CardHeader><CardTitle>Offers</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Offers received</span> <strong className="tabular-nums">{d.offers.total}</strong></p>
            <p><span className="text-muted-foreground">Still live</span> <strong className="tabular-nums">{d.offers.live}</strong></p>
            <p><span className="text-muted-foreground">Highest</span> <strong className="tabular-nums">{formatMoney(d.offers.highest, d.offers.currency, { decimals: 0 })}</strong></p>
            {d.offers.leading_status && (
              <p><span className="text-muted-foreground">Status</span> <strong>{d.offers.leading_status.replace(/_/g, ' ')}</strong></p>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Your agent will talk you through who is behind each offer.
            </p>
          </CardContent>
        </Card>
      )}

      {d.viewings.some((v) => v.feedback) && (
        <Card>
          <CardHeader><CardTitle>What viewers said</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.viewings.filter((v) => v.feedback).map((v) => (
              <div key={v.scheduled_at} className="rounded-sm border border-hairline bg-surface-sunken p-3">
                <p className="text-sm">{v.feedback}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(v.scheduled_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {d.price_history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Price history</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {d.price_history.map((h) => (
              <div key={h.changed_at} className="flex justify-between border-b border-hairline py-1 last:border-0">
                <span className="tabular-nums">{formatMoney(h.price, h.currency, { decimals: 0 })}</span>
                <span className="text-muted-foreground">{formatDate(h.changed_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {m && (
        <>
          <Card>
            <CardHeader><CardTitle>Let &amp; rent</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <HubStatGrid>
                <HubStatTile label="Rent received" value={formatMoney(m.rent.received, m.rent.currency, { decimals: 0 })} />
                <HubStatTile label="Outstanding" value={formatMoney(m.rent.outstanding, m.rent.currency, { decimals: 0 })} />
                <HubStatTile label="Rent" value={`${formatMoney(m.tenancy.rent_amount, m.rent.currency, { decimals: 0 })} ${m.tenancy.rent_frequency ?? ''}`} />
                <HubStatTile label="Tenancy ends" value={m.tenancy.end_date ? formatDate(m.tenancy.end_date) : '—'} />
              </HubStatGrid>
              {m.charges.length > 0 && (
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-sunken">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold">Due</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold">Amount</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold">Outstanding</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.charges.map((c) => (
                        <tr key={c.id} className="border-b border-hairline last:border-0">
                          <td className="px-3 py-2">{formatDate(c.due_date)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(c.amount, c.currency, { decimals: 0 })}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(c.outstanding, c.currency, { decimals: 0 })}</td>
                          <td className="px-3 py-2">{c.payment_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />Work done</CardTitle></CardHeader>
            <CardContent>
              {m.maintenance.length === 0 ? (
                <HubEmptyState title="No work reported" description="Nothing has needed attention on this property." />
              ) : (
                <div className="space-y-2">
                  {m.maintenance.map((j) => (
                    <div key={j.id} className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{j.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {j.reported_at ? `Reported ${formatDate(j.reported_at)}` : ''}
                          {j.resolved_at ? ` · Done ${formatDate(j.resolved_at)}` : ''}
                        </p>
                      </div>
                      <Badge variant={j.resolved_at ? 'success' : 'warning'}>{j.status}</Badge>
                    </div>
                  ))}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Anything chargeable reaches you as a quote or on your statement.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {m.inspections.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-muted-foreground" />Inspections</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {m.inspections.map((i) => (
                  <div key={i.id} className="flex justify-between border-b border-hairline py-1 last:border-0">
                    <span>{i.scheduled_at ? formatDate(i.scheduled_at) : '—'}</span>
                    <span className="text-muted-foreground">{i.status}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

const MyPropertiesPage: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<OwnerProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await ownerPropertiesService.list();
      setRows(r.properties);
      if (r.properties.length === 1) setSelected(r.properties[0].id);
    } catch (err) {
      toast({ title: 'Could not load your properties', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader icon={Home} title="My properties" subtitle="How your property is doing, and what has been happening on it" />
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            title="No properties yet"
            description="When an agent gives you access to a property of yours, it appears here."
          />
        ) : selected ? (
          <Detail propertyId={selected} onBack={rows.length > 1 ? () => setSelected(null) : () => {}} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <Card key={r.id} className="panel-interactive cursor-pointer" onClick={() => setSelected(r.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{r.title || r.address || 'Property'}</p>
                    {r.listing_status && (
                      <Badge variant={STATUS_TONE[r.listing_status] ?? 'neutral'}>{r.listing_status.replace(/_/g, ' ')}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{[r.address, r.town].filter(Boolean).join(', ')}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPropertiesPage;
