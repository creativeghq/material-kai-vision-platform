import { escapeHtml } from './html.js';

const SITE_NAME = 'MaterialsHub Knowledge Base';
const SEO_BLOCK = /<!--SEO-->[\s\S]*?<!--\/SEO-->/;

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

async function rest(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function fetchArticle(env, slug) {
  return rest(
    env,
    `kb_docs?slug=eq.${encodeURIComponent(slug)}` +
      `&status=eq.published&visibility=eq.public` +
      `&select=id,title,slug,summary,content,content_markdown,seo_keywords,metadata,created_at,updated_at,view_count,category_id` +
      `&limit=1`,
  );
}

async function fetchCategoryName(env, categoryId) {
  if (!categoryId) return null;
  try {
    const row = await rest(env, `kb_categories?id=eq.${encodeURIComponent(categoryId)}&select=name&limit=1`);
    return row?.name || null;
  } catch {
    return null;
  }
}

function buildHead({ doc, categoryName, origin }) {
  const canonical = `${origin}/knowledge-base/${doc.slug || doc.id}`;
  const seoTitle = (doc.metadata && doc.metadata.seo_title) || doc.title;
  const fullTitle = `${seoTitle} | ${SITE_NAME}`;
  const description = doc.summary || plainText(doc.content_markdown || doc.content, 155);
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

function html(body, status, shell) {
  const headers = new Headers(shell.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(body, { status, headers });
}

export async function kbPrerender(request, url, slug, env) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
  if (!shell.ok) return env.ASSETS.fetch(request);
  const template = await shell.text();

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return html(template, 200, shell);

  let doc = null;
  try {
    doc = await fetchArticle(env, slug);
  } catch {
    doc = null;
  }

  if (!doc) {
    const noindex = template.replace(
      SEO_BLOCK,
      '<!--SEO-->\n    <title>Article not found | ' + SITE_NAME + '</title>\n    <meta name="robots" content="noindex" />\n    <!--/SEO-->',
    );
    return html(noindex, 404, shell);
  }

  const categoryName = await fetchCategoryName(env, doc.category_id);
  const headHtml = buildHead({ doc, categoryName, origin: url.origin });
  return html(template.replace(SEO_BLOCK, `<!--SEO-->\n    ${headHtml}\n    <!--/SEO-->`), 200, shell);
}
