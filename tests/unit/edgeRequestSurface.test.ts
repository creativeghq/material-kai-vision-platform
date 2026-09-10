/** Edge-request surface guard. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/** Source lines with `//`, `/* *​/` and JSDoc-continuation lines removed. */
function codeLines(file: string): string[] {
  const raw = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const line of raw) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    out.push(line);
  }
  return out;
}

describe('manualChunks pins nothing optional into the eager payload', () => {
  // Packages whose every byte would land on first paint if pinned, and which no
  // eagerly-reachable module imports. Each has a paid-for incident behind it.
  const NEVER_PIN = [
    // Audit #308, then again 2026-08-09. All 7 importers are lazy admin/analytics routes.
    'recharts',
    // Pinning defeats main.tsx's post-paint dynamic import of the tracing/replay
    // integrations — the chunk measured byte-identical before and after the defer.
    '@sentry/react',
  ];

  const config = codeLines('vite.config.ts');

  for (const pkg of NEVER_PIN) {
    it(`does not map '${pkg}' to a manual chunk`, () => {
      const offenders = config
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => new RegExp(`^['"]${pkg.replace('/', '\\/')}['"]\\s*:`).test(line));

      expect(
        offenders,
        `'${pkg}' is pinned into a manual chunk, which makes it a static import of the entry ` +
          `and ships it to every anonymous visitor on first paint. It is lazily reachable only — ` +
          `leave it unmapped and let Rollup split it by actual use.`,
      ).toEqual([]);
    });
  }

  it('keeps the pins that every visitor genuinely needs', () => {
    // Sanity check on the detector itself: react IS correctly pinned, so a passing
    // suite above cannot be an artefact of the regex silently matching nothing.
    const joined = config.join('\n');
    expect(joined).toMatch(/^\s*'react':\s*'vendor-react',/m);
    expect(joined).toMatch(/^\s*'@supabase\/supabase-js':\s*'vendor-supabase',/m);
  });
});

describe('the SPA catch-all serves real routes and 404s the scanner surface', () => {
  const vercelConfig = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
    rewrites: Array<{ source: string; destination: string }>;
  };

  const spa = vercelConfig.rewrites.find((r) => r.destination === '/index.html');
  const re = new RegExp('^' + spa!.source + '$');

  it('has a catch-all rewrite to the app shell', () => {
    expect(spa, 'vercel.json lost its SPA rewrite — every client-side route would 404').toBeDefined();
  });

  // Every one of these is a real client-side route. A miss here is a 404 shown to a
  // real customer, which is strictly worse than any amount of scanner traffic.
  const REAL_ROUTES = [
    '/', '/home', '/admin', '/admin/finance', '/admin/crm', '/auth', '/agent-hub',
    '/knowledge-base', '/knowledge-base/some-article', '/search', '/projects',
    '/moodboard/abc-123', '/p/product-slug', '/q/quote-token', '/c/xyz', '/u/handle',
    '/i/invite-code', '/brands/acme', '/careers', '/privacy-policy', '/terms-of-service',
    '/supplier-portal', '/finance', '/crm', '/settings', '/profile', '/store', '/pos',
    '/tools', '/analytics', '/room-planner', '/trip-expenses', '/my-hr', '/sheets/token',
    '/market-trends', '/search-hub', '/products/marble-tile-60x60',
    // The /:slug/clockin route — ANY first segment is legitimate here, which is why
    // enumerating known top-level routes into this regex would have been wrong.
    '/some-workspace/clockin',
  ];

  for (const path of REAL_ROUTES) {
    it(`serves the app shell for ${path}`, () => {
      expect(re.test(path), `${path} is a real route but would now return 404`).toBe(true);
    });
  }

  // Paths no client-side route can ever produce. Each answered 200 with the full
  // app shell until 2026-08-10.
  const SCANNER_PATHS = [
    '/wp-login.php', '/wp-admin', '/wp-admin/setup-config.php', '/wp-content/uploads/x.php',
    '/wp-includes/x', '/wp-json/wp/v2/users', '/xmlrpc.php',
    '/.env', '/.env.local', '/.env.production', '/.git/config', '/.aws/credentials',
    '/.ssh/id_rsa', '/.DS_Store', '/.vscode/settings.json', '/foo/.git/config',
    '/phpmyadmin', '/phpmyadmin/index.php', '/cgi-bin/test.cgi', '/actuator/health',
    '/server-status', '/index.php', '/admin.php', '/shell.php', '/eval-stdin.php',
    '/backup.sql', '/db.zip', '/site.tar.gz', '/backup.bak', '/index.jsp', '/default.aspx',
  ];

  for (const path of SCANNER_PATHS) {
    it(`404s ${path}`, () => {
      expect(re.test(path), `${path} would return 200 + the app shell instead of a 404`).toBe(false);
    });
  }

  it('never blocks /.well-known — ACME challenges and security.txt live there', () => {
    expect(re.test('/.well-known/acme-challenge/token')).toBe(true);
    expect(re.test('/.well-known/security.txt')).toBe(true);
  });
});
