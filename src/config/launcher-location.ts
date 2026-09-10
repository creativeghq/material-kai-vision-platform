/** Which launcher app OWNS a URL. */
export interface LocatableApp {
  id: string;
  path: string;
}

export function matchAppForLocation<T extends LocatableApp>(
  apps: readonly T[],
  pathname: string,
  search: string,
): T | null {
  const here = new URLSearchParams(search);
  let best: { app: T; score: number } | null = null;
  for (const app of apps) {
    const [appPath, appQuery = ''] = app.path.split('?');
    if (!appPath) continue;
    const pathMatches = appPath === '/'
      ? pathname === '/'
      : pathname === appPath || pathname.startsWith(`${appPath}/`);
    if (!pathMatches) continue;
    // A pathname is never longer than a few dozen characters and an app never names more than a
    // handful of parameters, so weighting the path by 100 keeps the two axes from ever crossing.
    let score = appPath.length * 100;
    let ok = true;
    [...new URLSearchParams(appQuery)].forEach(([k, v], i) => {
      const got = here.get(k);
      if (got === v) { score += 1; return; }
      if (i === 0 || got !== null) ok = false;
    });
    if (!ok) continue;
    if (!best || score > best.score) best = { app, score };
  }
  return best?.app ?? null;
}
