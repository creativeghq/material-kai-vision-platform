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

export type { ModuleSubscriber } from './ModuleDefinition';

export {
  useAdminDashboardCards,
  type AdminDashboardCard,
} from './useAdminDashboardCards';
