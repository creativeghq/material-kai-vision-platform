/**
 * Mention scan tool (/tools/mention-scan)
 *
 * Turnstile-gated, quota-metered recent-mentions lookup. Shares its result
 * card + shell with the price scan via toolsShared.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, MessageSquareText, Search, Shield } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { PublicToolsApiError, mentionScan, type PublicMentionScanResponse } from '@/services/publicToolsService';
import {
  MentionResultsCard,
  QuotaBadge,
  ScanningPanel,
  ToolsShell,
  UpsellCard,
  useToolsQuota,
} from './toolsShared';

export default function MentionScanPage() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isAuthenticated = !!user;
  const { quota, setQuota, quotaError } = useToolsQuota(accessToken, 'mention');

  const [subjectLabel, setSubjectLabel] = useState('');
  const [country, setCountry] = useState('');

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicMentionScanResponse | null>(null);

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
    if (subjectLabel.trim().length < 2) {
      setScanError('Subject must be at least 2 characters.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setResult(null);
    try {
      const res = await mentionScan({
        turnstileToken,
        subjectLabel: subjectLabel.trim(),
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
          <MessageSquareText className="h-6 w-6 text-primary" />
          Mention scan
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Type a brand or product. See recent press mentions and outlet coverage from across the web.
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
                <Label htmlFor="subject-label">Brand or product to monitor</Label>
                <Input
                  id="subject-label"
                  placeholder="e.g. Kohler, Roca, Geberit AquaClean Mera"
                  value={subjectLabel}
                  onChange={(e) => setSubjectLabel(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="mention-country">Country (ISO 2-letter, optional)</Label>
                <Input id="mention-country" placeholder="GR, DE, US…" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} />
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
                    action="mention_scan"
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
                {balance.toLocaleString()} credits available · each scan costs {creditsPerScan} credits. Identical queries within 24 hours are served instantly and don't debit.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {scanning && <ScanningPanel kind="mention" />}
      {!scanning && result && <MentionResultsCard data={result} />}
    </ToolsShell>
  );
}
