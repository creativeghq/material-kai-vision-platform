/**
 * Dynamic sitemap for the public Knowledge Base.
 * Served at /sitemap.xml (see vercel.json rewrite). Lists the KB landing plus
 * every published + public article by its slug URL, with lastmod = updated_at.
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

  const urls = [{ loc: `${origin}/knowledge-base`, priority: '0.8' }];

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/kb_docs?status=eq.published&visibility=eq.public&select=slug,id,updated_at&order=updated_at.desc&limit=5000`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
      );
      if (r.ok) {
        const rows = await r.json();
        for (const row of rows || []) {
          const slug = row.slug || row.id;
          if (!slug) continue;
          urls.push({
            loc: `${origin}/knowledge-base/${encodeURIComponent(slug)}`,
            lastmod: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
            priority: '0.6',
          });
        }
      }
    } catch {
      /* fall through with just the landing URL */
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
