// Docs module (#254) — per-workspace internal documentation, searchable by the KAI agent via
// Postgres FTS (no embeddings). Surfaces in the App Launcher (location:'workspace'), NOT the top nav.
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { BookText } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const DocsPage = lazy(() => import('./pages/DocsPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/docs', component: DocsPage },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/docs',
      icon: BookText,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
