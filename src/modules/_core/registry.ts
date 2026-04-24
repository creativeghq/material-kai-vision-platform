import type { ModuleDefinition } from './ModuleDefinition';

const moduleLoaders = import.meta.glob<{ default: ModuleDefinition }>(
  '../*/index.ts',
  { eager: true }
);

const registry: Record<string, ModuleDefinition> = {};

for (const path in moduleLoaders) {
  const mod = moduleLoaders[path].default;
  if (!mod || !mod.manifest?.slug) {
    console.warn(`[modules/registry] skipped ${path}: missing manifest.slug`);
    continue;
  }
  if (registry[mod.manifest.slug]) {
    console.warn(`[modules/registry] duplicate slug "${mod.manifest.slug}" at ${path}`);
    continue;
  }
  registry[mod.manifest.slug] = mod;
}

export const registeredModules: ReadonlyArray<ModuleDefinition> = Object.values(registry);

export function getModule(slug: string): ModuleDefinition | undefined {
  return registry[slug];
}
