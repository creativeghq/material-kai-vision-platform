import React, { useState, useEffect } from 'react';
import { Crown, Check, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { StripeService } from '@/services/stripe.service';

const stripeService = new StripeService();

export const SubscriptionTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  const tiers = stripeService.getSubscriptionTiers();

  useEffect(() => {
    loadSubscriptionData();
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status, subscription_current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentTier(data.subscription_tier || 'free');
        setSubscriptionStatus(data.subscription_status || '');
        setPeriodEnd(data.subscription_current_period_end || '');
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    }
  };

  const handleSubscribe = async (tier: ReturnType<typeof stripeService.getSubscriptionTiers>[number]) => {
    if (!user || !tier.priceId) return;

    setLoading(true);
    try {
      const { url } = await stripeService.createSubscriptionCheckoutSession(
        tier.priceId,
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

  const handleManageSubscription = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await stripeService.createCustomerPortalSession();
      if (response?.url && response.url.startsWith('https://')) {
        window.location.href = response.url;
      } else {
        toast({
          title: 'Unable to open portal',
          description: 'Subscription management is not available yet. Please contact support.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      const message = error instanceof Error ? error.message : 'Failed to open subscription management.';
      toast({
        title: 'Error',
        description: message.includes('No Stripe customer')
          ? 'No active subscription found. Subscribe to a plan first.'
          : `${message} Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      {currentTier !== 'free' && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Current Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold capitalize">{currentTier} Plan</p>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  Status: <Badge variant={subscriptionStatus === 'active' ? 'default' : 'secondary'}>{subscriptionStatus}</Badge>
                </span>
                {periodEnd && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Renews on: {new Date(periodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button onClick={handleManageSubscription} disabled={loading} variant="outline">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Manage Subscription
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={`rounded-2xl ${
              tier.id === currentTier ? 'ring-2 ring-primary' : ''
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {tier.name}
                <div className="flex gap-1">
                  {'popular' in tier && tier.popular && <Badge variant="secondary">Popular</Badge>}
                  {tier.id === currentTier && <Badge>Current</Badge>}
                </div>
              </CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold">{tier.currency === 'EUR' ? '€' : '$'}{tier.price}</span>
                {tier.price > 0 && <span className="text-muted-foreground">/month</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-semibold text-primary">{tier.monthlyCredits.toLocaleString()} credits/month</p>
              <ul className="space-y-2">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {tier.id !== currentTier && tier.id !== 'free' && (
                <Button
                  onClick={() => handleSubscribe(tier)}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {tier.price < (tiers.find(t => t.id === currentTier)?.price ?? 0)
                    ? `Downgrade to ${tier.name}`
                    : `Subscribe to ${tier.name}`}
                </Button>
              )}
              {tier.id === 'free' && currentTier !== 'free' && (
                <Button
                  onClick={handleManageSubscription}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Cancel Subscription
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

