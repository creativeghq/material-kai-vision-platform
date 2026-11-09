import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildRecord } from './routeSelection.mjs';
import { ROUTE_LIST } from '../../tests/e2e/routeList.mjs';

const [chunkPath, assetsDir, prevPath, outPath] = process.argv.slice(2);
const read = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const chunkModules = read(chunkPath) ?? {};
const routeAssets = {};
if (existsSync(assetsDir)) {
  for (const f of readdirSync(assetsDir)) {
    const { route, assets } = JSON.parse(readFileSync(join(assetsDir, f), 'utf8'));
    routeAssets[route] = assets;
  }
}
const next = buildRecord({ routes: ROUTE_LIST, prev: read(prevPath), chunkModules, routeAssets });

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(next));
const missing = ROUTE_LIST.filter((r) => !next[r]);
console.log(`recorded ${Object.keys(next).length}/${ROUTE_LIST.length} routes` +
  (missing.length ? ` — no record (will run next time): ${missing.join(', ')}` : ''));
