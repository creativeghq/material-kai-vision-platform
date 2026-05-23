import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { SecretsManagerCard } from './SecretsManagerCard';
import { registeredModules } from '@/modules/_core';

/**
 * Generic Settings page mounted at /admin/modules/<slug>/settings for every module that has
 * declared secrets in platform_secrets (primary_module_slug or via platform_secret_module_links).
 *
 * One component, used by every module. Avoids bespoke Settings pages per module — instead each
 * module's index.ts registers a route that renders <ModuleSettingsPage />, and the module slug is
 * resolved from the URL.
 */
const ModuleSettingsPage: React.FC = () => {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Resolve module from registry (for the human-readable name + back-link target).
  const slug = paramSlug ?? '';
  const mod = registeredModules.find(m => m.manifest.slug === slug);

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title={`${mod?.manifest.name ?? slug} — Settings`}
        subtitle="API keys and credentials for this module. Environment variables take priority over values stored here."
        actions={
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4">
        <SecretsManagerCard
          scope={{ mode: 'module', moduleSlug: slug }}
          title={`${mod?.manifest.name ?? slug} API credentials`}
          description="These secrets are used by the module's edge functions. Environment vars on the function set in deployment always win; values here are the fallback an admin can edit without a redeploy."
        />
        <div className="text-xs text-muted-foreground">
          Platform-wide keys (AI providers, Stripe, VAPID, cron secret) are managed at{' '}
          <Link to="/admin/operations?tab=keys" className="text-primary underline">/admin/operations → Keys</Link>.
        </div>
      </div>
    </div>
  );
};

export default ModuleSettingsPage;
