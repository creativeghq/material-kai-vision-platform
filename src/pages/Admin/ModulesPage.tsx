import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Package, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { registeredModules, useEnabledModules, refreshModuleRegistry } from '@/modules/_core';
import { invalidateInvoiceProviderCache } from '@/modules/payments/services/invoiceProviderService';
import { MIVAA_API_URL } from '@/config/mivaa';

async function invalidateMivaaCache(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  try {
    await fetch(`${MIVAA_API_URL}/api/v1/modules/_invalidate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort: backend will pick up the change within 5 minutes via TTL.
  }
}

const TIER_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  free: 'secondary',
  pro: 'default',
  enterprise: 'outline',
};

const ModulesPage: React.FC = () => {
  const { toast } = useToast();
  const { rows, isLoading } = useEnabledModules();
  const [updating, setUpdating] = useState<string | null>(null);

  const enabledMap = useMemo(
    () => new Map(rows.map((row) => [row.slug, row.enabled])),
    [rows],
  );

  const registeredSlugs = useMemo(
    () => new Set(registeredModules.map((m) => m.manifest.slug)),
    [],
  );

  const orphanedRows = rows.filter((row) => !registeredSlugs.has(row.slug));

  const handleToggle = async (slug: string, next: boolean) => {
    setUpdating(slug);
    const { error } = await supabase
      .from('modules')
      .update({ enabled: next })
      .eq('slug', slug);

    if (error) {
      toast({
        title: 'Could not update module',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      // Drop the invoice-provider cache so any visible IssueInvoiceButton /
      // the ERP provider button re-resolves on the next render (otherwise the
      // 30s TTL keeps the old provider visible after toggling an ERP module).
      invalidateInvoiceProviderCache();
      await Promise.all([refreshModuleRegistry(), invalidateMivaaCache()]);
      toast({
        title: next ? 'Module enabled' : 'Module disabled',
        description: slug,
      });
    }
    setUpdating(null);
  };

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Modules"
        subtitle="Enable or disable platform features. Toggles take effect immediately for all users."
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/admin">
              <Home className="h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        }
      />

      <div className="p-3 sm:p-6 space-y-6">
        {orphanedRows.length > 0 && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <CardTitle className="text-base">Unregistered modules in database</CardTitle>
                  <CardDescription>
                    {orphanedRows.length} module row{orphanedRows.length === 1 ? '' : 's'} in the database
                    {' '}have no matching folder under <code>src/modules/</code>:
                    {' '}
                    {orphanedRows.map((r) => r.slug).join(', ')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {registeredModules.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No modules registered. Drop a folder under <code>src/modules/&lt;slug&gt;/</code> with
                {' '}<code>manifest.json</code> and <code>index.ts</code> to add one.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {registeredModules.map(({ manifest, routes }) => {
            const isRegistered = enabledMap.has(manifest.slug);
            const enabled = enabledMap.get(manifest.slug) ?? false;
            const primaryRoute = routes[0]?.path;

            return (
              <Card key={manifest.slug} className="dashboard-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{manifest.name}</CardTitle>
                    </div>
                    <Badge variant={TIER_VARIANT[manifest.priceTier] ?? 'secondary'}>
                      {manifest.priceTier}
                    </Badge>
                  </div>
                  <CardDescription>{manifest.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {isRegistered ? (enabled ? 'Enabled' : 'Disabled') : 'Not in DB'}
                      </span>
                      <Switch
                        checked={enabled}
                        disabled={!isRegistered || updating === manifest.slug}
                        onCheckedChange={(next) => handleToggle(manifest.slug, next)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {enabled && (
                        <Button asChild size="sm" variant="ghost" className="gap-1" title="Module settings (API keys)">
                          <Link to={`/admin/modules/${manifest.slug}/settings`}>
                            <KeyRound className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                      {enabled && primaryRoute && (
                        <Button asChild size="sm" variant="outline" className="gap-1">
                          <Link to={primaryRoute}>
                            Open
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">{manifest.category}</span>
                    <span>·</span>
                    <span>v{manifest.version}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ModulesPage;
