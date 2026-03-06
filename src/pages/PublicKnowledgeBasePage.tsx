import React, { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, FileText, LayoutDashboard, Search, ChevronDown,
  ChevronRight, Bot, Sparkles, Hash,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useNavigate } from 'react-router-dom';
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

// ── Left sidebar item ────────────────────────────────────────────────────────
function CategorySection({
  category,
  docs,
  loading,
  selectedDocId,
  expanded,
  onToggle,
  onDocSelect,
}: {
  category: KBCategory;
  docs: KBDocument[];
  loading: boolean;
  selectedDocId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onDocSelect: (doc: KBDocument) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-accent/50 rounded-lg transition-colors group"
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-base mr-1">{category.icon}</span>
        <span className="flex-1 truncate">{category.name}</span>
        {category.document_count != null && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{category.document_count}</span>
        )}
      </button>
      {expanded && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l pl-2">
          {loading ? (
            <p className="text-xs text-muted-foreground px-2 py-1">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">No articles yet</p>
          ) : (
            docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onDocSelect(doc)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors truncate ${
                  selectedDocId === doc.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground/70 hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                {doc.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export const PublicKnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [docsByCategory, setDocsByCategory] = useState<Record<string, KBDocument[]>>({});
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState<Record<string, boolean>>({});
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<KBDocument | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [askingAI, setAskingAI] = useState(false);

  // Load all public categories
  useEffect(() => {
    supabase
      .from('kb_categories')
      .select('*')
      .eq('access_level', 'public')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setCategories(data || []);
        setLoadingCats(false);
      });
  }, []);

  // Load docs for a category (lazy)
  const loadCategoryDocs = useCallback(async (catId: string) => {
    if (docsByCategory[catId] !== undefined) return;
    setLoadingDocs((p) => ({ ...p, [catId]: true }));
    const { data } = await supabase
      .from('kb_docs')
      .select('id, title, summary, status, visibility, view_count, created_at, updated_at, workspace_id, content, content_markdown, category_id, created_by, updated_by, embedding_status, embedding_generated_at, embedding_model')
      .eq('category_id', catId)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    setDocsByCategory((p) => ({ ...p, [catId]: (data || []) as KBDocument[] }));
    setLoadingDocs((p) => ({ ...p, [catId]: false }));
  }, [docsByCategory]);

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
        loadCategoryDocs(catId);
      }
      return next;
    });
  };

  const openDoc = (doc: KBDocument, catId: string) => {
    setSelectedDoc(doc);
    setSelectedCatId(catId);
    window.scrollTo({ top: 0 });
  };

  // All loaded docs for search
  const allDocs = useMemo(() => Object.values(docsByCategory).flat(), [docsByCategory]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allDocs.filter((d) =>
      d.title.toLowerCase().includes(q) || (d.summary || '').toLowerCase().includes(q)
    );
  }, [search, allDocs]);

  // Also search across unloaded categories
  useEffect(() => {
    if (!search.trim()) return;
    // Load all categories for search
    categories.forEach((c) => loadCategoryDocs(c.id));
  }, [search, categories]);

  const tocItems = useMemo(() => {
    if (!selectedDoc) return [];
    const md = selectedDoc.content_markdown || selectedDoc.content || '';
    return extractHeadings(md);
  }, [selectedDoc]);

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
      // Not logged in — send to agent hub with short prompt (login required)
      const shortPrompt = `I have questions about the article: "${selectedDoc.title}"`;
      navigate(`/agent-hub?prompt=${encodeURIComponent(shortPrompt)}`);
    } finally {
      setAskingAI(false);
    }
  };

  if (loadingCats) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--background))' }}>
        <p className="text-muted-foreground">Loading knowledge base…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'hsl(var(--background))' }}>

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b" style={{ background: 'hsl(var(--primary))' }}>
        <div className="flex items-center gap-4 px-6 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2 text-primary-foreground shrink-0">
            <BookOpen className="h-5 w-5" />
            <span className="font-semibold text-sm">Knowledge Base</span>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-full bg-white/10 border border-white/20 text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>

          <div className="ml-auto shrink-0">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full gap-1.5 h-8"
              onClick={() => navigate('/')}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Back to Platform
            </Button>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar */}
        <aside className="w-60 shrink-0 border-r overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)] bg-card/50 p-3 space-y-1">
          {search.trim() ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Search results
              </p>
              {searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-2">No results for "{search}"</p>
              ) : (
                searchResults.map((doc) => {
                  const cat = categories.find((c) => c.id === doc.category_id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => { openDoc(doc, doc.category_id || ''); setSearch(''); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        selectedDoc?.id === doc.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <p className="font-medium truncate">{doc.title}</p>
                      {cat && <p className="text-[10px] text-muted-foreground mt-0.5">{cat.icon} {cat.name}</p>}
                    </button>
                  );
                })
              )}
            </>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Categories
              </p>
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3">No public categories yet.</p>
              ) : (
                categories.map((cat) => (
                  <CategorySection
                    key={cat.id}
                    category={cat}
                    docs={docsByCategory[cat.id] || []}
                    loading={!!loadingDocs[cat.id]}
                    selectedDocId={selectedDoc?.id || null}
                    expanded={expandedCats.has(cat.id)}
                    onToggle={() => toggleCategory(cat.id)}
                    onDocSelect={(doc) => openDoc(doc, cat.id)}
                  />
                ))
              )}
            </>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {selectedDoc ? (
            <div className="max-w-3xl mx-auto px-8 py-8">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
                <button onClick={() => setSelectedDoc(null)} className="hover:text-foreground transition-colors">
                  Home
                </button>
                {selectedCategory && (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <span>{selectedCategory.icon} {selectedCategory.name}</span>
                  </>
                )}
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-medium truncate max-w-[240px]">{selectedDoc.title}</span>
              </nav>

              {/* Title row */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-3xl font-light tracking-tight leading-tight">{selectedDoc.title}</h1>
                <Button
                  className="rounded-full gap-2 shrink-0"
                  onClick={handleAskAI}
                  disabled={askingAI}
                >
                  {askingAI ? (
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                  Ask AI
                </Button>
              </div>

              {selectedDoc.summary && (
                <p className="text-muted-foreground text-base mb-6 leading-relaxed">{selectedDoc.summary}</p>
              )}

              <div className="text-xs text-muted-foreground mb-8 flex items-center gap-3">
                <span>{new Date(selectedDoc.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                {selectedDoc.view_count > 0 && <span>· {selectedDoc.view_count} views</span>}
              </div>

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

              {/* Footer Ask AI callout */}
              <div className="mt-12 rounded-2xl border bg-primary/5 p-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Have questions about this article?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Chat with KAI and get instant answers based on this content.</p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-full gap-2 shrink-0"
                  onClick={handleAskAI}
                  disabled={askingAI}
                >
                  <Sparkles className="h-4 w-4" />
                  Ask AI
                </Button>
              </div>
            </div>
          ) : (
            /* Landing / welcome state */
            <div className="max-w-3xl mx-auto px-8 py-12">
              <div className="mb-10">
                <h1 className="text-4xl font-light tracking-tight mb-3">How can we help?</h1>
                <p className="text-muted-foreground text-lg">Browse categories on the left or search above to find articles.</p>
              </div>

              {categories.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        toggleCategory(cat.id);
                        setExpandedCats((prev) => { const s = new Set(prev); s.add(cat.id); return s; });
                      }}
                      className="text-left rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow group"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium group-hover:text-primary transition-colors">{cat.name}</p>
                          {cat.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">{cat.document_count || 0} articles</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right sidebar — On this page TOC */}
        {selectedDoc && tocItems.length > 0 && (
          <aside className="w-52 shrink-0 border-l overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)] px-4 py-6 hidden lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
            <nav className="space-y-1">
              {tocItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`block text-xs text-muted-foreground hover:text-foreground transition-colors leading-snug py-0.5 ${
                    item.level === 3 ? 'pl-3' : ''
                  }`}
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
};
