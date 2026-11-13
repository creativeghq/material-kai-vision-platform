import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

const APPROVAL_TABS = new Set(['registrations', 'access', 'resellers', 'marketplace', 'supplier-claims', 'freight-quotes']);

/** `/admin/operations?tab=…` is stored in old notifications; each tab is now its own HQ page. */
const TAB_TARGETS: Record<string, string> = {
  'system-health': '/admin/system-health',
  'search-analytics': '/admin/search',
  'services-billing': '/admin/billing',
  'platform-overview': '/admin/platform',
  'factory-onboarding': '/admin/approvals',
  catalog: '/admin/ingestion-quality',
  catalogs: '/admin/ingestion-quality',
  push: '/push-notifications',
  'agent-chat': '/admin/agents',
  'seo-toolkit': '/admin/agents',
  'data-processing': '/admin/async-queue-monitor',
  performance: '/admin/async-queue-monitor',
  modules: '/admin/modules?tab=subscribers',
  keys: '/admin/modules?tab=platform-keys',
};

const OperationsRedirect: React.FC = () => {
  const [params] = useSearchParams();
  const tab = params.get('tab') ?? '';
  let to = TAB_TARGETS[tab] ?? '/admin/system-health';
  if (tab === 'factory-onboarding') {
    const sub = params.get('sub') ?? (params.get('section') === 'marketplace' ? 'marketplace' : '');
    if (APPROVAL_TABS.has(sub)) to = `/admin/approvals?tab=${sub}`;
  }
  return <Navigate to={to} replace />;
};

export default OperationsRedirect;
