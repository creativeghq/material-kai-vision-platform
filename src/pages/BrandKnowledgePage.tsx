import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Package, FileText, ArrowLeft, Star, ChevronRight, BookOpen, Layers } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SeoHead } from '@/components/seo/SeoHead';
import { ProductTeaser } from '@/components/features/knowledge/ProductTeaser';
import { mdComponents } from '@/components/features/knowledge/markdownComponents';

interface BrandDoc {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content_tier: number;
  category_name: string | null;
}
interface BrandProduct { id: string; name: string; image_url: string | null; }
interface BrandData {
  brand: string;
  slug: string;
  hero_image: string | null;
  overview: { title: string; slug: string | null; summary: string | null; content: string | null } | null;
  docs: BrandDoc[];
  products: BrandProduct[];
}

/** Collapse exact-duplicate titles (pre-dedupe data quality) for display. */
function dedupeByTitle(docs: BrandDoc[]): BrandDoc[] {
  const seen = new Set<string>();
  const out: BrandDoc[] = [];
  for (const d of docs) {
    const k = d.title.trim().toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(d); }
  }
  return out;
}

/** "MAISON - Certifications" / "HARMONY — Standards" → collection label. */
function collectionOf(title: string): string {
  const m = title.match(/^([A-Z0-9][^\s—–-]*)\s[—–-]\s/);
  return m ? m[1] : 'General';
}

/** Drop a single leading `# Heading` so the page keeps one h1 (the brand name). */
function stripLeadingH1(md: string): string {
  return md.replace(/^\s*#\s+.+(\r?\n)+/, '');
}

const DocCard: React.FC<{ doc: BrandDoc; compact?: boolean }> = ({ doc, compact }) => (
  <Link
    to={`/knowledge-base/${doc.slug || doc.id}`}
    className={`block rounded-2xl border bg-white hover:border-primary hover:shadow-sm transition group ${compact ? 'p-3' : 'p-4'}`}
  >
    <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">{doc.title}</p>
    {!compact && doc.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.summary}</p>}
    {doc.category_name && <p className="text-[10px] text-muted-foreground mt-2">{doc.category_name}</p>}
  </Link>
);

const Stat: React.FC<{ icon: React.ReactNode; value: number; label: string }> = ({ icon, value, label }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
    {icon} <span className="font-medium text-foreground">{value}</span> {label}
  </span>
);

export const BrandKnowledgePage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: res, error } = await (supabase.rpc as any)('kb_brand_page', { p_brand_slug: slug });
      if (!cancelled) {
        setData(error ? null : (res as BrandData));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!data || ((data.docs?.length ?? 0) === 0 && (data.products?.length ?? 0) === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <SeoHead title="Brand not found" noIndex canonicalPath={`/brand/${slug}`} />
        <p className="text-lg font-light">No brand page found for “{slug}”.</p>
        <Button className="rounded-full" onClick={() => navigate('/brands')}>Browse all brands</Button>
      </div>
    );
  }

  const docs = dedupeByTitle(data.docs || []);
  const featured = docs.filter((d) => (d.content_tier || 1) === 1);
  const rest = docs.filter((d) => (d.content_tier || 1) !== 1);
  const groups: Record<string, BrandDoc[]> = {};
  rest.forEach((d) => { const c = collectionOf(d.title); (groups[c] ||= []).push(d); });
  const groupNames = Object.keys(groups).sort();
  const collectionCount = groupNames.filter((g) => g !== 'General').length;
  const aboutBody = data.overview?.content ? stripLeadingH1(data.overview.content) : '';
  const signupHref = '/auth?mode=signup&redirect=/discover';
  const openProduct = (id: string) => navigate(user ? `/discover?product=${id}` : signupHref);

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title={`${data.brand} — Brand`}
        description={data.overview?.summary || `Documentation, certifications and products from ${data.brand}.`}
        canonicalPath={`/brand/${data.slug}`}
        image={data.hero_image || undefined}
      />

      {/* Hero */}
      <header className="border-b">
        {data.hero_image && (
          <div className="h-44 md:h-60 w-full overflow-hidden bg-muted">
            <img src={data.hero_image} alt={data.brand} className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          </div>
        )}
        <div className="max-w-5xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/brands')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> All brands
          </button>
          <h1 className="text-3xl font-medium tracking-tight">{data.brand}</h1>
          {data.overview?.summary && (
            <p className="mt-2 text-muted-foreground max-w-2xl">{data.overview.summary}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat icon={<Package className="h-4 w-4" />} value={data.products?.length || 0} label="products" />
            {collectionCount > 0 && <Stat icon={<Layers className="h-4 w-4" />} value={collectionCount} label="collections" />}
            <Stat icon={<BookOpen className="h-4 w-4" />} value={docs.length} label="articles" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* About — real brand copy from the backend */}
        {aboutBody && (
          <section>
            <h2 className="text-xl font-medium mb-3 flex items-center gap-2">About {data.brand}</h2>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{aboutBody}</ReactMarkdown>
            {data.overview?.slug && (
              <Link to={`/knowledge-base/${data.overview.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Read the full article <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </section>
        )}

        {/* Featured docs */}
        {featured.length > 0 && (
          <section>
            <h2 className="text-xl font-medium mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" /> Featured
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {featured.map((d) => <DocCard key={d.id} doc={d} />)}
            </div>
          </section>
        )}

        {/* Products — image cards that open the internal product page */}
        {data.products?.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <h2 className="text-xl font-medium flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" /> Products
              </h2>
              {!user && (
                <Button size="sm" className="rounded-full" onClick={() => navigate(signupHref)}>
                  Sign up to view catalog
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.products.map((p) => (
                <ProductTeaser
                  key={p.id}
                  name={p.name}
                  imageUrl={p.image_url}
                  cta={user ? 'View product →' : 'Sign up to view →'}
                  onClick={() => openProduct(p.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Documentation grouped by collection — links into the internal KB articles */}
        {groupNames.length > 0 && (
          <section>
            <h2 className="text-xl font-medium mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Documentation
            </h2>
            <div className="space-y-6">
              {groupNames.map((g) => (
                <div key={g}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{g}</h3>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {groups[g].map((d) => <DocCard key={d.id} doc={d} compact />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Synthesized lead-gen / catalog funnel */}
        <section className="rounded-2xl border bg-primary/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-medium">Interested in {data.brand}?</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user
                ? 'Browse the full catalog for specs, pricing and availability.'
                : 'Create a free account to view the full catalog — specs, pricing and availability.'}
            </p>
          </div>
          <Button className="rounded-full shrink-0" onClick={() => navigate(user ? '/discover' : signupHref)}>
            {user ? 'Open catalog' : 'Create a free account'}
          </Button>
        </section>
      </main>
    </div>
  );
};

export default BrandKnowledgePage;
