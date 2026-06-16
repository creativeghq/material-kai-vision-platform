import type { ModuleDefinition } from './ModuleDefinition';

const moduleLoaders = import.meta.glob<{ default: ModuleDefinition }>(
  '../*/index.ts',
  { eager: true },
);

const registry: Record<string, ModuleDefinition> = {};

for (const path in moduleLoaders) {
  // Vite's `*` wildcard matches every sibling folder including `_core` (this
  // file's own folder). `_core` is the registry itself, not a module — skip
  // silently rather than emitting a "missing manifest" warning every page load.
  if (path.includes('/_core/')) continue;

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
