/**
 * PriceAlertPreferences — module-gated alert opt-in card.
 *
 * Renders only when the `price-monitoring-notifications` module is enabled.
 * Lets the user toggle the three alert types (price drop / new retailer /
 * promo started) and pick which channels deliver them (bell / email /
 * webhook). Each channel has its own credit cost surfaced inline.
 *
 * Used inside ProductMonitorTab (per catalog product). The same shape can
 * be reused on the external-API tracked-queries detail page in a future
 * PR — the columns are mirrored on both tables.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Mail, Webhook, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const CHANNEL_COSTS: Record<string, number> = {
  bell: 0,
  email: 1,
  webhook: 0,
};

interface Prefs {
  alert_on_price_drop: boolean;
  alert_on_new_retailer: boolean;
  alert_on_promo: boolean;
  alert_channels: string[];
}

interface PriceAlertPreferencesProps {
  productId: string;
}

export const PriceAlertPreferences: React.FC<PriceAlertPreferencesProps> = ({ productId }) => {
  const { toast } = useToast();
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  // Module gate — read once on mount. The module table is small (8 rows
  // today) so a SELECT-by-slug is cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('modules')
        .select('enabled')
        .eq('slug', 'price-monitoring-notifications')
        .maybeSingle();
      if (!cancelled) setModuleEnabled(Boolean(data?.enabled));
    })();
    return () => { cancelled = true; };
  }, []);

  // Pull current preferences for this product.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('price_monitoring_products')
        .select('alert_on_price_drop, alert_on_new_retailer, alert_on_promo, alert_channels')
        .eq('product_id', productId)
        .maybeSingle();
      if (cancelled) return;
      setPrefs({
        alert_on_price_drop: data?.alert_on_price_drop ?? true,
        alert_on_new_retailer: data?.alert_on_new_retailer ?? true,
        alert_on_promo: data?.alert_on_promo ?? true,
        alert_channels: (data?.alert_channels as string[]) ?? ['bell'],
      });
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const updatePrefs = async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('price_monitoring_products')
        .update(patch)
        .eq('product_id', productId);
      if (error) throw error;
    } catch (e) {
      toast({ title: 'Failed to save preferences', description: String(e), variant: 'destructive' });
      // Roll back so the UI doesn't lie about saved state.
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: string) => {
    if (!prefs) return;
    const has = prefs.alert_channels.includes(channel);
    const next = has
      ? prefs.alert_channels.filter(c => c !== channel)
      : [...prefs.alert_channels, channel];
    // Always keep at least bell — a configured product with zero channels
    // means no notifications will ever fire, which is rarely intended.
    if (next.length === 0) next.push('bell');
    updatePrefs({ alert_channels: next });
  };

  const channelInfo = useMemo(() => ([
    { id: 'bell', label: 'In-app bell', icon: BellRing },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'webhook', label: 'Webhook', icon: Webhook },
  ]), []);

  if (moduleEnabled === null || prefs === null) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex items-center justify-center min-h-[80px]">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!moduleEnabled) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Price Monitoring Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription className="text-sm">
              The Price Monitoring Notifications module is currently disabled. An admin can enable
              it from <code>/admin/modules</code> to surface alert preferences here.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-primary" />
            Notifications
          </CardTitle>
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert types */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Price drop</p>
              <p className="text-xs text-muted-foreground">Median price drops ≥10% week-over-week</p>
            </div>
            <Switch
              checked={prefs.alert_on_price_drop}
              onCheckedChange={(checked) => updatePrefs({ alert_on_price_drop: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">New retailer</p>
              <p className="text-xs text-muted-foreground">A domain we've never tracked appears in discovery</p>
            </div>
            <Switch
              checked={prefs.alert_on_new_retailer}
              onCheckedChange={(checked) => updatePrefs({ alert_on_new_retailer: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Promo started</p>
              <p className="text-xs text-muted-foreground">Retailer starts displaying a was/now price</p>
            </div>
            <Switch
              checked={prefs.alert_on_promo}
              onCheckedChange={(checked) => updatePrefs({ alert_on_promo: checked })}
            />
          </div>
        </div>

        {/* Channels */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery channels</p>
          <div className="flex flex-col gap-2">
            {channelInfo.map(({ id, label, icon: Icon }) => {
              const checked = prefs.alert_channels.includes(id);
              const cost = CHANNEL_COSTS[id] ?? 0;
              return (
                <div key={id} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {cost === 0 ? 'Free' : `${cost} credit${cost > 1 ? 's' : ''} per alert`}
                      </p>
                    </div>
                  </div>
                  <Switch checked={checked} onCheckedChange={() => toggleChannel(id)} />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anomaly alerts (unusual price readings) always go to the bell, regardless of channel selection.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
