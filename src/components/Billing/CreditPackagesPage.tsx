import React, { useState, useEffect } from 'react';
import { Coins, Loader2, Sparkles, Zap, Rocket } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { billingService, CreditPackage, UserCredits } from '@/services/billing.service';

export const CreditPackagesPage: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [processingPackageId, setProcessingPackageId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [packagesData, creditsData] = await Promise.all([
        billingService.getCreditPackages(),
        billingService.getUserCredits().catch(() => null),
      ]);
      setPackages(packagesData);
      setUserCredits(creditsData);
    } catch (error) {
      console.error('Error loading credit packages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load credit packages',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageId: string) => {
    try {
      setProcessingPackageId(packageId);
      const { url } = await billingService.purchaseCredits(packageId);

      if (url) {
        window.location.href = url;
      } else {
        toast({
          title: 'Info',
          description: 'Stripe integration is not yet configured',
        });
      }
    } catch (error) {
      console.error('Error purchasing credits:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to purchase credits',
        variant: 'destructive',
      });
    } finally {
      setProcessingPackageId(null);
    }
  };

  const formatPrice = (priceInCents: number, currency: string) => {
    const price = priceInCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(price);
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat('en-US').format(credits);
  };

  const getPackageIcon = (index: number) => {
    const icons = [Sparkles, Zap, Rocket];
    return icons[index % icons.length];
  };

  const calculateValuePerCredit = (priceInCents: number, credits: number) => {
    const pricePerCredit = priceInCents / credits / 100;
    return pricePerCredit.toFixed(4);
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
            <Coins className="h-10 w-10" />
            Credit Packages
          </h1>
          <p className="text-white/60 text-lg">
            Purchase credits to use AI features
          </p>
        </div>

        {/* Current Balance */}
        {userCredits && (
          <Card className="bg-purple-600/20 border-purple-500/30 mb-6 max-w-md mx-auto">
            <CardContent className="py-6">
              <div className="text-center">
                <p className="text-white/80 text-sm mb-2">Current Balance</p>
                <div className="text-5xl font-bold text-white flex items-center justify-center gap-2">
                  <Coins className="h-10 w-10 text-yellow-400" />
                  {formatCredits(userCredits.balance)}
                </div>
                <p className="text-white/60 text-sm mt-2">credits available</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Packages Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg, index) => {
          const Icon = getPackageIcon(index);
          const isProcessing = processingPackageId === pkg.id;
          const valuePerCredit = calculateValuePerCredit(pkg.price_in_cents, pkg.credits);

          return (
            <Card
              key={pkg.id}
              className="bg-white/10 border-white/20 hover:bg-white/15 transition-all"
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-8 w-8 text-yellow-400" />
                  {index === packages.length - 1 && (
                    <Badge className="bg-green-600 text-white">Best Value</Badge>
                  )}
                </div>
                <CardTitle className="text-white text-2xl">{pkg.name}</CardTitle>
                <CardDescription className="text-white/60">
                  {formatCredits(pkg.credits)} credits
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Price */}
                <div className="text-center py-4">
                  <div className="text-4xl font-bold text-white">
                    {formatPrice(pkg.price_in_cents, pkg.currency)}
                  </div>
                  <p className="text-white/60 text-sm mt-1">
                    ${valuePerCredit} per credit
                  </p>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-white/80 text-sm">
                    <span>AI Image Analysis</span>
                    <span className="font-semibold">{Math.floor(pkg.credits / 10)} uses</span>
                  </div>
                  <div className="flex items-center justify-between text-white/80 text-sm">
                    <span>PDF Processing</span>
                    <span className="font-semibold">{Math.floor(pkg.credits / 50)} documents</span>
                  </div>
                  <div className="flex items-center justify-between text-white/80 text-sm">
                    <span>AI Search Queries</span>
                    <span className="font-semibold">{Math.floor(pkg.credits / 5)} queries</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={isProcessing}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Coins className="h-4 w-4 mr-2" />
                      Purchase Now
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {packages.length === 0 && (
        <div className="max-w-2xl mx-auto">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Coins className="h-16 w-16 text-white/40 mb-4" />
              <p className="text-white/60 text-lg">No credit packages available</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

