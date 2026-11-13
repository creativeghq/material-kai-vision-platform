import React, { useState, useEffect, useCallback } from 'react';
import { Activity, BarChart3, CreditCard, DollarSign, Globe, Mail, RefreshCw, Send, TrendingUp, Wallet } from 'lucide-react';
import { Cell, Pie, PieChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { PageHeader } from '@/components/shared/PageHeader';
import { MIVAA_API_URL } from '@/config/mivaa';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/utils/decimal';

import { ChannelsBillingDetail } from '../OperationsDashboard/ChannelsBillingDetail';
import { ChannelsCostPanel } from '../OperationsDashboard/ChannelsCostPanel';
import { EXT_SERVICE_COLORS, EXT_SERVICE_LABELS } from '../OperationsDashboard/constants';
import { InboxAIPanel } from '../OperationsDashboard/InboxAIPanel';
import type { ExternalServiceUsageData, ResendEmailStats } from '../OperationsDashboard/types';

const SERVICE_KEYS = [
  'whatsapp-service', 'whatsapp-template',
  'apollo-enrich', 'apollo-people-match',
  'hunter-email-finder', 'hunter-domain-search',
  'zerobounce-validate', 'firecrawl-scrape',
  'zernio-publish', 'social-caption',
  'xai-aurora', 'flux-2-pro', 'flux-dev',
];

const USAGE_ROW_CAP = 1000;

interface ServicePrice {
  model_key: string;
  model_name: string;
  provider: string;
  unit_label: string | null;
  cost_per_unit: number | null;
  markup_multiplier: number | null;
  credits: number | null;
  billing_mode: string | null;
}

const billingLabel = (p: ServicePrice): string => {
  if (p.billing_mode === 'flat_credits') return p.credits != null ? `${p.credits} credits` : 'Flat credits';
  if (p.billing_mode === 'passthrough') return 'Passthrough';
  return p.markup_multiplier != null ? `×${p.markup_multiplier} markup` : '—';
};

const ServicesBillingPage: React.FC = () => {
  const [extServiceData, setExtServiceData] = useState<ExternalServiceUsageData | null>(null);
  const [extServicePeriod, setExtServicePeriod] = useState('7d');
  const [extServiceLoading, setExtServiceLoading] = useState(false);
  const [svcAllTimeTotals, setSvcAllTimeTotals] = useState<Record<string, { operations: number; cost_usd: number }>>({});
  const [svcUsageCapped, setSvcUsageCapped] = useState(false);
  const [servicePrices, setServicePrices] = useState<ServicePrice[] | null>(null);
  const [servicePricesError, setServicePricesError] = useState<string | null>(null);
  const [resendEmailStats, setResendEmailStats] = useState<ResendEmailStats | null>(null);
  const [resendEmailLoading, setResendEmailLoading] = useState(false);

  const fetchExtServiceUsage = useCallback(async (period: string) => {
    try {
      setExtServiceLoading(true);
      const apiUrl = MIVAA_API_URL;
      const response = await fetch(
        `${apiUrl}/api/v1/ai-metrics/external-service-usage?time_period=${period}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ExternalServiceUsageData = await response.json();
      setExtServiceData(data);
    } catch (err) {
      console.error('Failed to fetch external service usage:', err);
    } finally {
      setExtServiceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExtServiceUsage(extServicePeriod);
  }, [extServicePeriod, fetchExtServiceUsage]);

  // Fetch Resend email stats from email_logs
  const fetchResendEmailStats = useCallback(async (period: string) => {
    try {
      setResendEmailLoading(true);
      const now = new Date();
      const fromDate = new Date();
      if (period === '1h') fromDate.setHours(now.getHours() - 1);
      else if (period === '24h') fromDate.setDate(now.getDate() - 1);
      else if (period === '7d') fromDate.setDate(now.getDate() - 7);
      else fromDate.setDate(now.getDate() - 30);

      const { data } = await supabase
        .from('email_logs')
        .select('status')
        .gte('created_at', fromDate.toISOString());

      if (!data) return;

      const total = data.length;
      const delivered = data.filter((r: any) => r.status === 'delivered').length;
      const bounced = data.filter((r: any) => r.status === 'bounced').length;
      const complained = data.filter((r: any) => r.status === 'complained').length;
      const opened = data.filter((r: any) => r.status === 'opened').length;

      setResendEmailStats({
        total,
        delivered,
        bounced,
        complained,
        opened,
        deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
        bounceRate: total > 0 ? (bounced / total) * 100 : 0,
        openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      });
    } catch (err) {
      console.error('Failed to fetch Resend email stats:', err);
    } finally {
      setResendEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResendEmailStats(extServicePeriod);
  }, [extServicePeriod, fetchResendEmailStats]);

  // Fetch all-time totals per external service from ai_usage_logs
  useEffect(() => {
    supabase
      .from('ai_model_pricing')
      .select('model_key, model_name, provider, unit_label, cost_per_unit, markup_multiplier, credits, billing_mode')
      .in('model_key', SERVICE_KEYS)
      .order('provider')
      .then(({ data, error }) => {
        if (error) { setServicePricesError(error.message); return; }
        setServicePrices((data ?? []) as ServicePrice[]);
      });
  }, []);

  useEffect(() => {
    supabase
      .from('ai_usage_logs')
      .select('model_name, billed_cost_usd')
      .in('model_name', SERVICE_KEYS)
      .order('created_at', { ascending: false })
      .limit(USAGE_ROW_CAP)
      .then(({ data }) => {
        if (!data) return;
        setSvcUsageCapped(data.length >= USAGE_ROW_CAP);
        const totals: Record<string, { operations: number; cost_usd: number }> = {};
        data.forEach((row: any) => {
          const key = row.model_name;
          if (!totals[key]) totals[key] = { operations: 0, cost_usd: 0 };
          totals[key].operations += 1;
          totals[key].cost_usd += Number(row.billed_cost_usd) || 0;
        });
        setSvcAllTimeTotals(totals);
      });
  }, []);

  return (
    <div>
      <PageHeader
        icon={Wallet}
        title="Services & Billing"
        subtitle="What each channel and third-party service costs, what we bill for it, and how email is delivering."
      />
      <div className="space-y-4 p-3 sm:p-6">
      <ChannelsCostPanel />

      {/* Then the ledgers behind that summary — what Meta charged, what we billed, and who
          is on hold. All three were written on a schedule and rendered nowhere. */}
      <ChannelsBillingDetail />

      {/* Directly under Channels, because it reads the conversations those channels bring
          in — the operator sees what the channels cost, then what reading them costs, in
          the order the money is actually spent. */}
      <InboxAIPanel />

      <SectionHeader
        title="3rd Party Services"
        subtitle="Usage and cost of the external APIs: Resend (email), Apollo, Hunter.io, ZeroBounce, Firecrawl and Zernio (WhatsApp and social). For AI model costs see AI Configurations."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Configured API Services
          </CardTitle>
          <CardDescription>
            Per-unit cost and billing rule from <code>ai_model_pricing</code>; totals from <code>ai_usage_logs</code>
            {svcUsageCapped ? `, based on the latest ${formatNumber(USAGE_ROW_CAP)} usage rows` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Service</TableHead>
                <TableHead className="font-semibold">Provider</TableHead>
                <TableHead className="font-semibold">Unit</TableHead>
                <TableHead className="text-right font-semibold">Cost / Unit</TableHead>
                <TableHead className="text-right font-semibold">Billing</TableHead>
                <TableHead className="text-right font-semibold">Total Ops</TableHead>
                <TableHead className="text-right font-semibold">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicePricesError ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-destructive">
                    Could not read service pricing: {servicePricesError}
                  </TableCell>
                </TableRow>
              ) : !servicePrices ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">Loading pricing…</TableCell>
                </TableRow>
              ) : servicePrices.map((svc) => {
                const allTime = svcAllTimeTotals[svc.model_key];
                return (
                  <TableRow key={svc.model_key}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-600" />
                        {svc.model_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">{svc.provider}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{svc.unit_label ? `per ${svc.unit_label}` : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {svc.cost_per_unit != null && Number(svc.cost_per_unit) > 0 ? `$${Number(svc.cost_per_unit).toFixed(4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">{billingLabel(svc)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {allTime ? formatNumber(allTime.operations) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {allTime ? (
                        <span className={allTime.cost_usd > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                          ${allTime.cost_usd.toFixed(4)}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {servicePrices && servicePrices.length < SERVICE_KEYS.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              No <code>ai_model_pricing</code> row for:{' '}
              {SERVICE_KEYS.filter((k) => !servicePrices.some((p) => p.model_key === k)).join(', ')}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resend Email Delivery Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Delivery — Resend
          </CardTitle>
          <CardDescription>
            Live delivery metrics from <code>email_logs</code> for the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resendEmailLoading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Loading email stats...
            </div>
          ) : resendEmailStats && resendEmailStats.total > 0 ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Send className="h-3 w-3" /> Total Sent
                </p>
                <p className="text-2xl font-bold">{formatNumber(resendEmailStats.total)}</p>
                <p className="text-xs text-muted-foreground">emails in period</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Delivery Rate</p>
                <p className="text-2xl font-bold text-green-600">{resendEmailStats.deliveryRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.delivered)} delivered</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Bounce Rate</p>
                <p className={`text-2xl font-bold ${resendEmailStats.bounceRate > 5 ? 'text-red-600' : 'text-foreground'}`}>
                  {resendEmailStats.bounceRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.bounced)} bounced</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Open Rate</p>
                <p className="text-2xl font-bold">{resendEmailStats.openRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{formatNumber(resendEmailStats.opened)} opens</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
              <Mail className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No emails sent in this period</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Usage Section */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Live Usage</h3>
        <div className="flex items-center gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map((period) => (
            <Button
              key={period}
              variant={extServicePeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setExtServicePeriod(period)}
            >
              {period}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchExtServiceUsage(extServicePeriod)}
            disabled={extServiceLoading}
          >
            <RefreshCw className={`h-4 w-4 ${extServiceLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {extServiceLoading && !extServiceData ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading usage data...
        </div>
      ) : !extServiceData?.summary || extServiceData.summary.total_operations === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Activity className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No usage in this period</p>
            <p className="text-sm mt-1">Activity will appear once B2B, messaging, or scraping tools are invoked.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="dashboard-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <DollarSign className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium">Total Cost</div>
                  <div className="text-2xl font-bold text-foreground">
                    ${extServiceData.summary.total_cost_usd.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Billed to platform</div>
                </div>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <Activity className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium">Total Operations</div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatNumber(extServiceData.summary.total_operations)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Across {extServiceData.by_service.length} services
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <TrendingUp className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium">Most Used</div>
                  <div className="text-2xl font-bold text-foreground">
                    {extServiceData.by_service[0]
                      ? (EXT_SERVICE_LABELS[extServiceData.by_service[0].service] || extServiceData.by_service[0].service)
                      : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {extServiceData.by_service[0]?.operations || 0} ops
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <CreditCard className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium">Avg Cost / Op</div>
                  <div className="text-2xl font-bold text-foreground">
                    ${extServiceData.summary.total_operations > 0
                      ? (extServiceData.summary.total_cost_usd / extServiceData.summary.total_operations).toFixed(5)
                      : '0.00000'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Across all services</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Cost Breakdown by Service
                </CardTitle>
                <CardDescription>Distribution of spend per service in this period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={extServiceData.by_service.map((s) => ({
                        ...s,
                        label: EXT_SERVICE_LABELS[s.service] || s.service,
                      }))}
                      dataKey="cost_usd"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {extServiceData.by_service.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={EXT_SERVICE_COLORS[index % EXT_SERVICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(5)}`, 'Cost (USD)']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Daily Usage Timeline
                </CardTitle>
                <CardDescription>Operations and cost per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={extServiceData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                    <YAxis yAxisId="left" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'credits' ? `${value.toFixed(2)} cr` : value,
                        name === 'credits' ? 'Credits' : 'Operations',
                      ]}
                      labelFormatter={(label: string) => `Date: ${label}`}
                    />
                    <Bar yAxisId="left" dataKey="credits" fill="#0088FE" name="credits" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="operations" fill="#00C49F" name="operations" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Per-Service Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Per-Service Breakdown
              </CardTitle>
              <CardDescription>Detailed usage and cost per external service in the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Service</TableHead>
                    <TableHead className="text-right font-semibold">Operations</TableHead>
                    <TableHead className="text-right font-semibold">Cost (USD)</TableHead>
                    <TableHead className="text-right font-semibold">Avg Cost / Op</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extServiceData.by_service.map((svc) => (
                    <TableRow key={svc.service}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-blue-600" />
                          <span>{EXT_SERVICE_LABELS[svc.service] || svc.service}</span>
                          <Badge variant="outline" className="text-xs">{svc.service}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(svc.operations)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        ${svc.cost_usd.toFixed(5)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        ${svc.operations > 0 ? (svc.cost_usd / svc.operations).toFixed(5) : '0.00000'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
};

export default ServicesBillingPage;
