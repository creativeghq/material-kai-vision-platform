/**
 * Which launcher app OWNS a URL.
 *
 * The mobile Apps panel opens on the section list of the app you are already in: tap Apps while
 * on /finance?tab=ar and the panel is Finance's — Receivables, Payables, Bank feed — one tap from
 * where you stand, with Back leading up to the hub and then the root. That is only right if the
 * match is exact about what an app's path says.
 *
 * An app path is a pathname plus, sometimes, query parameters. The FIRST parameter is part of the
 * app's identity: Deals is `/crm?tab=pipeline` and CRM is `/crm`; six agent apps share `/agent-hub`
 * and differ only in `?capability=`. Any parameter after it is configuration the page may drop as
 * you move around inside the app — Image Studio opens on `…&generation_mode=image-edit`, and its
 * own quick-start links carry `capability` without it. So a candidate matches when its pathname is
 * a path-segment prefix of the location's, its first parameter is present with the same value, and
 * no later parameter is present with a DIFFERENT value. Among the matches, the most specific wins —
 * longest pathname, then most parameters agreeing — which is what puts Deals ahead of CRM on the
 * pipeline tab and CRM ahead of Deals everywhere else in CRM.
 *
 * Nothing matches bare `/agent-hub`: the capability apps all name a parameter it lacks, and the
 * Agent Hub itself is a top-bar surface, not a launcher app. Returning null there is the point —
 * the panel starts at the root rather than guessing.
 */
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
