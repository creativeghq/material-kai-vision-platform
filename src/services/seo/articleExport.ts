export const ARTICLE_EXPORT_SCHEMA = 'materialshub.seo-article.v1';

export interface ExportableArticle {
  id: string;
  title: string | null;
  slug: string | null;
  target_keyword: string;
  secondary_keywords?: string[] | null;
  content_type?: string | null;
  markdown_content: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  language_code?: string | null;
  location_code?: number | null;
  site_url?: string | null;
  published_url?: string | null;
  published_at?: string | null;
  word_count?: number | null;
  reading_time_minutes?: number | null;
  seo_score?: number | string | null;
  overall_score?: number | null;
  readability_score?: number | string | null;
  schema_markup?: unknown;
  faq_schema?: { question: string; answer: string }[] | null;
  content_brief?: { provenance?: Record<string, unknown> | null } | null;
  credits_used?: number | null;
  credits_by_stage?: Record<string, number> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ArticleExport {
  schema: typeof ARTICLE_EXPORT_SCHEMA;
  exported_at: string;
  article_id: string;
  language: string | null;
  market_location_code: number | null;
  title: string;
  slug: string | null;
  url_suggestion: string | null;
  published_url: string | null;
  meta: { title: string; description: string | null };
  open_graph: { title: string; description: string | null; image: string | null; type: 'article'; locale: string | null };
  target_keyword: string;
  secondary_keywords: string[];
  content_type: string | null;
  excerpt: string | null;
  content: { markdown: string; html: string | null; word_count: number | null; reading_time_minutes: number | null };
  outline: { level: number; text: string }[];
  faq: { question: string; answer: string }[];
  images: { src: string; alt: string }[];
  links: { internal: { anchor: string; url: string }[]; external: { anchor: string; url: string }[] };
  schema_jsonld: unknown;
  author: Record<string, unknown> | null;
  scores: { seo: number | null; readability: number | null };
  cost: { credits_used: number | null; credits_by_stage: Record<string, number> | null };
  created_at: string | null;
  updated_at: string | null;
}

const LOCALES: Record<string, string> = { el: 'el_GR', en: 'en_US', de: 'de_DE', fr: 'fr_FR', it: 'it_IT', es: 'es_ES' };

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function firstParagraph(markdown: string): string | null {
  for (const block of markdown.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || /^(#|>|[-*+] |\d+\. |!\[|---|\|)/.test(t)) continue;
    return t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  }
  return null;
}

export function buildArticleExport(
  article: ExportableArticle,
  { html = null, now = new Date() }: { html?: string | null; now?: Date } = {},
): ArticleExport {
  const markdown = article.markdown_content ?? '';
  const h1 = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  const title = article.title || h1 || article.target_keyword;
  const siteHost = article.site_url ? hostOf(article.site_url) : null;

  const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ alt: m[1], src: m[2] }));
  const internal: { anchor: string; url: string }[] = [];
  const external: { anchor: string; url: string }[] = [];
  for (const m of markdown.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    const link = { anchor: m[1], url: m[2] };
    if (/^\[?(INTERNAL|SOURCE):/i.test(m[1])) continue;
    const host = hostOf(m[2]);
    if (!host || (siteHost && host === siteHost)) internal.push(link);
    else external.push(link);
  }

  const origin = article.site_url ? article.site_url.replace(/\/+$/, '') : null;
  const urlSuggestion = article.published_url
    || (article.slug ? `${origin ?? ''}/${article.slug}` : null);
  const metaTitle = article.meta_title || title;

  return {
    schema: ARTICLE_EXPORT_SCHEMA,
    exported_at: now.toISOString(),
    article_id: article.id,
    language: article.language_code ?? null,
    market_location_code: num(article.location_code),
    title,
    slug: article.slug,
    url_suggestion: urlSuggestion,
    published_url: article.published_url ?? null,
    meta: { title: metaTitle, description: article.meta_description ?? null },
    open_graph: {
      title: metaTitle,
      description: article.meta_description ?? null,
      image: images[0]?.src ?? null,
      type: 'article',
      locale: article.language_code ? LOCALES[article.language_code] ?? null : null,
    },
    target_keyword: article.target_keyword,
    secondary_keywords: article.secondary_keywords ?? [],
    content_type: article.content_type ?? null,
    excerpt: article.meta_description || firstParagraph(markdown.replace(/^#\s+.+$/m, '')),
    content: {
      markdown,
      html,
      word_count: num(article.word_count),
      reading_time_minutes: num(article.reading_time_minutes),
    },
    outline: [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() })),
    faq: (article.faq_schema ?? []).filter((f) => f?.question),
    images,
    links: { internal, external },
    schema_jsonld: article.schema_markup ?? null,
    author: (article.content_brief?.provenance as Record<string, unknown> | null | undefined) ?? null,
    scores: { seo: num(article.seo_score ?? article.overall_score), readability: num(article.readability_score) },
    cost: { credits_used: num(article.credits_used), credits_by_stage: article.credits_by_stage ?? null },
    created_at: article.created_at ?? null,
    updated_at: article.updated_at ?? null,
  };
}

export function articleExportFilename(article: Pick<ExportableArticle, 'id' | 'slug'>): string {
  return `${(article.slug || article.id).replace(/[^a-z0-9-]+/gi, '-')}.json`;
}
