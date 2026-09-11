/**
 * The deploy must check the site a VISITOR loads, not a candidate URL it holds a key to.
 *
 * On 2026-09-11 `fe-smoke` reported green through two separate total outages of
 * app.materialshub.gr — a firewall challenge answering every request 403, and a pruned
 * deployment orphaning a static vendor chunk — because it probes the unaliased *.vercel.app
 * candidate with VERCEL_AUTOMATION_BYPASS_SECRET, and that bypass skips the firewall.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const probe = blankComments(read('scripts/probe-live-frontend.mjs'));
const workflow = read('.github/workflows/deploy.yml');

describe('the live-domain probe', () => {
  it('is wired into the deploy, against the real hostname', () => {
    // `node scripts/…` appears only in the run command — the surrounding YAML comment does not
    // contain it, so this cannot be satisfied by prose.
    expect(workflow).toContain('node scripts/probe-live-frontend.mjs');
    expect(workflow).toContain('https://app.materialshub.gr');
  });

  it('carries NO bypass secret — that is what blinded fe-smoke', () => {
    const at = workflow.indexOf('node scripts/probe-live-frontend.mjs');
    const step = workflow.slice(Math.max(0, at - 1200), at + 200);
    expect(step).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(probe).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
  });

  it('fails on an edge challenge, which is a 403 wearing a 200-shaped page', () => {
    expect(probe).toContain('x-vercel-mitigated');
  });

  it('checks every asset the document references, not just the document', () => {
    // A 200 on index.html is not a working site: the entry bundle imports the vendor chunks
    // STATICALLY, so one 404 among them is a blank screen behind a healthy-looking document.
    expect(probe).toContain('doc.body.match(');
    expect(probe).toContain('for (const asset of assets)');
    expect(probe).toContain('js|css');
  });

  it('requests the PLAIN url as well as a cache-busted one', () => {
    // The plain url is the one the module graph asks for, and a poisoned edge cache entry shows
    // up on nothing else; the cache-busted twin is what tells the two apart.
    const at = probe.indexOf('for (const asset of assets)');
    const loop = probe.slice(at, at + 1200);
    expect(loop).toContain('await get(url)');
    expect(loop).toContain('await get(bust(url))');
  });

  it('exits non-zero when it finds a problem, or CI learns nothing', () => {
    expect(probe).toContain('process.exit(1)');
    expect(probe).toContain('process.exit(0)');
  });
});
