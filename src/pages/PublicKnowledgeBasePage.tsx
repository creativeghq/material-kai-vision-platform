import React, { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';
import {
  LayoutDashboard, Search, ChevronDown,
  ChevronRight, Bot, Sparkles, Hash, ArrowLeft,
  FileText, TrendingUp, BookOpen, Eye, Tag,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { KBCategory, KBDocument, KBFaqItem } from '@/services/knowledgeBaseService';
import { SeoHead } from '@/components/seo/SeoHead';
import { KbCommandSearch } from '@/components/features/knowledge/KbCommandSearch';
import { ProductTeaser } from '@/components/features/knowledge/ProductTeaser';
import { mdComponents } from '@/components/features/knowledge/markdownComponents';

// ── TOC heading extraction (ids match rehype-slug / github-slugger) ──────────
interface TocItem { id: string; text: string; level: number; }

/** Remove a single leading top-level `# Heading` so the page keeps exactly one
 *  <h1> (the rendered title). Body headings should be h2/h3. */
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+.+(\r?\n)+/, '');
}

function extractHeadings(markdown: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const text = m[2].replace(/[*_`]/g, '').trim();
      items.push({ id: slugger.slug(text), text, level: m[1].length });
    }
  }
  return items;
}

/** Best-effort brand from a brand/product doc title: "About HARMONY" → HARMONY,
 *  "MAISON - Certifications" / "HARMONY — Standards" → first segment. */
function brandFromTitle(title: string): string | null {
  if (!title) return null;
  const about = title.match(/^about\s+(.+)$/i);
  if (about) return about[1].trim();
  const seg = title.split(/\s[—–-]\s/)[0];
  return seg && seg !== title ? seg.trim() : null;
}

/** Lead-gen: tease catalog products related to a KB article's brand and funnel
 *  unregistered visitors to sign up. Renders nothing when no related products. */
function KbRelatedProducts({ doc }: { doc: KBDocument }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<Array<{ id: string; name: string; brand: string | null; image_url: string | null }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as any)('kb_doc_related_products', {
        p_doc_id: doc.id,
        p_brand: brandFromTitle(doc.title),
        p_limit: 6,
      });
      if (!cancelled && !error) setProducts((data as any[]) || []);
    })();
    return () => { cancelled = true; };
  }, [doc.id, doc.title]);

  if (products.length === 0) return null;
  const brand = products[0]?.brand || brandFromTitle(doc.title) || 'this brand';
  const brandSlug = (products[0]?.brand || brandFromTitle(doc.title) || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const signupHref = '/auth?mode=signup&redirect=/discover';

  return (
    <section className="mt-12" aria-labelledby="related-products-heading">
      <div className="flex items-end justify-between gap-3 mb-1">
        <h2 id="related-products-heading" className="text-xl font-medium tracking-tight">
          Products from {brand}
        </h2>
        {brandSlug && (
          <Link to={`/brand/${brandSlug}`} className="text-sm text-primary hover:underline shrink-0">
            {brand} brand page →
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {user
          ? 'Explore matching products in the catalog.'
          : 'Create a free account to view full specs, pricing and availability.'}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {products.map((p) => (
          <ProductTeaser
            key={p.id}
            name={p.name}
            imageUrl={p.image_url}
            cta={user ? 'View product →' : 'Sign up to view →'}
            onClick={() => navigate(user ? `/discover?product=${p.id}` : signupHref)}
          />
        ))}
      </div>
      {!user && (
        <Button className="rounded-full mt-4" onClick={() => navigate(signupHref)}>
          Create a free account to see our catalog
        </Button>
      )}
    </section>
  );
}

/** Read the authored FAQ list off a doc's metadata, tolerating shape drift. */
function getFaq(doc: KBDocument | null): KBFaqItem[] {
  const raw = (doc?.metadata as any)?.faq;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f: any) => ({ question: String(f?.question ?? f?.q ?? '').trim(), answer: String(f?.answer ?? f?.a ?? '').trim() }))
    .filter((f) => f.question && f.answer);
}

/** Compact brand card for the article sidebar — pulls the brand's image + counts
 *  and links back to the brand's main page. */
function BrandSidebar({ slug, name }: { slug: string; name: string }) {
  const [info, setInfo] = useState<{ hero_image: string | null; products?: any[]; docs?: any[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.rpc as any)('kb_brand_page', { p_brand_slug: slug });
      if (!cancelled) setInfo(data || null);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="mt-8 pt-6 border-t">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Brand</p>
      <Link to={`/brand/${slug}`} className="block rounded-xl border bg-white overflow-hidden hover:border-primary hover:shadow-sm transition group">
        {info?.hero_image && (
          <img src={info.hero_image} alt={name} loading="lazy" className="w-full h-20 object-cover bg-muted"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="p-3">
          <p className="text-sm font-medium group-hover:text-primary transition-colors">{name}</p>
          {info && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {info.products?.length || 0} products · {info.docs?.length || 0} articles
            </p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
            <ArrowLeft className="h-3 w-3" /> Back to {name}
          </span>
        </div>
      </Link>
    </div>
  );
}

const SITE_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://app.materialshub.gr';

// ── Main page ────────────────────────────────────────────────────────────────
export const PublicKnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [docsByCategory, setDocsByCategory] = useState<Record<string, KBDocument[]>>({});
  const [loadingCats, setLoadingCats] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<KBDocument | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command-palette search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [scopeCatId, setScopeCatId] = useState<string>('');
  const [askingAI, setAskingAI] = useState(false);

  const docHref = (doc: { slug?: string | null; id: string }) =>
    `/knowledge-base/${doc.slug || doc.id}`;

  // Load all public categories with actual published doc counts
  useEffect(() => {
    Promise.all([
      supabase.from('kb_categories').select('*').eq('access_level', 'public').order('sort_order', { ascending: true }),
      supabase.from('kb_docs').select('category_id').eq('status', 'published').eq('visibility', 'public'),
    ]).then(([{ data: cats }, { data: docCounts }]) => {
      const countMap: Record<string, number> = {};
      (docCounts || []).forEach((d) => {
        if (d.category_id) countMap[d.category_id] = (countMap[d.category_id] || 0) + 1;
      });
      // Hide categories with no curated public docs (e.g. material categories
      // whose only content is per-product fragments shown on the product page).
      setCategories(
        (cats || [])
          .map((c) => ({ ...c, document_count: countMap[c.id] || 0 }))
          .filter((c) => c.document_count > 0),
      );
      setLoadingCats(false);
    });
  }, []);

  // Load docs for all categories eagerly (for FAQ sections) — single batched query
  useEffect(() => {
    if (!categories.length) return;
    const missingCategoryIds = categories
      .map((c) => c.id)
      .filter((id) => docsByCategory[id] === undefined);
    if (missingCategoryIds.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from('kb_docs')
        .select('id, title, slug, summary, status, visibility, view_count, created_at, updated_at, workspace_id, content, content_markdown, category_id, created_by, updated_by, embedding_status, embedding_generated_at, embedding_model, content_tier, metadata')
        .in('category_id', missingCategoryIds)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .order('content_tier', { ascending: true }) // FEATURED (tier 1) first, SECONDARY after
        .order('created_at', { ascending: false });

      const grouped: Record<string, KBDocument[]> = {};
      missingCategoryIds.forEach((id) => { grouped[id] = []; });
      (data || []).forEach((doc: any) => {
        if (doc.category_id && grouped[doc.category_id]) {
          grouped[doc.category_id].push(doc as KBDocument);
        }
      });
      setDocsByCategory((p) => ({ ...p, ...grouped }));
    })();
  }, [categories]);

  // Resolve the article from the :slug route param. The URL is the source of
  // truth, so Back/forward and shareable links work. Visibility is enforced by
  // RLS, not an app filter: anon → published+public+public-category only
  // (kb_docs_public_read); workspace members → any doc in their workspace
  // (kb_docs_select), so admin "view" links open workspace/draft docs too.
  useEffect(() => {
    if (!slug) { setSelectedDoc(null); setNotFound(false); return; }
    let cancelled = false;
    setNotFound(false);
    supabase
      .from('kb_docs')
      .select('*')
      .eq('slug', slug)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const doc = data?.[0];
        if (doc) {
          setSelectedDoc(doc as KBDocument);
          setSelectedCatId((doc as any).category_id || null);
          window.scrollTo({ top: 0 });
          // PostgREST builder is a thenable but has no .catch(); use then(onOk, onErr).
          void supabase.rpc('increment_kb_doc_view', { doc_id: doc.id }).then(() => {}, () => {});
        } else {
          setSelectedDoc(null);
          setNotFound(true);
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  // Back-compat: legacy ?doc=<uuid> links → resolve and redirect to the slug URL.
  // RLS gates access; if it doesn't resolve, show "not found" instead of silently
  // falling back to the home page.
  useEffect(() => {
    const docId = searchParams.get('doc');
    if (!docId || slug) return;
    supabase
      .from('kb_docs')
      .select('id, slug')
      .eq('id', docId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) navigate(`/knowledge-base/${data.slug || data.id}`, { replace: true });
        else setNotFound(true);
      });
  }, [searchParams, slug, navigate]);

  const allDocs = useMemo(() => Object.values(docsByCategory).flat(), [docsByCategory]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    // Normalize away spaces/punctuation so "heatpump" matches "Heat Pump", and
    // also accept order-independent token matches ("manual pump" → "Heat Pump … Manual").
    const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const qCollapsed = collapse(search);
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = allDocs.filter((d) => {
      if (scopeCatId && d.category_id !== scopeCatId) return false;
      const hay = `${d.title} ${d.summary || ''}`.toLowerCase();
      if (qCollapsed && collapse(hay).includes(qCollapsed)) return true;
      return tokens.length > 0 && tokens.every((t) => hay.includes(t));
    });
    // Secondary (brand/product) pages still appear, but high-value pages rank first.
    return matched.sort((a, b) => (((a as any).content_tier || 1) - ((b as any).content_tier || 1)));
  }, [search, scopeCatId, allDocs]);

  // Featured section: high-value (tier 1) pages first, then by reads. Secondary
  // pages only surface here when there aren't enough featured ones.
  const popularDocs = useMemo(
    () => [...allDocs]
      .sort((a, b) =>
        (((a as any).content_tier || 1) - ((b as any).content_tier || 1)) ||
        ((b.view_count || 0) - (a.view_count || 0)))
      .slice(0, 6),
    [allDocs],
  );

  const scrollToId = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const articleMarkdown = useMemo(() => {
    if (!selectedDoc) return '';
    return stripLeadingH1(selectedDoc.content_markdown || selectedDoc.content || '');
  }, [selectedDoc]);

  const tocItems = useMemo(
    () => (selectedDoc ? extractHeadings(articleMarkdown) : []),
    [selectedDoc, articleMarkdown],
  );

  const faqItems = useMemo(() => getFaq(selectedDoc), [selectedDoc]);
  const selectedCategory = categories.find((c) => c.id === selectedCatId);

  // Ask AI handler
  const handleAskAI = async () => {
    if (!selectedDoc) return;
    setAskingAI(true);
    const content = selectedDoc.content_markdown || selectedDoc.content || '';
    const excerpt = content.length > 2000 ? content.slice(0, 2000) + '…' : content;
    const prompt = `I'm reading the article "${selectedDoc.title}" in the knowledge base and have some questions.\n\nArticle content:\n${excerpt}`;
    try {
      if (user) {
        const conversation = await agentChatHistoryService.createConversation({
          userId: user.id,
          agentId: 'kai',
          title: `KB: ${selectedDoc.title}`,
          description: `Discussion about article: ${selectedDoc.title}`,
        });
        if (conversation) {
          await agentChatHistoryService.saveMessage({
            conversationId: conversation.id,
            role: 'user',
            content: prompt,
          });
          navigate(`/agent-hub?conversation=${conversation.id}`);
          return;
        }
      }
      const shortPrompt = `I have questions about the article: "${selectedDoc.title}"`;
      navigate(`/agent-hub?prompt=${encodeURIComponent(shortPrompt)}`);
    } finally {
      setAskingAI(false);
    }
  };

  if (loadingCats && !selectedDoc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading knowledge base…</p>
      </div>
    );
  }

  // ── Article not found ──────────────────────────────────────────────────────
  if ((slug || searchParams.get('doc')) && notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <SeoHead title="Article not found" noIndex canonicalPath={`/knowledge-base/${slug || ''}`} />
        <p className="text-lg font-light">That article doesn’t exist or isn’t public.</p>
        <Button className="rounded-full" onClick={() => navigate('/knowledge-base')}>Browse the knowledge base</Button>
      </div>
    );
  }

  // ── Article view ──────────────────────────────────────────────────────────
  if (selectedDoc) {
    const seoTitle = (selectedDoc.metadata as any)?.seo_title || selectedDoc.title;
    const description =
      selectedDoc.summary ||
      (selectedDoc.content_markdown || selectedDoc.content || '').replace(/[#*`>_\-\[\]]/g, '').slice(0, 155).trim();
    const canonicalPath = docHref(selectedDoc);
    const url = `${SITE_ORIGIN}${canonicalPath}`;

    // Brand-prefixed docs breadcrumb up to their Brand page (the brand's main page).
    const docBrand = brandFromTitle(selectedDoc.title);
    const docBrandSlug = docBrand
      ? docBrand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      : '';

    const jsonLd: Array<Record<string, unknown>> = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: selectedDoc.title,
        description,
        datePublished: selectedDoc.created_at,
        dateModified: selectedDoc.updated_at,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: { '@type': 'Organization', name: 'MaterialsHub' },
        publisher: { '@type': 'Organization', name: 'MaterialsHub' },
        ...(selectedDoc.view_count ? { interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ReadAction', userInteractionCount: selectedDoc.view_count } } : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Knowledge Base', item: `${SITE_ORIGIN}/knowledge-base` },
          ...(selectedCategory ? [{ '@type': 'ListItem', position: 2, name: selectedCategory.name }] : []),
          { '@type': 'ListItem', position: selectedCategory ? 3 : 2, name: selectedDoc.title, item: url },
        ],
      },
    ];
    if (faqItems.length > 0) {
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      });
    }

    return (
      <div className="min-h-screen bg-background">
        <SeoHead
          title={seoTitle}
          description={description}
          canonicalPath={canonicalPath}
          keywords={selectedDoc.seo_keywords || undefined}
          type="article"
          jsonLd={jsonLd}
        />
        <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3 px-3 sm:px-6 h-14">
            <Link
              to="/knowledge-base"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            {selectedCategory && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                <span className="text-sm text-muted-foreground">{selectedCategory.icon} {selectedCategory.name}</span>
              </>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-sm font-medium truncate max-w-xs">{selectedDoc.title}</span>
            <div className="ml-auto">
              <Button variant="secondary" size="sm" className="rounded-full gap-1.5" onClick={() => navigate('/')}>
                <LayoutDashboard className="h-3.5 w-3.5" />
                Back to Platform
              </Button>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto flex gap-6 lg:gap-10 px-3 sm:px-6 py-6 sm:py-10">
          <article className="flex-1 min-w-0">
            {/* Breadcrumb (visible) */}
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5 flex-wrap">
              <Link to="/knowledge-base" className="hover:text-foreground">Knowledge Base</Link>
              {docBrandSlug && (
                <><span>/</span><Link to={`/brand/${docBrandSlug}`} className="hover:text-foreground">{docBrand}</Link></>
              )}
              {selectedCategory && (
                <>
                  <span>/</span>
                  <Link to={`/knowledge-base?cat=${selectedCatId}`} className="hover:text-foreground">
                    {selectedCategory.name}
                  </Link>
                </>
              )}
              <span>/</span>
              <span className="text-foreground/70">{selectedDoc.title}</span>
            </nav>

            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl font-light tracking-tight leading-tight">{selectedDoc.title}</h1>
              <Button className="rounded-full gap-2 shrink-0" onClick={handleAskAI} disabled={askingAI}>
                {askingAI ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Bot className="h-4 w-4" />}
                Ask AI
              </Button>
            </div>
            {selectedDoc.summary && (
              <p className="text-muted-foreground text-base mb-5 leading-relaxed">{selectedDoc.summary}</p>
            )}
            <p className="text-xs text-muted-foreground mb-8">
              Updated <time dateTime={selectedDoc.updated_at}>{new Date(selectedDoc.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
              {selectedDoc.view_count > 0 && ` · ${selectedDoc.view_count} views`}
            </p>
            <div className="max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={mdComponents}>
                {articleMarkdown}
              </ReactMarkdown>
            </div>

            {/* FAQ */}
            {faqItems.length > 0 && (
              <section className="mt-12" aria-labelledby="faq-heading">
                <h2 id="faq-heading" className="text-xl font-medium tracking-tight mb-4">Frequently asked questions</h2>
                <div className="border rounded-2xl px-5 bg-white divide-y">
                  {faqItems.map((f, i) => (
                    <details key={i} className="group py-4">
                      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-sm font-medium hover:text-primary transition-colors">
                        {f.question}
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="pt-3 max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{f.answer}</ReactMarkdown>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Lead-gen: related catalog products by brand → sign-up funnel */}
            <KbRelatedProducts doc={selectedDoc} />

            <div className="mt-12 rounded-2xl border bg-primary/5 p-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Have questions about this article?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Chat with JARVIS and get instant answers based on this content.</p>
              </div>
              <Button variant="outline" className="rounded-full gap-2 shrink-0" onClick={handleAskAI} disabled={askingAI}>
                <Sparkles className="h-4 w-4" />
                Ask AI
              </Button>
            </div>
          </article>

          {(tocItems.length > 0 || docBrandSlug) && (
            <aside className="w-48 shrink-0 hidden lg:block sticky top-24 self-start">
              {tocItems.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
              )}
              <nav className="space-y-1" aria-label="Table of contents">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`block text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5 leading-snug ${item.level === 3 ? 'pl-3' : ''}`}
                  >
                    {item.level === 2 && <Hash className="h-2.5 w-2.5 inline mr-1 opacity-50" />}
                    {item.text}
                  </a>
                ))}
                {faqItems.length > 0 && (
                  <a href="#faq-heading" className="block text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5 leading-snug">
                    <Hash className="h-2.5 w-2.5 inline mr-1 opacity-50" />FAQ
                  </a>
                )}
              </nav>
              {docBrandSlug && <BrandSidebar slug={docBrandSlug} name={docBrand || 'Brand'} />}
            </aside>
          )}
        </div>
      </div>
    );
  }

  // ── Home / landing view ───────────────────────────────────────────────────
  const catParam = searchParams.get('cat');
  const catLanding = catParam ? categories.find((c) => c.id === catParam) : null;
  const catLandingDocs = catParam ? (docsByCategory[catParam] || []) : [];
  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Knowledge Base — Materials, Installation & How-To Guides"
        description="Browse MaterialsHub guides, installation manuals, and how-to articles on materials, products, and the platform. Search answers or ask the AI assistant."
        canonicalPath="/knowledge-base"
        type="website"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'MaterialsHub Knowledge Base',
          url: `${SITE_ORIGIN}/knowledge-base`,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_ORIGIN}/knowledge-base?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden py-20 px-4 text-center"
        style={{ background: 'var(--brand-gradient)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-25" style={{ background: 'radial-gradient(circle, hsl(320,55%,55%) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(280,45%,55%) 0%, transparent 70%)' }} />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <h1 className="text-4xl font-light text-white mb-3 tracking-tight">Knowledge Base</h1>
          <p className="text-white/65 mb-8 text-base">Installation guides, how-to answers, and materials know-how — search or browse by topic.</p>

          {/* Search with category scope */}
          <div className="relative max-w-xl mx-auto flex items-stretch bg-white/15 border border-white/20 rounded-full focus-within:ring-2 focus-within:ring-white/30">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="What do you need help with today?"
                aria-label="Search knowledge base articles"
                className="w-full pl-11 pr-4 py-3 bg-transparent rounded-l-full text-white placeholder:text-white/50 focus:outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                aria-label="Open quick search"
                className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 rounded-full border border-white/40 px-2 py-0.5 text-[10px] text-white/90 hover:bg-white/15 transition"
              >
                <span className="font-sans">⌘</span>K
              </button>
            </div>
            {categories.length > 0 && (
              <select
                value={scopeCatId}
                onChange={(e) => setScopeCatId(e.target.value)}
                aria-label="Filter by category"
                className="shrink-0 max-w-[42%] bg-transparent border-l border-white/30 text-white text-xs px-3 rounded-r-full focus:outline-none cursor-pointer [&>option]:text-foreground"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <KbCommandSearch
            open={cmdOpen}
            onOpenChange={setCmdOpen}
            allDocs={allDocs}
            categories={categories}
            onSelect={(d) => navigate(docHref(d))}
          />

          <div className="mt-4 text-center">
            <Link to="/brands" className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white">
              <Tag className="h-4 w-4" /> Browse by brand
            </Link>
          </div>

          {/* Popular topic chips */}
          {categories.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-white/75 text-xs">Popular topics</span>
              {categories.slice(0, 5).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/knowledge-base?cat=${cat.id}`)}
                  className="text-xs text-white bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="absolute top-4 right-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/90 hover:text-white hover:bg-white/15 rounded-full gap-1.5"
            onClick={() => navigate('/')}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Back to Platform
          </Button>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

        {/* Search results */}
        {search.trim() ? (
          <section>
            <h2 className="text-lg font-light mb-5">
              Results for "{search}"
              {scopeCatId && <span className="text-muted-foreground"> in {categories.find((c) => c.id === scopeCatId)?.name}</span>}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm">No articles found.</p>
            ) : (
              <div className="border rounded-2xl overflow-hidden bg-white divide-y">
                {searchResults.map((doc) => {
                  const cat = categories.find((c) => c.id === doc.category_id);
                  return (
                    <Link
                      key={doc.id}
                      to={docHref(doc)}
                      className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium text-sm">{doc.title}</p>
                        {doc.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{doc.summary}</p>}
                        {cat && <p className="text-[10px] text-muted-foreground mt-1">{cat.icon} {cat.name}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ) : catParam ? (
          /* Category landing — a filtered internal page for one topic */
          <section>
            <button
              onClick={() => navigate('/knowledge-base')}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
            >
              <ArrowLeft className="h-4 w-4" /> Knowledge Base
            </button>
            <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
              {catLanding?.icon && <span>{catLanding.icon}</span>}{catLanding?.name || 'Topic'}
            </h1>
            {catLanding?.description && <p className="text-muted-foreground mt-1 max-w-2xl">{catLanding.description}</p>}
            {catLandingDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm mt-6">No articles in this topic yet.</p>
            ) : (
              <div className="mt-6 border rounded-2xl overflow-hidden bg-white divide-y">
                {catLandingDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={docHref(doc)}
                    className="block px-5 py-4 hover:bg-accent/30 transition-colors"
                  >
                    <p className="font-medium text-sm">{doc.title}</p>
                    {doc.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{doc.summary}</p>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Entry cards — the three ways to get an answer */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-20 relative z-10">
              <button
                onClick={() => scrollToId('browse-by-topic')}
                className="text-left rounded-2xl border bg-white p-6 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <p className="font-medium group-hover:text-primary transition-colors">Browse Articles</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Guides, manuals, and how-tos organized by topic.</p>
                <span className="inline-flex items-center gap-1 text-primary text-xs font-medium mt-3">Explore <ChevronRight className="h-3 w-3" /></span>
              </button>

              <button
                onClick={() => navigate('/agent-hub')}
                className="text-left rounded-2xl border bg-white p-6 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <p className="font-medium group-hover:text-primary transition-colors">Ask the AI Assistant</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Get an instant answer from JARVIS, grounded in this knowledge base.</p>
                <span className="inline-flex items-center gap-1 text-primary text-xs font-medium mt-3">Start chat <ChevronRight className="h-3 w-3" /></span>
              </button>

              <button
                onClick={() => scrollToId('popular-articles')}
                className="text-left rounded-2xl border bg-white p-6 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <p className="font-medium group-hover:text-primary transition-colors">Most Popular</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">The articles other people are reading right now.</p>
                <span className="inline-flex items-center gap-1 text-primary text-xs font-medium mt-3">See top reads <ChevronRight className="h-3 w-3" /></span>
              </button>
            </section>

            {/* Browse by Topic — category grid */}
            {categories.length > 0 && (
              <section id="browse-by-topic" className="scroll-mt-6">
                <div className="flex items-center gap-2 mb-5">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-light">Browse by Topic</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => navigate(`/knowledge-base?cat=${cat.id}`)}
                      className="text-left rounded-2xl border bg-white p-5 hover:shadow-md transition-all group flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                        {cat.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">{cat.name}</p>
                        {cat.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1.5">{cat.document_count ?? 0} article{(cat.document_count ?? 0) === 1 ? '' : 's'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Popular Articles */}
            {popularDocs.length > 0 && (
              <section id="popular-articles" className="scroll-mt-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-light">Popular Articles</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {popularDocs.map((doc) => {
                    const cat = categories.find((c) => c.id === doc.category_id);
                    return (
                      <Link
                        key={doc.id}
                        to={docHref(doc)}
                        className="rounded-2xl border bg-white px-5 py-4 hover:shadow-md transition-all group flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{doc.title}</p>
                          {cat && <p className="text-[10px] text-muted-foreground mt-1">{cat.icon} {cat.name}</p>}
                        </div>
                        {doc.view_count > 0 && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Eye className="h-3 w-3" />{doc.view_count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

          </>
        )}
      </div>
    </div>
  );
};
