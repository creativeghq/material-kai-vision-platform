/**
 * Material search tool (/tools/product-search)
 *
 * Public, Turnstile-gated, quota-metered search over the operator's public material
 * catalog. Anonymous visitors get 2 free searches/day; signed-in users spend 1 credit
 * each (new accounts get welcome credits so it feels free). Shares the shell, quota
 * hook, scanning panel and upsell with the other /tools scans via toolsShared.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, PackageSearch, Search, Shield } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { PublicToolsApiError, productSearch, type PublicProductSearchResponse } from '@/services/publicToolsService';
import {
  ProductResultsCard,
  QuotaBadge,
  ScanningPanel,
  ToolsShell,
  UpsellCard,
  useToolsQuota,
} from './toolsShared';

export default function ProductSearchPage() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isAuthenticated = !!user;
  const { quota, setQuota, quotaError } = useToolsQuota(accessToken, 'product');

  const [query, setQuery] = useState('');

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicProductSearchResponse | null>(null);

  const creditsPerScan = quota?.credits_per_scan ?? 1;
  const balance = quota?.credits_balance ?? null;
  const limitReached = isAuthenticated ? balance != null && balance < creditsPerScan : quota?.remaining === 0;

  const handleVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(null);
  }, []);
  const resetCaptcha = () => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const onSearch = async () => {
    if (!turnstileToken) {
      setScanError('Please complete the captcha first.');
      return;
    }
    if (query.trim().length < 2) {
      setScanError('Enter at least 2 characters.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setResult(null);
    try {
      const res = await productSearch({ turnstileToken, query: query.trim(), accessToken });
      setResult(res);
      setQuota(res.quota);
    } catch (e: unknown) {
      if (e instanceof PublicToolsApiError) {
        if (e.detail.kind === 'quota_exceeded' || e.detail.kind === 'insufficient_credits') {
          setQuota(e.detail.quota);
          setScanError(null);
        } else {
          setScanError(e.detail.message);
        }
      } else {
        setScanError(e instanceof Error ? e.message : 'Search failed');
      }
    } finally {
      setScanning(false);
      resetCaptcha();
    }
  };

  return (
    <ToolsShell headerRight={<QuotaBadge quota={quota} isAuthenticated={isAuthenticated} />}>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" />
          Material search
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Search the material catalog by name, brand or category. See matching products instantly.
        </p>
      </div>

      {quotaError && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="py-4 flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span>Could not load quota: {quotaError}</span>
          </CardContent>
        </Card>
      )}

      {limitReached && quota ? (
        <UpsellCard quota={quota} isAuthenticated={isAuthenticated} />
      ) : (
        <Card className="dashboard-card">
          <CardHeader>
            <Label htmlFor="product-query">What are you looking for?</Label>
            <Input
              id="product-query"
              placeholder="e.g. matte black porcelain tile, oak veneer, brass tap…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && turnstileToken) onSearch(); }}
              maxLength={200}
              autoFocus
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {quota?.turnstile_site_key ? (
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Bot check — required before each search</span>
                  </Label>
                  <TurnstileWidget
                    ref={turnstileRef}
                    siteKey={quota.turnstile_site_key}
                    action="product_search"
                    onVerify={handleVerify}
                    onExpired={() => setTurnstileToken(null)}
                    onError={(code) => {
                      setTurnstileError(code);
                      setTurnstileToken(null);
                    }}
                  />
                  {turnstileError && <p className="text-xs text-destructive mt-1">Captcha error: {turnstileError}</p>}
                </div>
                <Button onClick={onSearch} disabled={scanning || !turnstileToken} className="gap-2 min-w-[160px]" size="lg">
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Searching…</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Search</span>
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading bot check…</span>
              </div>
            )}

            {scanError && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {quota && !isAuthenticated && quota.remaining > 0 && (
              <p className="text-xs text-muted-foreground">
                {quota.remaining} of {quota.limit} free searches remaining today. Identical queries within 24 hours are served instantly and don't count.
              </p>
            )}
            {quota && isAuthenticated && balance != null && (
              <p className="text-xs text-muted-foreground">
                {balance.toLocaleString()} credits available · each search costs {creditsPerScan} credit{creditsPerScan === 1 ? '' : 's'}. Identical queries within 24 hours are served instantly and don't debit.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {scanning && <ScanningPanel kind="product" />}
      {!scanning && result && <ProductResultsCard data={result} isAuthenticated={isAuthenticated} />}
    </ToolsShell>
  );
}
