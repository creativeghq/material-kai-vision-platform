import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { ROUTE_LIST } from './routeList.mjs';

// Declared once: route-load asserts each PAINTS, content-audit asserts it is USABLE.
export const ROUTES: string[] = ROUTE_LIST;

export const ROUTES_TO_RUN: string[] = (() => {
  const file = process.env.SMOKE_ROUTES_FILE;
  if (!file || !existsSync(file)) return ROUTES;
  const picked = new Set<string>(JSON.parse(readFileSync(file, 'utf8')).routes);
  return ROUTES.filter((r) => picked.has(r));
})();

export async function recordRouteAssets(page: Page, route: string): Promise<void> {
  const dir = process.env.SMOKE_RECORD_DIR;
  if (!dir) return;
  const assets = await page.evaluate(() => {
    const urls = [
      ...performance.getEntriesByType('resource').map((e) => e.name),
      ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map((s) => s.src),
      ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')).map((l) => l.href),
    ];
    const names = urls
      .map((u) => /\/assets\/([^/?#]+\.js)(?:[?#]|$)/.exec(u)?.[1])
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)].sort();
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${encodeURIComponent(route)}.json`), JSON.stringify({ route, assets }));
}
