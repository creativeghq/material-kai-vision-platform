import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Check, ExternalLink, Loader2, Key, Plus, X, Eye, EyeOff, Copy, Shield, Trash2, Lock, Megaphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { StripeService } from '@/services/stripe.service';
import { apiGatewayService, type ApiKey } from '@/services/apiGateway/apiGatewayService';
import { ChangelogList } from './ChangelogList';
import { ApplyForRoleCard } from './ApplyForRoleCard';

const stripeService = new StripeService();

export const SubscriptionTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const changelogSlug = searchParams.get('changelog');
  // When the bell deep-links us with ?changelog=<slug>, default to the
  // Changes Log sub-tab so the entry is visible without an extra click.
  const [devTab, setDevTab] = useState<'api-keys' | 'changelog'>(
    changelogSlug ? 'changelog' : 'api-keys',
  );
  const [loading, setLoading] = useState(false);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);

  const tiers = stripeService.getSubscriptionTiers();
  const hasSubscription = currentTier !== 'free';

  useEffect(() => {
    loadSubscriptionData();
  }, [user]);

  useEffect(() => {
    if (user && hasSubscription) loadApiKeys();
  }, [user, hasSubscription]);

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

  const loadApiKeys = async () => {
    if (!user) return;
    setApiKeysLoading(true);
    try {
      const keys = await apiGatewayService.getUserApiKeys(user.id);
      setApiKeys(keys);
    } catch (err) {
      const detail = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`Failed to load API keys: ${detail}`);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (!user || !newKeyName.trim()) return;
    setGeneratingKey(true);
    try {
      const key = await apiGatewayService.generateApiKey(user.id, newKeyName.trim());
      setApiKeys((prev) => [key, ...prev]);
      setNewKeyName('');
      setShowNewKeyForm(false);
      setRevealedKeyId(key.id);
      toast({ title: 'API Key Created', description: 'Copy it now — it won\'t be shown in full again.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate API key.', variant: 'destructive' });
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    try {
      await apiGatewayService.revokeApiKey(id);
      setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, is_active: false } : k));
      toast({ title: 'Key Revoked', description: 'The API key has been deactivated.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to revoke key.', variant: 'destructive' });
    }
  };

  const copyApiKey = (key: ApiKey) => {
    navigator.clipboard.writeText(key.api_key);
    setCopiedKeyId(key.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const maskKey = (k: string) => k.length <= 8 ? k : k.slice(0, 4) + '••••••••••••••••' + k.slice(-4);

  const testApiKey = async (key: ApiKey) => {
    setTestingKeyId(key.id);
    setTestResult(null);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('api_key', key.api_key)
        .eq('is_active', true)
        .maybeSingle();
      const ok = !error && !!data;
      setTestResult({ id: key.id, ok });
      toast({
        title: ok ? 'Key Verified' : 'Key Invalid',
        description: ok ? 'Your API key is active and valid.' : 'This key could not be verified.',
        variant: ok ? 'default' : 'destructive',
      });
      setTimeout(() => setTestResult(null), 5000);
    } catch {
      setTestResult({ id: key.id, ok: false });
      toast({ title: 'Test Failed', description: 'Could not verify the API key.', variant: 'destructive' });
    } finally {
      setTestingKeyId(null);
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
              <Crown className="h-4 w-4 text-primary" />
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

      {/* Apply for Dealer / Factory — sits above the plan grid */}
      <ApplyForRoleCard />

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

      {/* Developer Resources — API Keys + Changes Log nested tabs */}
      <Tabs
        value={devTab}
        onValueChange={(v) => {
          setDevTab(v as 'api-keys' | 'changelog');
          // When the user navigates AWAY from the Changes Log tab clear the
          // deep-link param so a refresh doesn't keep snapping them back.
          if (v !== 'changelog' && changelogSlug) {
            const next = new URLSearchParams(searchParams);
            next.delete('changelog');
            setSearchParams(next, { replace: true });
          }
        }}
        className="space-y-4"
      >
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="changelog" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Changes Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="mt-0">
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Key className="h-4 w-4 text-primary" />API Keys</CardTitle>
            {hasSubscription && (
              <Button size="sm" variant="outline" onClick={() => setShowNewKeyForm((v) => !v)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Generate Key
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasSubscription ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/30">
              <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Subscription Required to Generate API Key</p>
                <p className="text-xs text-muted-foreground">Subscribe to a Pro or Enterprise plan above to unlock API access.</p>
              </div>
            </div>
          ) : (
            <>
              {showNewKeyForm && (
                <div className="flex gap-2 pb-2">
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), generateApiKey())}
                    placeholder="Key name (e.g. My App, Testing…)"
                    className="flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={generateApiKey} disabled={!newKeyName.trim() || generatingKey}>
                    {generatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewKeyForm(false); setNewKeyName(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {apiKeysLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeys.length > 0 ? (
                <div className="space-y-2">
                  {apiKeys.map((key) => (
                    <div key={key.id} className={`flex items-center justify-between p-3 rounded-xl border ${key.is_active ? 'bg-muted/30' : 'bg-destructive/5 border-destructive/20 opacity-70'}`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Shield className={`h-4 w-4 shrink-0 ${key.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{key.key_name}</p>
                            {key.is_active ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-700 border-green-500/30">Active</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Revoked</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">
                            {key.is_active
                              ? (revealedKeyId === key.id ? key.api_key : maskKey(key.api_key))
                              : '— revoked —'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Created {new Date(key.created_at).toLocaleDateString()}
                            {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                            {key.expires_at && ` · Expires ${new Date(key.expires_at).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      {key.is_active && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setRevealedKeyId(revealedKeyId === key.id ? null : key.id)}>
                            {revealedKeyId === key.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => copyApiKey(key)}>
                            {copiedKeyId === key.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-8 p-0 text-xs gap-1 ${testResult?.id === key.id ? (testResult.ok ? 'text-green-600' : 'text-destructive') : ''}`}
                            onClick={() => testApiKey(key)}
                            disabled={testingKeyId === key.id}
                          >
                            {testingKeyId === key.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : testResult?.id === key.id ? (
                              testResult.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />
                            ) : (
                              <Shield className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">Test</span>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => revokeApiKey(key.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No API keys yet. Generate one to access the Material KAI API.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="changelog" className="mt-0">
          <ChangelogList highlightSlug={changelogSlug} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

