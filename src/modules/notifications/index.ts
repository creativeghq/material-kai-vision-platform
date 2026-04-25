import { lazy } from 'react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const NotificationsPanel = lazy(() =>
  import('./components/NotificationsPanel').then(m => ({ default: m.NotificationsPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
  headerActions: [{ id: 'bell', component: NotificationsPanel }],
};

export default definition;
