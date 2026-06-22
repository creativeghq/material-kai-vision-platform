import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Tag, Package, FileText } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { SeoHead } from '@/components/seo/SeoHead';

interface BrandRow {
  brand: string;
  slug: string;
  doc_count: number;
  product_count: number;
  image_url: string | null;
}

export const BrandsIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('kb_list_brands');
      if (!cancelled) {
        setBrands(error ? [] : ((data as BrandRow[]) || []));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Brands — Knowledge Base"
        description="Browse brands and explore their documentation, certifications and products."
        canonicalPath="/brands"
      />

      <header className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <button
            onClick={() => navigate('/knowledge-base')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Knowledge Base
          </button>
          <h1 className="text-3xl font-medium tracking-tight flex items-center gap-2">
            <Tag className="h-7 w-7 text-primary" /> Brands
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Explore each brand’s documentation, certifications and products.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : brands.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-muted-foreground">No brands available yet.</p>
            <Button className="rounded-full" onClick={() => navigate('/knowledge-base')}>Browse the knowledge base</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((b) => (
              <Link
                key={b.slug}
                to={`/brand/${b.slug}`}
                className="rounded-2xl border bg-white overflow-hidden hover:border-primary hover:shadow-sm transition group"
              >
                {b.image_url ? (
                  <img
                    src={b.image_url}
                    alt={b.brand}
                    loading="lazy"
                    className="w-full h-36 object-cover bg-muted"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-36 bg-primary/5 flex items-center justify-center">
                    <Tag className="h-8 w-8 text-primary/40" />
                  </div>
                )}
                <div className="p-4">
                  <p className="font-medium group-hover:text-primary transition-colors">{b.brand}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {b.doc_count} articles</span>
                    <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {b.product_count} products</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BrandsIndexPage;
