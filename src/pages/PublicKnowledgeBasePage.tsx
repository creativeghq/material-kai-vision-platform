import React, { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  LayoutDashboard, Search, ChevronDown,
  ChevronRight, Bot, Sparkles, Hash, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { KBCategory, KBDocument } from '@/services/knowledgeBaseService';

// ── TOC heading extraction ──────────────────────────────────────────────────
interface TocItem { id: string; text: string; level: number; }

function extractHeadings(markdown: string): TocItem[] {
  const lines = markdown.split('\n');
  const items: TocItem[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const text = m[2].trim();
      items.push({ id: text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'), text, level: m[1].length });
    }
  }
  return items;
}

// ── Category card ─────────────────────────────────────────────────────────
function CategoryCard({ category, onClick }: { category: KBCategory; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl border bg-white p-5 hover:shadow-md transition-all group flex flex-col gap-3"
    >
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">
        {category.icon}
      </div>
      <div>
        <p className="font-medium text-sm group-hover:text-primary transition-colors">{category.name}</p>
        {category.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{category.description}</p>
        )}
      </div>
    </button>
  );
}

// ── FAQ accordion item ────────────────────────────────────────────────────
function FaqItem({ doc, onOpen }: { doc: KBDocument; onOpen: () => void }) {
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
          <button
            onClick={onOpen}
            className="text-primary text-xs font-medium hover:underline flex items-center gap-1"
          >
            Read full article <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export const PublicKnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [docsByCategory, setDocsByCategory] = useState<Record<string, KBDocument[]>>({});
  const [loadingCats, setLoadingCats] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<KBDocument | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [askingAI, setAskingAI] = useState(false);

  // Load all public categories with actual published doc counts
  useEffect(() => {
    Promise.all([
      supabase.from('kb_categories').select('*').eq('access_level', 'public').order('sort_order', { ascending: true }),
      supabase.from('kb_docs').select('category_id').eq('status', 'published'),
    ]).then(([{ data: cats }, { data: docCounts }]) => {
      const countMap: Record<string, number> = {};
      (docCounts || []).forEach((d) => {
        if (d.category_id) countMap[d.category_id] = (countMap[d.category_id] || 0) + 1;
      });
      setCategories((cats || []).map((c) => ({ ...c, document_count: countMap[c.id] || 0 })));
      setLoadingCats(false);
    });
  }, []);

  // Load docs for all categories eagerly (for FAQ sections) — single batched query
  // (was N+1: one query per category)
  useEffect(() => {
    if (!categories.length) return;
    const missingCategoryIds = categories
      .map((c) => c.id)
      .filter((id) => docsByCategory[id] === undefined);
    if (missingCategoryIds.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from('kb_docs')
        .select('id, title, summary, status, visibility, view_count, created_at, updated_at, workspace_id, content, content_markdown, category_id, created_by, updated_by, embedding_status, embedding_generated_at, embedding_model')
        .in('category_id', missingCategoryIds)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      // Bucket the flat result back into per-category arrays
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

  // Deep-link: open doc when ?doc=<id> is present
  useEffect(() => {
    const docId = searchParams.get('doc');
    if (!docId || selectedDoc) return;
    supabase
      .from('kb_docs')
      .select('*')
      .eq('id', docId)
      .eq('status', 'published')
      .single()
      .then(({ data }) => {
        if (data) {
          setSelectedDoc(data as KBDocument);
          setSelectedCatId(data.category_id || null);
        }
      });
  }, [searchParams]);

  const allDocs = useMemo(() => Object.values(docsByCategory).flat(), [docsByCategory]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allDocs.filter((d) =>
      d.title.toLowerCase().includes(q) || (d.summary || '').toLowerCase().includes(q),
    );
  }, [search, allDocs]);

  const tocItems = useMemo(() => {
    if (!selectedDoc) return [];
    const md = selectedDoc.content_markdown || selectedDoc.content || '';
    return extractHeadings(md);
  }, [selectedDoc]);

  const selectedCategory = categories.find((c) => c.id === selectedCatId);

  const openDoc = (doc: KBDocument) => {
    setSelectedDoc(doc);
    setSelectedCatId(doc.category_id || null);
    window.scrollTo({ top: 0 });
    supabase.rpc('increment_kb_doc_view', { doc_id: doc.id }).catch(() => {});
  };

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

  if (loadingCats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading knowledge base…</p>
      </div>
    );
  }

  // ── Article view ──────────────────────────────────────────────────────────
  if (selectedDoc) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3 px-3 sm:px-6 h-14">
            <button
              onClick={() => { setSelectedDoc(null); setSelectedCatId(null); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
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
              {new Date(selectedDoc.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedDoc.content_markdown || selectedDoc.content || ''}
              </ReactMarkdown>
            </div>

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
              <nav className="space-y-1">
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

      {/* Hero */}
      <section
        className="relative overflow-hidden py-20 px-4 text-center"
        style={{ background: 'linear-gradient(135deg, hsl(330, 43%, 13%) 0%, hsl(315, 38%, 22%) 50%, hsl(290, 28%, 32%) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-25" style={{ background: 'radial-gradient(circle, hsl(320,55%,55%) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(280,45%,55%) 0%, transparent 70%)' }} />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <h1 className="text-4xl font-light text-white mb-3 tracking-tight">Support &amp; Documentation</h1>
          <p className="text-white/65 mb-8 text-base">Stuck on something or getting started? Browse our knowledge base to find answers.</p>
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-11 pr-4 py-3 rounded-full bg-white/15 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
            />
          </div>
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
            <h2 className="text-lg font-light mb-5">Results for "{search}"</h2>
            {searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm">No articles found.</p>
            ) : (
              <div className="border rounded-2xl overflow-hidden bg-white divide-y">
                {searchResults.map((doc) => {
                  const cat = categories.find((c) => c.id === doc.category_id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => { openDoc(doc); setSearch(''); }}
                      className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium text-sm">{doc.title}</p>
                        {doc.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{doc.summary}</p>}
                        {cat && <p className="text-[10px] text-muted-foreground mt-1">{cat.icon} {cat.name}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Quickfind answers — category grid */}
            {categories.length > 0 && (
              <section>
                <h2 className="text-lg font-light mb-5">Quickfind answers</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {categories.map((cat) => (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      onClick={() =>
                        document.getElementById(`cat-faq-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Per-category FAQ accordions */}
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
                      <FaqItem key={doc.id} doc={doc} onOpen={() => openDoc(doc)} />
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
