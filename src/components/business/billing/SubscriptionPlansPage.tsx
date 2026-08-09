import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Loader2, Crown, Zap, Star } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { billingService, SubscriptionPlan, UserSubscription } from '@/services/billing.service';
import { supabase } from '@/integrations/supabase/client';
import { tierRank } from '@/services/planAdminService';
import { formatMoney } from '@/utils/decimal';

export const SubscriptionPlansPage: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [modules, setModules] = useState<{ name: string; price_tier: string | null; enabled: boolean }[]>([]);

  // Modules a plan unlocks = every enabled module whose tier is at/below the plan's tier.
  const modulesForPlan = (planName: string): string[] => {
    const planRank = tierRank(planName.toLowerCase());
    return modules.filter((m) => m.enabled && tierRank(m.price_tier) <= planRank).map((m) => m.name).sort();
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, subscriptionData, modulesRes] = await Promise.all([
        billingService.getSubscriptionPlans(),
        billingService.getUserSubscription().catch(() => null),
        supabase.from('modules').select('name, price_tier, enabled').then((r) => r.data ?? []),
      ]);
      setPlans(plansData);
      setCurrentSubscription(subscriptionData);
      setModules(modulesRes as { name: string; price_tier: string | null; enabled: boolean }[]);
    } catch (error) {
      console.error('Error loading subscription data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load subscription plans',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      setProcessingPlanId(planId);
      const { url } = await billingService.createSubscriptionCheckout(planId);

      if (url) {
        window.location.href = url;
      } else {
        toast({
          title: 'Info',
          description: 'Stripe integration is not yet configured',
        });
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout',
        variant: 'destructive',
      });
    } finally {
      setProcessingPlanId(null);
    }
  };

  const formatPrice = (priceInCents: number, currency: string) => {
    const price = priceInCents / 100;
    return formatMoney(price, currency.toUpperCase());
  };

  const getPlanIcon = (index: number) => {
    const icons = [Zap, Star, Crown];
    return icons[index % icons.length];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-3 flex items-center justify-center gap-3">
            <CreditCard className="h-10 w-10" />
            Subscription Plans
          </h1>
          <p className="text-white/60 text-lg">
            Choose the perfect plan for your needs
          </p>
        </div>

        {/* Current Subscription Banner */}
        {currentSubscription && (
          <Card className="bg-purple-600/20 border-purple-500/30 mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Current Plan</p>
                  <p className="text-white text-lg font-semibold">
                    {currentSubscription.subscription_plans?.name || 'Unknown Plan'}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    currentSubscription.status === 'active'
                      ? 'bg-green-600/20 text-green-300'
                      : 'bg-yellow-600/20 text-yellow-300'
                  }
                >
                  {currentSubscription.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Plans Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan, index) => {
          const Icon = getPlanIcon(index);
          const isCurrentPlan = currentSubscription?.plan_id === plan.id;
          const isProcessing = processingPlanId === plan.id;

          return (
            <Card
              key={plan.id}
              className={`bg-white/10 border-white/20 hover:bg-white/15 transition-all ${
                isCurrentPlan ? 'ring-2 ring-purple-500' : ''
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-8 w-8 text-purple-400" />
                  {isCurrentPlan && (
                    <Badge className="bg-purple-600 text-white">Current</Badge>
                  )}
                </div>
                <CardTitle className="text-white text-2xl">{plan.name}</CardTitle>
                <CardDescription className="text-white/60">
                  {plan.description || 'Premium features and benefits'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Price */}
                <div className="text-center py-4">
                  <div className="text-4xl font-bold text-white">
                    {formatPrice(plan.price_in_cents, plan.currency)}
                  </div>
                  <p className="text-white/60 text-sm mt-1">per month</p>
                </div>

                {/* Features */}
                {plan.features && (
                  <div className="space-y-2">
                    {Object.entries(plan.features).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-white/80 text-sm">
                          {typeof value === 'boolean' && value
                            ? key.replace(/_/g, ' ')
                            : `${key.replace(/_/g, ' ')}: ${value === -1 ? 'unlimited' : value}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Included modules — which features this plan unlocks. */}
                {modulesForPlan(plan.name).length > 0 && (
                  <div className="border-t border-white/10 pt-3">
                    <p className="text-white/50 text-xs uppercase tracking-wide mb-1.5">Includes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {modulesForPlan(plan.name).map((name) => (
                        <span key={name} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter>
                <Button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrentPlan || isProcessing}
                  className={`w-full ${
                    isCurrentPlan
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700'
                  } text-white`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : (
                    'Subscribe Now'
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {plans.length === 0 && (
        <div className="max-w-2xl mx-auto">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-16 w-16 text-white/40 mb-4" />
              <p className="text-white/60 text-lg">No subscription plans available</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

