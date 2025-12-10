import React, { useState, useEffect } from 'react';
import { Coins, ShoppingCart, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CreditsService } from '@/services/credits.service';
import { StripeService } from '@/services/stripe.service';

const creditsService = new CreditsService();
const stripeService = new StripeService();

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonus: number;
}

export const CreditsTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [monthlyAllowance, setMonthlyAllowance] = useState(100);

  const packages: CreditPackage[] = stripeService.getCreditPackages();

  useEffect(() => {
    loadBalance();
  }, [user]);

  const loadBalance = async () => {
    if (!user) return;

    try {
      const { balance: currentBalance, error } = await creditsService.getBalance();
      if (error) throw new Error(error);
      setBalance(currentBalance || 0);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const handleBuyCredits = async (pkg: CreditPackage) => {
    if (!user) return;

    setLoading(true);
    try {
      const { url, error } = await stripeService.createCreditCheckoutSession(
        pkg.credits,
        pkg.price,
        user.email || ''
      );

      if (error) throw new Error(error);
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

  const usagePercentage = (balance / monthlyAllowance) * 100;

  return (
    <div className="space-y-6">
      {/* Current Balance */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 shadow-lg rounded-2xl">
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

      {/* Credit Packages */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Buy More Credits
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <Card
              key={pkg.id}
              className="bg-white/80 backdrop-blur-sm border-white/20 shadow-lg rounded-2xl hover:shadow-xl transition-shadow"
            >
              <CardHeader>
                <CardTitle>{pkg.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold">${pkg.price}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Credits</span>
                    <span className="font-semibold">{pkg.credits}</span>
                  </div>
                  {pkg.bonus > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Bonus</span>
                      <span className="font-semibold text-green-600">+{pkg.bonus}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="font-bold text-primary">{pkg.credits + pkg.bonus} credits</span>
                  </div>
                </div>
                <Button
                  onClick={() => handleBuyCredits(pkg)}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Buy Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Credit Usage Info */}
      <Card className="bg-white/80 backdrop-blur-sm border-white/20 shadow-lg rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            How Credits Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• Credits are used for AI operations like PDF processing, agent chat, and material search</p>
          <p>• Different AI models have different costs based on token usage</p>
          <p>• 1 credit = $0.01 USD</p>
          <p>• Unused credits roll over to the next month</p>
          <p>• Subscription credits are granted monthly, purchased credits never expire</p>
        </CardContent>
      </Card>
    </div>
  );
};

