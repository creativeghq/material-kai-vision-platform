import React, { useState, useEffect, useMemo } from 'react';
import { Coins, ShoppingCart, TrendingUp, Loader2, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import { Input } from '@/components/core/ui/input';
import { Slider } from '@/components/core/ui/slider';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CreditsService } from '@/services/credits.service';
import { StripeService, calculateCreditsForAmount } from '@/services/stripe.service';
import { CreditsCalculator } from './CreditsCalculator';

const creditsService = new CreditsService();
const stripeService = new StripeService();

const QUICK_AMOUNTS = [10, 25, 50, 100];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500;

export const CreditsTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [monthlyAllowance, setMonthlyAllowance] = useState(100);
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

  const handleAmountInput = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setAmount(Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(num))));
  };

  const handleAddToPurchase = (credits: number) => {
    // Convert credits to EUR amount: at standard rate, 1 credit = €0.01
    const eurAmount = Math.ceil(credits * 0.01);
    setAmount(Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, eurAmount)));
    document.getElementById('buy-credits-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const usagePercentage = (balance / monthlyAllowance) * 100;

  return (
    <div className="space-y-6">
      {/* Current Balance */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Credit Balance
          </CardTitle>
          <CardDescription>Your available credits for AI operations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-primary">{balance.toFixed(2)}</span>
            <span className="text-xl text-muted-foreground">credits</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monthly allowance</span>
              <span className="font-semibold">{monthlyAllowance} credits</span>
            </div>
            <Progress value={Math.min(usagePercentage, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {usagePercentage > 100
                ? `${(usagePercentage - 100).toFixed(0)}% over monthly allowance`
                : `${(100 - usagePercentage).toFixed(0)}% remaining this month`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Credits Calculator */}
      <CreditsCalculator onAddToPurchase={handleAddToPurchase} />

      {/* Buy Credits */}
      <Card className="rounded-2xl" id="buy-credits-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Buy Credits
          </CardTitle>
          <CardDescription>Choose any amount — bigger purchases get better rates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Select */}
          <div className="flex gap-2 flex-wrap">
            {QUICK_AMOUNTS.map((qa) => (
              <Button
                key={qa}
                variant={amount === qa ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAmount(qa)}
              >
                €{qa}
              </Button>
            ))}
          </div>

          {/* Amount Input + Slider */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-muted-foreground">€</span>
              <Input
                type="number"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                value={amount}
                onChange={(e) => handleAmountInput(e.target.value)}
                className="text-2xl font-bold h-12 w-32"
              />
              <span className="text-sm text-muted-foreground">EUR</span>
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
              <span className="text-sm text-muted-foreground">Rate</span>
              <span className="text-sm font-medium">€{quote.ratePerCredit.toFixed(4)}/credit</span>
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
        </CardContent>
      </Card>

      {/* Credit Usage Info */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            How Credits Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• Different AI models have different costs based on token usage</p>
          <p>• Volume discounts: Silver (5% off at €10+), Gold (10% off at €45+), Platinum (15% off at €80+)</p>
          <p>• Unused credits roll over to the next month</p>
          <p>• Subscription credits are granted monthly, purchased credits never expire</p>
        </CardContent>
      </Card>
    </div>
  );
};
