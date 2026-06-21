import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Package, FileText, ArrowLeft, Star, ChevronRight } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SeoHead } from '@/components/seo/SeoHead';

interface BrandDoc {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content_tier: number;
  category_name: string | null;
}
interface BrandProduct { id: string; name: string; }
interface BrandData {
  brand: string;
  slug: string;
  overview: { title: string; slug: string | null; summary: string | null } | null;
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
        <SeoHead title="Brand not found" noIndex canonicalPath={`/knowledge-base/brand/${slug}`} />
        <p className="text-lg font-light">No brand knowledge found for “{slug}”.</p>
        <Button className="rounded-full" onClick={() => navigate('/knowledge-base')}>Browse the knowledge base</Button>
      </div>
    );
  }

  const docs = dedupeByTitle(data.docs || []);
  const featured = docs.filter((d) => (d.content_tier || 1) === 1);
  const rest = docs.filter((d) => (d.content_tier || 1) !== 1);
  const groups: Record<string, BrandDoc[]> = {};
  rest.forEach((d) => { const c = collectionOf(d.title); (groups[c] ||= []).push(d); });
  const groupNames = Object.keys(groups).sort();
  const signupHref = '/auth?mode=signup&redirect=/discover';

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title={`${data.brand} — Brand Knowledge`}
        description={data.overview?.summary || `Documentation, certifications and products from ${data.brand}.`}
        canonicalPath={`/knowledge-base/brand/${data.slug}`}
      />

      {/* Hero */}
      <header className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <button
            onClick={() => navigate('/knowledge-base')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Knowledge Base
          </button>
          <h1 className="text-3xl font-medium tracking-tight">{data.brand}</h1>
          {data.overview?.summary && (
            <p className="mt-2 text-muted-foreground max-w-2xl">{data.overview.summary}</p>
          )}
          {data.overview?.slug && (
            <Link
              to={`/knowledge-base/${data.overview.slug}`}
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Read about {data.brand} <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
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

        {/* Products (lead-gen) */}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(user ? `/discover?product=${p.id}` : signupHref)}
                  className="text-left rounded-2xl border bg-white p-4 hover:border-primary hover:shadow-sm transition group"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{user ? 'View product →' : 'Sign up to view →'}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* All documentation grouped by collection */}
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
      </main>
    </div>
  );
};

export default BrandKnowledgePage;
