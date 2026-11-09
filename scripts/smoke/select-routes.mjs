import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { selectRoutes } from './routeSelection.mjs';
import { ROUTE_LIST } from '../../tests/e2e/routeList.mjs';

const [base = '', recordPath, outPath] = process.argv.slice(2);

let changed = null;
if (base) {
  try {
    changed = execFileSync('git', ['diff', '--name-only', '--no-renames', base, 'HEAD'], { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.warn(`git diff ${base}..HEAD failed (${e.message}) — running every route`);
  }
}
const record = recordPath && existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
const sel = selectRoutes({ routes: ROUTE_LIST, changed, record, forceAll: process.env.FE_SMOKE_ALL === '1' });

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ routes: sel.routes }));
const line = `fe-smoke: ${sel.routes.length}/${ROUTE_LIST.length} routes (${sel.all ? 'all' : 'scoped'}: ${sel.reason})`;
console.log(line);
for (const r of sel.routes) console.log(`  ${r}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**${line}**\n`);
