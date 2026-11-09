export const GLOBAL_PATTERNS = [
  /^index\.html$/,
  /^package(-lock)?\.json$/,
  /^vite\.config\./,
  /^tsconfig[^/]*\.json$/,
  /^(tailwind|postcss)\.config\./,
  /^vercel\.json$/,
  /^playwright\.config\./,
  /^tests\/e2e\//,
  /^scripts\/smoke\/routeSelection\.mjs$/,
  /^\.github\/content-audit-baseline\.json$/,
  /^public\/(sw\.js|site\.webmanifest)$/,
];

export const ALWAYS = ['/', '/auth'];

export function selectRoutes({ routes, changed, record, forceAll = false }) {
  if (forceAll) return { all: true, routes, reason: 'forced' };
  if (!changed) return { all: true, routes, reason: 'no deployed baseline to diff against' };
  if (!record) return { all: true, routes, reason: 'no route→module record for the deployed build' };
  const global = changed.find((f) => GLOBAL_PATTERNS.some((re) => re.test(f)));
  if (global) return { all: true, routes, reason: `global file changed: ${global}` };

  const touched = new Set(changed);
  const picked = routes.filter((r) => {
    if (ALWAYS.includes(r)) return true;
    const mods = record[r];
    if (!mods || mods.length === 0) return true;
    return mods.some((m) => touched.has(m));
  });
  return { all: picked.length === routes.length, routes: picked, reason: `${changed.length} changed file(s)` };
}

export function buildRecord({ routes, prev, chunkModules, routeAssets }) {
  const next = {};
  for (const route of routes) {
    const assets = routeAssets[route];
    if (assets && assets.length > 0) {
      const mods = new Set();
      let known = 0;
      for (const a of assets) {
        const m = chunkModules[a];
        if (!m) continue;
        known++;
        for (const x of m) mods.add(x);
      }
      if (known > 0) next[route] = [...mods].sort();
    } else if (prev && prev[route]) {
      next[route] = prev[route];
    }
  }
  return next;
}
