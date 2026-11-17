import React from 'react';
import { Helmet } from 'react-helmet-async';

export interface SeoHeadProps {
  /** Page <title>. The site name is appended automatically. */
  title: string;
  description?: string;
  /** Canonical absolute or root-relative URL for this page. */
  canonicalPath?: string;
  keywords?: string[];
  /** og:type — 'website' for the landing, 'article' for a single doc. */
  type?: 'website' | 'article';
  image?: string;
  /** schema.org JSON-LD object(s) injected as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** When true, ask crawlers not to index (e.g. private/preview). */
  noIndex?: boolean;
}

const SITE_NAME = 'MaterialsHub Knowledge Base';
const SITE_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://app.materialshub.gr';

function absUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Per-page SEO head: unique title, meta description, canonical, OpenGraph /
 * Twitter cards, and schema.org JSON-LD. Client-rendered (Helmet) — read by
 * Google (executes JS); full coverage for non-JS scrapers would need
 * prerendering/SSR for these routes.
 */
export const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  canonicalPath,
  keywords,
  type = 'website',
  image,
  jsonLd,
  noIndex,
}) => {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonical = absUrl(canonicalPath);
  const ogImage = absUrl(image);
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {keywords && keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* OpenGraph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {ogImage && <meta property="og:image" content={ogImage} />}

      {/* Twitter */}
      <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {blocks.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
};
