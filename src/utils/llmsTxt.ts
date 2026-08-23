/**
 * Build an `llms.txt` for a connected website from its crawled pages (#349 C2).
 *
 * WHAT THIS IS FOR. `llms.txt` is a file a site serves at its own root that tells an
 * answer engine which parts of it are worth reading and what they are. The platform
 * serves a hand-written one for itself; a tenant's has to be DERIVED, because they have
 * hundreds of pages and no appetite for maintaining a second copy of their own sitemap.
 *
 * WHY IT IS A PURE FUNCTION. It produces a document a customer will paste onto their own
 * domain under their own name. That makes it worth testing over hand-built inputs rather
 * than only over whatever the crawler happened to return — and it means the same text is
 * produced for preview, copy and download, instead of three near-copies that drift.
 *
 * WHAT IT WILL NOT DO. It never invents a description. A page whose crawl found no
 * description is listed with its title alone; writing a plausible summary for a page we
 * have not read is exactly the fabrication an `llms.txt` exists to prevent, and it would
 * be published under the customer's name, not ours.
 */

export interface LlmsTxtPage {
  url: string;
  title: string | null;
  description: string | null;
  http_status?: number | null;
  is_active?: boolean | null;
}

export interface LlmsTxtInput {
  /** The site's own name, as the customer would write it. */
  siteName: string;
  /** Homepage URL. Used for the heading link and to derive relative sections. */
  siteUrl: string;
  /** One sentence under the heading. Omitted entirely when absent — never invented. */
  summary?: string | null;
  pages: LlmsTxtPage[];
  /** Cap per section, so a 400-page blog does not drown the rest of the site. */
  maxPerSection?: number;
}

/** Section a URL belongs to: its first path segment, or the root. */
function sectionOf(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return '';
    return path.split('/')[0].toLowerCase();
  } catch {
    return '';
  }
}

/** `product-guides` → `Product Guides`. The customer's own URL vocabulary, tidied. */
function sectionTitle(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Markdown link text cannot contain an unescaped `]`, and a newline breaks the list. */
function inline(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')').trim();
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const maxPerSection = input.maxPerSection ?? 40;

  // A page that 404s or has fallen out of the sitemap must not be advertised: the whole
  // value of this file is that an agent can trust every link in it.
  const usable = input.pages.filter(
    (p) => p.url
      && p.is_active !== false
      && (p.http_status == null || (p.http_status >= 200 && p.http_status < 300)),
  );

  const bySection = new Map<string, LlmsTxtPage[]>();
  for (const page of usable) {
    const key = sectionOf(page.url);
    const list = bySection.get(key);
    if (list) list.push(page);
    else bySection.set(key, [page]);
  }

  const lines: string[] = [`# ${inline(input.siteName)}`];
  if (input.summary && input.summary.trim()) {
    lines.push('', `> ${inline(input.summary)}`);
  }

  const renderPage = (p: LlmsTxtPage): string => {
    const label = inline(p.title || p.url);
    const desc = p.description && p.description.trim()
      ? `: ${inline(p.description)}`
      : ''; // no description crawled — say nothing rather than guess
    return `- [${label}](${p.url})${desc}`;
  };

  // Root-level pages first: they are the site's front door, and an agent reading top-down
  // should meet them before a blog archive.
  const root = bySection.get('') || [];
  if (root.length) {
    lines.push('', '## Main pages', '');
    for (const p of root.slice(0, maxPerSection)) lines.push(renderPage(p));
  }
  bySection.delete('');

  const sections = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [slug, pages] of sections) {
    lines.push('', `## ${sectionTitle(slug)}`, '');
    for (const p of pages.slice(0, maxPerSection)) lines.push(renderPage(p));
    if (pages.length > maxPerSection) {
      // Said out loud rather than trimmed in silence: a truncated file that looks
      // complete is how a site's best pages quietly stop being offered.
      lines.push(
        `- _${pages.length - maxPerSection} more page(s) in this section are not listed._`,
      );
    }
  }

  if (!usable.length) {
    lines.push(
      '',
      '## Pages',
      '',
      '_No crawled pages are available yet. Run a crawl and regenerate this file._',
    );
  }

  return lines.join('\n') + '\n';
}
