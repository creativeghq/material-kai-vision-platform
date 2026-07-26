import React, { useState, useEffect, useMemo } from 'react';
import { Coins, ShoppingCart, TrendingUp, Loader2, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Slider } from '@/components/core/ui/slider';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CreditsService } from '@/services/credits.service';
import { StripeService, calculateCreditsForAmount } from '@/services/stripe.service';
import { CreditUsageHistory } from './CreditUsageHistory';
import { CronPausedBanner } from './CronPausedBanner';

const creditsService = new CreditsService();
const stripeService = new StripeService();

// Preset packs — the discount tier is baked into each (see calculateCreditsForAmount).
const PRESET_AMOUNTS = [10, 25, 50, 100];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500;

export const CreditsTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState(25);

  const quote = useMemo(() => calculateCreditsForAmount(amount), [amount]);

  useEffect(() => {
    loadBalance();
  }, [user]);

  const loadBalance = async () => {
    if (!user) return;

    try {
      const result = await creditsService.getBalance();
      setBalance(result.balance || 0);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const handleBuyCredits = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { url } = await stripeService.createCreditCheckoutSession(
        quote.credits,
        amount,
      );

      if (url) window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scheduled features paused for lack of credits (auto-resume on top-up) */}
      <CronPausedBanner />

      {/* Current Balance */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Credit Balance
          </CardTitle>
          <CardDescription>Your available credits for AI operations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-primary">{balance.toFixed(2)}</span>
            <span className="text-xl text-muted-foreground">credits</span>
          </div>
          {/* The real spend breakdown lives in the Usage & spend history card below — no fabricated
              "monthly allowance" meter (there is no per-plan monthly grant to measure against). */}
        </CardContent>
      </Card>

      {/* Usage & spend history */}
      <CreditUsageHistory />

      {/* Buy Credits */}
      <Card className="rounded-2xl" id="buy-credits-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Buy Credits
          </CardTitle>
          <CardDescription>Pick a pack or set your own amount — bigger amounts get better rates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preset packs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRESET_AMOUNTS.map((pa) => {
              const presetQuote = calculateCreditsForAmount(pa);
              const selected = amount === pa;
              return (
                <button
                  key={pa}
                  type="button"
                  onClick={() => setAmount(pa)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? 'border-primary ring-2 ring-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="text-lg font-bold">€{pa}</div>
                  <div className="text-sm text-primary font-semibold">
                    {presetQuote.credits.toLocaleString()} credits
                  </div>
                  {presetQuote.discount > 0 && (
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">
                      {presetQuote.discount}% off
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom amount — slider always visible, synced to the selected pack */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Custom amount</span>
              <span className="text-2xl font-bold">€{amount}</span>
            </div>
            <Slider
              value={[amount]}
              onValueChange={([v]) => setAmount(v)}
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>€{MIN_AMOUNT}</span>
              <span>€{MAX_AMOUNT}</span>
            </div>
          </div>

          {/* Live Quote */}
          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">You get</span>
              <span className="text-2xl font-bold text-primary">
                {quote.credits.toLocaleString()} credits
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tier</span>
              <Badge variant={quote.discount > 0 ? 'default' : 'secondary'}>
                <Zap className="h-3 w-3 mr-1" />
                {quote.tierName}{quote.discount > 0 ? ` (${quote.discount}% off)` : ''}
              </Badge>
            </div>
            {quote.nextTier && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2">
                Spend €{quote.nextTier.minAmount}+ to unlock {quote.nextTier.name} tier ({quote.nextTier.discount}% off)
              </p>
            )}
          </div>

          {/* Buy Button */}
          <Button
            onClick={handleBuyCredits}
            disabled={loading || amount < MIN_AMOUNT}
          >
            {loading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : null}
            Buy {quote.credits.toLocaleString()} Credits for €{amount}
          </Button>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border pt-3">
            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Purchased credits never expire</span>
            <span>Unused monthly credits roll over</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
