import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const ProjectsListPage = lazy(() =>
  import('./pages/ProjectsListPage').then(m => ({ default: m.ProjectsListPage })),
);
const MyTasksPage = lazy(() =>
  import('./pages/MyTasksPage').then(m => ({ default: m.MyTasksPage })),
);
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/projects', component: ProjectsListPage },
    { path: '/projects/my-tasks', component: MyTasksPage },
    { path: '/projects/:id', component: ProjectDetailPage },
  ],
  navItems: [],
};

export default definition;
