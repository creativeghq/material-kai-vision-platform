/**
 * Request-time SEO prerender for public Knowledge Base articles.
 *
 * Vercel rewrites `/knowledge-base/:slug` here (see vercel.json). We fetch the
 * article from Supabase, take the SPA's static index.html, and replace the
 * <!--SEO-->…<!--/SEO--> block in its <head> with the article's real title,
 * description, canonical, OpenGraph/Twitter tags, and schema.org JSON-LD.
 *
 * The same index.html is returned, so the React SPA still boots and renders the
 * article normally for humans — but non-JS scrapers (social unfurlers, crawlers)
 * now see correct, per-article metadata in the initial HTML. Always fresh (read
 * at request time), no cloaking (every visitor gets the same response).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SITE_NAME = 'MaterialsHub Knowledge Base';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Safe JSON-LD: prevent a "</script>" inside the data from closing the tag.
function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function plainText(md, max) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_\[\]]/g, ' ')
    .replace(/\!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function fetchArticle(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/kb_docs` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&status=eq.published&visibility=eq.public` +
    `&select=id,title,slug,summary,content,content_markdown,seo_keywords,metadata,created_at,updated_at,view_count,category_id` +
    `&limit=1`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function fetchCategoryName(categoryId) {
  if (!categoryId) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/kb_categories?id=eq.${encodeURIComponent(categoryId)}&select=name&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.name || null;
  } catch {
    return null;
  }
}

function buildHead({ doc, categoryName, origin }) {
  const canonical = `${origin}/knowledge-base/${doc.slug || doc.id}`;
  const seoTitle = (doc.metadata && doc.metadata.seo_title) || doc.title;
  const fullTitle = `${seoTitle} | ${SITE_NAME}`;
  const description =
    doc.summary || plainText(doc.content_markdown || doc.content, 155);
  const image = `${origin}/mh-logo.png`;
  const keywords = Array.isArray(doc.seo_keywords) ? doc.seo_keywords.join(', ') : '';

  const faq = Array.isArray(doc.metadata && doc.metadata.faq) ? doc.metadata.faq : [];
  const faqClean = faq
    .map((f) => ({ q: String((f && (f.question || f.q)) || '').trim(), a: String((f && (f.answer || f.a)) || '').trim() }))
    .filter((f) => f.q && f.a);

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: doc.title,
      description,
      datePublished: doc.created_at,
      dateModified: doc.updated_at,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      author: { '@type': 'Organization', name: 'MaterialsHub' },
      publisher: { '@type': 'Organization', name: 'MaterialsHub' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Knowledge Base', item: `${origin}/knowledge-base` },
        ...(categoryName ? [{ '@type': 'ListItem', position: 2, name: categoryName }] : []),
        { '@type': 'ListItem', position: categoryName ? 3 : 2, name: doc.title, item: canonical },
      ],
    },
  ];
  if (faqClean.length > 0) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqClean.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : '',
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    jsonLd.map(jsonLdScript).join(''),
  ]
    .filter(Boolean)
    .join('\n    ');
}

export default async function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${proto}://${host}`;

  // slug comes from the vercel.json rewrite (?slug=:slug); fall back to the path.
  let slug = (req.query && req.query.slug) || '';
  if (!slug) {
    const m = (req.url || '').match(/\/knowledge-base\/([^/?#]+)/);
    slug = m ? decodeURIComponent(m[1]) : '';
  }

  // Always start from the live SPA shell so we never drift from the real build.
  let template = '';
  try {
    const tplRes = await fetch(`${origin}/index.html`, { headers: { 'x-kb-prerender': '1' } });
    template = await tplRes.text();
  } catch {
    // If we can't load the shell, bounce to the SPA route so the user still gets the app.
    res.setHeader('Location', `/knowledge-base/${encodeURIComponent(slug)}`);
    res.statusCode = 302;
    return res.end();
  }

  const sendHtml = (html, status) => {
    res.statusCode = status || 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Short shared cache so scrapers get fast responses but edits propagate quickly.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.end(html);
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return sendHtml(template, 200); // env missing → serve SPA unmodified
  }

  let doc = null;
  try {
    doc = await fetchArticle(slug);
  } catch {
    doc = null;
  }

  if (!doc) {
    // Unknown/unpublished slug → tell crawlers not to index, let the SPA show its 404.
    const noindex = template.replace(
      /<!--SEO-->[\s\S]*?<!--\/SEO-->/,
      '<!--SEO-->\n    <title>Article not found | ' + SITE_NAME + '</title>\n    <meta name="robots" content="noindex" />\n    <!--/SEO-->',
    );
    return sendHtml(noindex, 404);
  }

  const categoryName = await fetchCategoryName(doc.category_id);
  const headHtml = buildHead({ doc, categoryName, origin });
  const html = template.replace(
    /<!--SEO-->[\s\S]*?<!--\/SEO-->/,
    `<!--SEO-->\n    ${headHtml}\n    <!--/SEO-->`,
  );
  return sendHtml(html, 200);
}
