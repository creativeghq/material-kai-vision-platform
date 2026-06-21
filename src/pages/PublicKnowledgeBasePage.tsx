import React, { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';
import {
  LayoutDashboard, Search, ChevronDown,
  ChevronRight, Bot, Sparkles, Hash, ArrowLeft,
  FileText, TrendingUp, BookOpen, Eye,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { KBCategory, KBDocument, KBFaqItem } from '@/services/knowledgeBaseService';
import { SeoHead } from '@/components/seo/SeoHead';

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

/** Read the authored FAQ list off a doc's metadata, tolerating shape drift. */
function getFaq(doc: KBDocument | null): KBFaqItem[] {
  const raw = (doc?.metadata as any)?.faq;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f: any) => ({ question: String(f?.question ?? f?.q ?? '').trim(), answer: String(f?.answer ?? f?.a ?? '').trim() }))
    .filter((f) => f.question && f.answer);
}

// ── FAQ accordion item (landing list) ───────────────────────────────────────
function FaqItem({ doc, href }: { doc: KBDocument; href: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = doc.summary || (doc.content_markdown || doc.content || '').slice(0, 300);

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left text-sm font-medium hover:text-primary transition-colors"
      >
        <span>{doc.title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="pb-5 text-sm text-muted-foreground space-y-3">
          <p className="leading-relaxed">{preview}</p>
          <Link
            to={href}
            className="text-primary text-xs font-medium hover:underline flex items-center gap-1"
          >
            Read full article <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
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
  const [scopeCatId, setScopeCatId] = useState<string>('');
  const [askingAI, setAskingAI] = useState(false);

  const docHref = (doc: { slug?: string | null; id: string }) =>
    `/knowledge-base/${doc.slug || doc.id}`;

  // Load all public categories with actual published doc counts
  useEffect(() => {
    Promise.all([
      supabase.from('kb_categories').select('*').eq('access_level', 'public').order('sort_order', { ascending: true }),
      // Public browse = curated/brand articles only. Per-product auto-extracted
      // fragments (specs, compliance, certifications, care) carry a
      // metadata.product_id and are surfaced on the PRODUCT page's Knowledge tab
      // instead — excluding them here keeps the public KB from being a dump of
      // hundreds of tiny spec pages.
      supabase.from('kb_docs').select('category_id').eq('status', 'published').eq('visibility', 'public').is('metadata->>product_id', null),
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
        .select('id, title, slug, summary, status, visibility, view_count, created_at, updated_at, workspace_id, content, content_markdown, category_id, created_by, updated_by, embedding_status, embedding_generated_at, embedding_model')
        .in('category_id', missingCategoryIds)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .is('metadata->>product_id', null) // product fragments live on the product page, not the public KB
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
  // truth, so Back/forward and shareable links work. KB reads are GLOBAL —
  // never filtered by the viewer's workspace, only published+public.
  useEffect(() => {
    if (!slug) { setSelectedDoc(null); setNotFound(false); return; }
    let cancelled = false;
    setNotFound(false);
    supabase
      .from('kb_docs')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const doc = data?.[0];
        if (doc) {
          setSelectedDoc(doc as KBDocument);
          setSelectedCatId((doc as any).category_id || null);
          window.scrollTo({ top: 0 });
          supabase.rpc('increment_kb_doc_view', { doc_id: doc.id }).catch(() => {});
        } else {
          setSelectedDoc(null);
          setNotFound(true);
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  // Back-compat: legacy ?doc=<uuid> links → resolve and redirect to the slug URL.
  useEffect(() => {
    const docId = searchParams.get('doc');
    if (!docId || slug) return;
    supabase
      .from('kb_docs')
      .select('id, slug')
      .eq('id', docId)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .maybeSingle()
      .then(({ data }) => {
        if (data) navigate(`/knowledge-base/${data.slug || data.id}`, { replace: true });
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
    return allDocs.filter((d) => {
      if (scopeCatId && d.category_id !== scopeCatId) return false;
      const hay = `${d.title} ${d.summary || ''}`.toLowerCase();
      if (qCollapsed && collapse(hay).includes(qCollapsed)) return true;
      return tokens.length > 0 && tokens.every((t) => hay.includes(t));
    });
  }, [search, scopeCatId, allDocs]);

  // Most-read articles across all public categories (Popular Articles section).
  const popularDocs = useMemo(
    () => [...allDocs].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 6),
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
  if (slug && notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <SeoHead title="Article not found" noIndex canonicalPath={`/knowledge-base/${slug}`} />
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
              {selectedCategory && (<><span>/</span><span>{selectedCategory.name}</span></>)}
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
            <div className="prose prose-sm max-w-none
              prose-headings:font-medium prose-headings:tracking-tight
              prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:scroll-mt-20
              prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2 prose-h3:scroll-mt-20
              prose-p:text-foreground/85 prose-p:leading-relaxed
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-muted prose-pre:rounded-xl prose-pre:border
              prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
              prose-ul:my-3 prose-li:my-1
              prose-table:text-sm prose-th:bg-muted prose-td:border prose-th:border
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
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
                      <div className="pt-3 text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.answer}</ReactMarkdown>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

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

          {tocItems.length > 0 && (
            <aside className="w-48 shrink-0 hidden lg:block sticky top-24 self-start">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
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
            </aside>
          )}
        </div>
      </div>
    );
  }

  // ── Home / landing view ───────────────────────────────────────────────────
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
            </div>
            {categories.length > 0 && (
              <select
                value={scopeCatId}
                onChange={(e) => setScopeCatId(e.target.value)}
                aria-label="Filter by category"
                className="shrink-0 max-w-[42%] bg-transparent border-l border-white/20 text-white/80 text-xs px-3 rounded-r-full focus:outline-none cursor-pointer [&>option]:text-foreground"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Popular topic chips */}
          {categories.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-white/50 text-xs">Popular topics</span>
              {categories.slice(0, 5).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => scrollToId(`cat-faq-${cat.id}`)}
                  className="text-xs text-white/85 bg-white/10 hover:bg-white/20 transition-colors rounded-full px-3 py-1"
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
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full gap-1.5"
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
                      onClick={() => scrollToId(`cat-faq-${cat.id}`)}
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

            {/* Per-category article lists (topic anchors) */}
            {categories.map((cat) => {
              const docs = docsByCategory[cat.id];
              if (!docs || docs.length === 0) return null;
              return (
                <section key={cat.id} id={`cat-faq-${cat.id}`} className="scroll-mt-6">
                  <h2 className="text-lg font-light mb-4 flex items-center gap-2">
                    <span>{cat.icon}</span>
                    {cat.name}
                  </h2>
                  <div className="border rounded-2xl px-5 bg-white divide-y">
                    {docs.map((doc) => (
                      <FaqItem key={doc.id} doc={doc} href={docHref(doc)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
