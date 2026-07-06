export type {
  ModuleDefinition,
  ModuleManifest,
  ModuleNavItem,
  ModuleRoute,
  ModuleRow,
} from './ModuleDefinition';

export { registeredModules, getModule } from './registry';

export {
  useEnabledModules,
  useModule,
  refreshModuleRegistry,
} from './useEnabledModules';

export { buildModuleRoutes } from './ModuleRoutes';

export {
  attachModuleSubscribers,
  detachModuleSubscribers,
  syncSubscribersToEnabledSet,
} from './subscribers';

export type { ModuleSubscriber, ModuleHeaderAction, ModuleSettingsPanel } from './ModuleDefinition';

export {
  useAdminDashboardCards,
  type AdminDashboardCard,
} from './useAdminDashboardCards';

export { ModuleHeaderActions } from './ModuleHeaderActions';

export {
  useWorkspaceModuleNav,
  type WorkspaceModuleNavEntry,
} from './useWorkspaceModuleNav';
