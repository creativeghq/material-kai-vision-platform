import { lazy } from 'react';
import { Megaphone } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MentionMonitoringDashboard = lazy(() =>
  import('@/components/business/mention-monitoring/MentionMonitoringDashboard'),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/mention-monitoring',
      component: MentionMonitoringDashboard as any,
      requireAdmin: true,
    },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/mention-monitoring',
      icon: Megaphone,
      location: 'admin-dashboard',
      adminCategory: 'Modules',
      adminDescription: manifest.description,
      adminCount: manifest.priceTier.toUpperCase(),
    },
  ],
};

export default definition;
