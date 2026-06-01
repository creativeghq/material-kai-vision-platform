import React, { Suspense, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Settings as SettingsIcon, Loader2, ExternalLink, Package } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/core/ui/tabs';
import { SecretsManagerCard } from './SecretsManagerCard';
import { registeredModules } from '@/modules/_core';

/**
 * Generic Settings page mounted at /admin/modules/<slug>/settings for every module.
 *
 * Always renders a "Keys" tab (SecretsManagerCard for the module's API credentials).
 * Modules that declare `settingsPanels` in their ModuleDefinition get an additional
 * tab per panel — that's how feature-level settings (PDF templates, default sender,
 * billing defaults, etc.) surface here instead of living on hidden routes.
 *
 * Deep-linkable: `?tab=<panel-id>` selects the panel on load.
 */
const ModuleSettingsPage: React.FC = () => {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const slug = paramSlug ?? '';
  const mod = registeredModules.find(m => m.manifest.slug === slug);
  const panels = mod?.settingsPanels ?? [];

  // Some modules have a richer dedicated page (e.g. /admin/modules/oxygen,
  // /admin/modules/myaade) that complements the secrets/settings tabs here.
  // Surface it as a header action so admins landing on the generic settings
  // page don't miss the fuller feature surface. Match convention: any route
  // exactly at /admin/modules/<slug> (no trailing path segments).
  const dedicatedPagePath = mod?.routes.find(r => r.path === `/admin/modules/${slug}`)?.path;

  // Tab state: 'keys' is always first. Panels follow. `?tab=` selects on mount.
  const initialTab = searchParams.get('tab') || 'keys';
  const validTab = initialTab === 'keys' || panels.some(p => p.id === initialTab) ? initialTab : 'keys';
  const [tab, setTab] = useState<string>(validTab);

  const handleTabChange = (next: string) => {
    setTab(next);
    // Mirror selection to URL so deep links + browser back work.
    const params = new URLSearchParams(searchParams);
    if (next === 'keys') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title={`${mod?.manifest.name ?? slug} — Settings`}
        subtitle={
          panels.length > 0
            ? 'API credentials and feature-level configuration for this module.'
            : 'API keys and credentials for this module. Environment variables take priority over values stored here.'
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/admin/modules">
                <Package className="h-4 w-4" /> All Modules
              </Link>
            </Button>
            {dedicatedPagePath && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to={dedicatedPagePath}>
                  Full {mod?.manifest.name} page
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </>
        }
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-4">
        {panels.length === 0 ? (
          // Backwards-compat path: modules that haven't declared panels render
          // the original single-card layout untouched.
          <>
            <SecretsManagerCard
              scope={{ mode: 'module', moduleSlug: slug }}
              title={`${mod?.manifest.name ?? slug} API credentials`}
              description="These secrets are used by the module's edge functions. Environment vars on the function set in deployment always win; values here are the fallback an admin can edit without a redeploy."
            />
            <div className="text-xs text-muted-foreground">
              Platform-wide keys (AI providers, Stripe, VAPID, cron secret) are managed at{' '}
              <Link to="/admin/operations?tab=keys" className="text-primary underline">/admin/operations → Keys</Link>.
            </div>
          </>
        ) : (
          <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger
                value="keys"
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Keys
              </TabsTrigger>
              {panels.map(p => {
                const Icon = p.icon;
                return (
                  <TabsTrigger
                    key={p.id}
                    value={p.id}
                    className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {p.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="keys">
              <SecretsManagerCard
                scope={{ mode: 'module', moduleSlug: slug }}
                title={`${mod?.manifest.name ?? slug} API credentials`}
                description="These secrets are used by the module's edge functions. Environment vars on the function set in deployment always win; values here are the fallback an admin can edit without a redeploy."
              />
              <div className="text-xs text-muted-foreground mt-3">
                Platform-wide keys (AI providers, Stripe, VAPID, cron secret) are managed at{' '}
                <Link to="/admin/operations?tab=keys" className="text-primary underline">/admin/operations → Keys</Link>.
              </div>
            </TabsContent>

            {panels.map(p => {
              const Panel = p.component;
              return (
                <TabsContent key={p.id} value={p.id}>
                  <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                    <Panel embedded />
                  </Suspense>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default ModuleSettingsPage;
