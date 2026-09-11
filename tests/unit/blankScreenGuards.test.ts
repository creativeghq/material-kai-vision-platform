/**
 * Nothing above the route <Suspense> may render nothing.
 *
 * Structural, not behavioural: this repo has no jsdom/testing-library, so these assert the
 * SHAPE that produced a black screen rather than rendering the tree. Each case was watched to
 * fail against the code as it stood before the fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel: string) => blankComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Every guard that sits ABOVE the route <Suspense>, so nothing else carries the wait. */
const GUARDS = [
  'src/components/core/AuthGuard.tsx',
  'src/components/core/AdminGuard.tsx',
  'src/components/core/WorkspaceAdminGuard.tsx',
  'src/components/core/CapabilityGuard.tsx',
];

describe('a screen that is waiting says so', () => {
  it.each(GUARDS)('%s never renders bare null', (file) => {
    const src = code(file);
    // `return null` here is a whole blank SCREEN: these render before any layout exists, so
    // there is no surrounding chrome to show that anything is happening.
    expect(src).not.toMatch(/return\s+null\s*;/);
  });

  it.each(GUARDS)('%s shows the shared loader instead', (file) => {
    expect(code(file)).toContain('PageLoader');
  });

  it('WorkspaceContext cannot strand `loading` on a rejected query', () => {
    const src = code('src/contexts/WorkspaceContext.tsx');
    // One `loading` flag feeds AdminGuard, WorkspaceAdminGuard and CapabilityGuard, so a throw
    // that skips `setLoading(false)` blanks the whole app. The call site is what must fail soft:
    // guarding one await inside `load` leaves the next one to reintroduce it.
    expect(src).toMatch(/load\(\)\s*\.catch\(/);
    const caught = src.slice(src.indexOf('load().catch('));
    expect(caught.slice(0, 300)).toContain('setLoading(false)');
  });
});

describe('the boot watchdog', () => {
  const html = code('index.html');

  it('can see an app that mounted and rendered nothing', () => {
    expect(html).toContain('BLANK_TIMEOUT_MS');
    // Booted-and-empty is the case both earlier fixes were blind to.
    expect(html).toMatch(/if \(!window\.__mkBooted\) return;/);
    expect(html).toMatch(/innerText/);
  });

  it('does NOT purge on a render fault — that would log people out for nothing', () => {
    const at = html.indexOf('BLANK_TIMEOUT_MS');
    const blankBlock = html.slice(at, html.indexOf('var waitedMs', at));
    expect(blankBlock).toContain('panel(');
    expect(blankBlock).not.toContain('purge(');
    expect(blankBlock).not.toContain('location.reload');
  });

  it('#root is parsed before any inline script, or a truncated document loses it', () => {
    const body = html.slice(html.indexOf('<body>'));
    const rootAt = body.indexOf('<div id="root"');
    expect(rootAt).toBeGreaterThan(-1);
    // The entry module is deferred, so it runs against whatever the parser built. A phone that
    // loses signal mid-response delivers the head but not a #root sitting 200 lines down, and
    // main.tsx then throws `Root element not found` with no panel to explain it.
    expect(rootAt).toBeLessThan(body.indexOf('<script'));
  });

  it('draws its panel even when #root never arrived', () => {
    const at = html.indexOf('function panel(');
    const block = html.slice(at, at + 700);
    // Bailing on a missing #root silenced the watchdog in exactly the case that most needed it.
    expect(block).toMatch(/host\.id = 'root'/);
    expect(block).toMatch(/document\.body\.appendChild\(host\)/);
  });

  it('reads the purge token back before reloading, or a blocked write loops forever', () => {
    const at = html.indexOf('function pushedPurge');
    const block = html.slice(at, at + 900);
    expect(block).toContain('persisted');
    expect(block).toMatch(/persisted\s*=\s*localStorage\.getItem\(PURGE_KEY\) === PURGE_TOKEN/);
    expect(block).toMatch(/if \(persisted\) location\.reload\(\)/);
  });
});

describe('the diagnostics page tells the truth', () => {
  const diag = code('public/diag.html');

  it('gives the entry bundle the #root it requires before running it', () => {
    // Without this the app entry throws `Root element not found` the moment the probe injects
    // it, so the page reported a hard failure on EVERY device — including a healthy one, which
    // is the opposite of what a diagnostic is for.
    // The ELEMENT, not the string: the probe already mentions `id="root"` in the JS that scans
    // the app HTML, so matching the bare text passes against the very file this fixes.
    const rootAt = diag.indexOf('<div id="root"');
    expect(rootAt).toBeGreaterThan(-1);
    expect(rootAt).toBeLessThan(diag.indexOf("s.type = 'module'"));
  });

  it('reports whether the app RENDERED, not just whether the bundle parsed', () => {
    // Mounted-and-blank is the failure being hunted; a parse check cannot see it.
    expect(diag).toContain('__mkBooted');
    expect(diag).toMatch(/innerText/);
  });

  it('distinguishes a signed-in device, because signed-out never runs those reads', () => {
    expect(diag).toMatch(/sb-.*-auth-token/);
  });
});
