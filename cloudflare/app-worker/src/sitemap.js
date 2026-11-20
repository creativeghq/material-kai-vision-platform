function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const KIND_ORDER = ['kb_category', 'kb_doc', 'careers_board', 'careers_job'];
const KIND_PRIORITY = {
  kb_category: '0.7',
  kb_doc: '0.6',
  careers_board: '0.7',
  careers_job: '0.8',
};

export async function sitemap(url, env) {
  const origin = url.origin;
  const urls = [
    { loc: `${origin}/knowledge-base`, priority: '0.8' },
    { loc: `${origin}/tools`, priority: '0.6' },
    { loc: `${origin}/documentation/`, priority: '0.5' },
  ];

  const supabaseUrl = env.SUPABASE_URL || '';
  const anonKey = env.SUPABASE_ANON_KEY || '';
  if (supabaseUrl && anonKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/public_sitemap_entries`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
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
      return render(urls);
    }
  }
  return render(urls);
}

function render(urls) {
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

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
