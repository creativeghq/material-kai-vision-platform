import React, { useState, useEffect } from 'react';
import { Crown, Check, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { StripeService } from '@/services/stripe.service';

const stripeService = new StripeService();

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
  priceId: string;
}

export const SubscriptionTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  const tiers: SubscriptionTier[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      credits: 100,
      features: ['100 credits per month', 'Basic AI features', 'Community support'],
      priceId: '',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 29,
      credits: 1000,
      features: ['1000 credits per month', 'Advanced AI features', 'Priority support', 'Early access to new features'],
      priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99,
      credits: 5000,
      features: ['5000 credits per month', 'All AI features', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
      priceId: import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || '',
    },
  ];

  useEffect(() => {
    loadSubscriptionData();
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status, subscription_current_period_end')
        .eq('id', user.id)
        .single();

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

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (!user || !tier.priceId) return;

    setLoading(true);
    try {
      const { url, error } = await stripeService.createSubscriptionCheckoutSession(
        tier.priceId,
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

  const handleManageSubscription = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { url, error } = await stripeService.createCustomerPortalSession();

      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: 'Error',
        description: 'Failed to open subscription management. Please try again.',
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
        <Card className="bg-white/80 backdrop-blur-sm border-white/20 shadow-lg rounded-2xl">
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
                <p className="text-sm text-muted-foreground">
                  Status: <Badge variant={subscriptionStatus === 'active' ? 'default' : 'secondary'}>{subscriptionStatus}</Badge>
                </p>
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
            className={`bg-white/80 backdrop-blur-sm border-white/20 shadow-lg rounded-2xl ${
              tier.id === currentTier ? 'ring-2 ring-primary' : ''
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {tier.name}
                {tier.id === currentTier && <Badge>Current</Badge>}
              </CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold">${tier.price}</span>
                {tier.price > 0 && <span className="text-muted-foreground">/month</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-semibold text-primary">{tier.credits} credits/month</p>
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
                  Subscribe to {tier.name}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

