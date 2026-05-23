import { lazy } from 'react';
import { FolderKanban } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const ProjectsListPage = lazy(() =>
  import('./pages/ProjectsListPage').then(m => ({ default: m.ProjectsListPage })),
);
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/projects', component: ProjectsListPage },
    { path: '/projects/:id', component: ProjectDetailPage },
  ],
  navItems: [
    {
      label: 'Projects',
      path: '/projects',
      icon: FolderKanban,
      location: 'admin-dashboard',
      adminCategory: 'Studio',
      adminDescription: 'Container above moodboards and quotes — rooms, budget vs actual, task checklists.',
      adminCount: 'Workspace',
    },
  ],
};

export default definition;
