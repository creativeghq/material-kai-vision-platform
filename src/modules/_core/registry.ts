import type { ModuleDefinition } from './ModuleDefinition';

const moduleLoaders = import.meta.glob<{ default: ModuleDefinition }>(
  '../*/index.ts',
  { eager: true },
);

const registry: Record<string, ModuleDefinition> = {};

for (const path in moduleLoaders) {
  // Vite's `*` wildcard matches every sibling folder including `_core` (this file's own folder).
  // Note the glob key for `_core`'s own index normalizes to `./index.ts` (NOT `../_core/index.ts`),
  // so a `path.includes('/_core/')` check misses it. Instead: a file with no default export isn't a
  // module definition at all (the `_core` barrel, any future helper index) — skip it SILENTLY. Only
  // a file that DOES export a default but lacks manifest.slug is a real misconfiguration worth a warn.
  const mod = moduleLoaders[path].default;
  if (!mod) continue;
  if (!mod.manifest?.slug) {
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
