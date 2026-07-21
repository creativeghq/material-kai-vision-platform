/**
 * Dynamic sitemap for the platform's PUBLIC surfaces.
 * Served at /sitemap.xml (see vercel.json rewrite).
 *
 * Lists, in order: static entry points → KB categories → KB articles →
 * company job boards → individual job postings.
 *
 * Data comes from the `public_sitemap_entries()` RPC rather than direct table reads.
 * Reason: this function runs with the ANON key, and while public KB docs are
 * anon-readable, OPEN JOB POSTINGS ARE NOT (hr_job_postings only has a
 * workspace-membership SELECT policy). A direct anon read therefore returned zero
 * job rows, so the job pages — which already emit JobPosting JSON-LD — could never
 * be listed. The RPC returns only the URL projection and re-implements the same
 * visibility rules (published+public+public-category for KB; open and not past
 * closes_at for jobs).
 *
 * Deliberately NOT listed: token share links (/q, /cv, /sign, /i, /sheets/share) —
 * private single-purpose URLs that must never be advertised to crawlers.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${proto}://${host}`;

  // Static public entry points, then everything dynamic from the RPC.
  const urls = [
    { loc: `${origin}/knowledge-base`, priority: '0.8' },
    { loc: `${origin}/tools`, priority: '0.6' },
    { loc: `${origin}/documentation/`, priority: '0.5' },
  ];

  // Priority per kind; also fixes the emission order so the XML reads
  // categories → articles → boards → postings.
  const KIND_ORDER = ['kb_category', 'kb_doc', 'careers_board', 'careers_job'];
  const KIND_PRIORITY = {
    kb_category: '0.7',
    kb_doc: '0.6',
    careers_board: '0.7',
    careers_job: '0.8', // job pages carry JobPosting JSON-LD — the most valuable to index
  };

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_sitemap_entries`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (r.ok) {
        const rows = (await r.json()) || [];
        rows.sort(
          (a, b) =>
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            String(a.path).localeCompare(String(b.path)),
        );
        for (const row of rows) {
          if (!row || !row.path) continue;
          // `path` is built server-side from slugs/ids; encode each segment but keep
          // the "/" separators and the "?cat=" query intact.
          const [pathname, query] = String(row.path).split('?');
          const safePath = pathname.split('/').map(encodeURIComponent).join('/');
          urls.push({
            loc: `${origin}${safePath}${query ? `?${query}` : ''}`,
            lastmod: row.lastmod ? new Date(row.lastmod).toISOString() : undefined,
            priority: KIND_PRIORITY[row.kind] || '0.5',
          });
        }
      }
    } catch {
      /* fall through with the static entry points */
    }
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          '  <url>\n' +
          `    <loc>${xmlEscape(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${xmlEscape(u.lastmod)}</lastmod>\n` : '') +
          `    <priority>${u.priority}</priority>\n` +
          '  </url>',
      )
      .join('\n') +
    '\n</urlset>\n';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  return res.end(body);
}
