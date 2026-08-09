/**
 * Price scan tool (/tools/price-scan)
 *
 * Turnstile-gated, quota-metered live retailer price lookup. Extracted from
 * the former combined PublicToolsPage; shares its result cards + shell with
 * the mention scan via toolsShared.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, Search, Shield, ShoppingBag } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { PublicToolsApiError, priceScan, type PublicPriceScanResponse } from '@/services/publicToolsService';
import { formatNumber } from '@/utils/decimal';
import {
  PriceResultsCard,
  QuotaBadge,
  ScanningPanel,
  ToolsShell,
  UpsellCard,
  useToolsQuota,
} from './toolsShared';

export default function PriceScanPage() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isAuthenticated = !!user;
  const { quota, setQuota, quotaError } = useToolsQuota(accessToken, 'price');

  const [productName, setProductName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [country, setCountry] = useState('');

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicPriceScanResponse | null>(null);

  const creditsPerScan = quota?.credits_per_scan ?? 5;
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

  const onScan = async () => {
    if (!turnstileToken) {
      setScanError('Please complete the captcha first.');
      return;
    }
    if (productName.trim().length < 2) {
      setScanError('Product name must be at least 2 characters.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setResult(null);
    try {
      const res = await priceScan({
        turnstileToken,
        productName: productName.trim(),
        manufacturer: manufacturer.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        countryCode: country.trim().toUpperCase() || undefined,
        accessToken,
      });
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
        setScanError(e instanceof Error ? e.message : 'Scan failed');
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
          <ShoppingBag className="h-6 w-6 text-primary" />
          Price scan
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Type any product or brand. See live retailer prices pulled from across the web in seconds.
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="product-name">Product name</Label>
                <Input
                  id="product-name"
                  placeholder="e.g. Hansgrohe Talis E single-lever basin mixer"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="manufacturer">Manufacturer (optional)</Label>
                <Input id="manufacturer" placeholder="e.g. Hansgrohe" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} maxLength={120} />
              </div>
              <div>
                <Label htmlFor="dimensions">Dimensions (optional)</Label>
                <Input id="dimensions" placeholder="e.g. 60x60 cm" value={dimensions} onChange={(e) => setDimensions(e.target.value)} maxLength={80} />
              </div>
              <div className="sm:col-span-2 sm:w-1/2">
                <Label htmlFor="price-country">Country (ISO 2-letter, optional)</Label>
                <Input id="price-country" placeholder="GR, DE, IT…" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {quota?.turnstile_site_key ? (
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Bot check — required before each scan</span>
                  </Label>
                  <TurnstileWidget
                    ref={turnstileRef}
                    siteKey={quota.turnstile_site_key}
                    action="price_scan"
                    onVerify={handleVerify}
                    onExpired={() => setTurnstileToken(null)}
                    onError={(code) => {
                      setTurnstileError(code);
                      setTurnstileToken(null);
                    }}
                  />
                  {turnstileError && <p className="text-xs text-destructive mt-1">Captcha error: {turnstileError}</p>}
                </div>
                <Button onClick={onScan} disabled={scanning || !turnstileToken} className="gap-2 min-w-[160px]" size="lg">
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Scanning…</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Run scan</span>
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
                {quota.remaining} of {quota.limit} free scans remaining today. Identical queries within 24 hours are served instantly and don't count.
              </p>
            )}
            {quota && isAuthenticated && balance != null && (
              <p className="text-xs text-muted-foreground">
                {formatNumber(balance)} credits available · each scan costs {creditsPerScan} credits. Identical queries within 24 hours are served instantly and don't debit.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {scanning && <ScanningPanel kind="price" />}
      {!scanning && result && <PriceResultsCard data={result} />}
    </ToolsShell>
  );
}
