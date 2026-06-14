import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Package, BookOpen, Users, Factory, ArrowRight, FileText, Building2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { ProfileModal } from '@/components/features/discover/ProfileModal';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import type { Product } from '@/components/features/products/types';
import { CAT_COLORS, PROFESSIONAL_TYPE_LABELS as PROF_LABELS, detectCat, catLabel } from '@/lib/materialCategories';
import {
  PRODUCT_IMAGE_SELECT,
  getManufacturer,
  getProductImageUrl,
  getProductName,
  getMaterialCategory,
} from '@/utils/productMetadata';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LatestMaterial {
  id: string;
  name: string;
  created_at: string;
  image_url?: string | null;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, any>;
}

interface LatestDocument {
  id: string;
  title: string | null;
  created_at: string;
  category_id: string | null;
}

interface LatestProfile {
  user_id: string;
  full_name: string;
  professional_type: string | null;
  location: string | null;
  avatar_url: string | null;
}

interface RawFactoryProduct {
  id: string;
  name: string;
  metadata: Record<string, any>;
  image_url?: string | null;
}

interface DerivedFactory {
  name: string;
  productCount: number;
  categories: string[];
}


function toProduct(item: LatestMaterial): Product {
  const meta = item.metadata ?? {};
  const cat = detectCat(meta);
  return {
    id: item.id,
    name: getProductName(item),
    description: item.description || '',
    category: cat.charAt(0).toUpperCase() + cat.slice(1),
    type: getMaterialCategory(meta) || '',
    status: item.status || 'active',
    images: item.image_url ? [{ url: item.image_url, alt: item.name, isPrimary: true }] : [],
    metadata: meta,
    pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
    stock: { quantity: 0, status: 'Unknown', unit: 'unit' },
    tags: [],
    sku: '',
  };
}

// ── Widget shell ──────────────────────────────────────────────────────────────
function Widget({
  icon: Icon, title, viewAllLink, loading, empty, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  viewAllLink: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-card flex flex-col gap-4 p-5 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        <Link to={viewAllLink} className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-primary/10 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-2.5 bg-primary/10 rounded w-4/5" />
                <div className="h-2 bg-primary/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : empty ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 flex-1">{children}</div>
      )}
    </div>
  );
}

// ── Thumbnail helpers ─────────────────────────────────────────────────────────
function ImageThumb({ src, fallback }: { src?: string | null; fallback: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-8 h-8 rounded-lg object-cover shrink-0 bg-primary/10"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-medium text-primary">
        {fallback.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

// ── Widget: Latest Materials ──────────────────────────────────────────────────
function MaterialsWidget() {
  const [items, setItems] = useState<LatestMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    supabase
      .from('products')
      .select(`id, name, created_at, description, status, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        const products = (data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          created_at: p.created_at,
          description: p.description,
          status: p.status,
          metadata: p.metadata ?? {},
          image_url: getProductImageUrl(p),
        }));
        setItems(products);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Widget icon={Package} title="Latest Materials" viewAllLink="/discover" loading={loading} empty={items.length === 0}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedProduct(toProduct(item))}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-left w-full"
          >
            <ImageThumb src={item.image_url} fallback={item.name} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-tight">{item.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          </button>
        ))}
      </Widget>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}

// ── Widget: Latest Knowledge ──────────────────────────────────────────────────
function KnowledgeWidget() {
  const [items, setItems] = useState<LatestDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Only surface docs that live in a PUBLIC category and are published +
      // public-visibility — same rule as PublicKnowledgeBasePage. Internal
      // (agent/admin) categories and private docs must never appear in this
      // public-style feed.
      const { data: pubCats } = await supabase
        .from('kb_categories')
        .select('id')
        .eq('access_level', 'public');
      const publicCategoryIds = (pubCats ?? []).map((c) => c.id);
      if (publicCategoryIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('kb_docs')
        .select('id, title, created_at, category_id')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .in('category_id', publicCategoryIds)
        .order('created_at', { ascending: false })
        .limit(6);
      setItems((data ?? []) as LatestDocument[]);
      setLoading(false);
    })();
  }, []);

  return (
    <Widget icon={BookOpen} title="Latest Knowledge" viewAllLink="/knowledge-base" loading={loading} empty={items.length === 0}>
      {items.map((doc) => (
        <div key={doc.id} className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate leading-tight">{doc.title || 'Untitled'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
      ))}
    </Widget>
  );
}

// ── Widget: Latest Profiles ───────────────────────────────────────────────────
function ProfilesWidget() {
  const [items, setItems] = useState<LatestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('user_id, full_name, professional_type, location, avatar_url')
      .eq('is_public', true)
      .not('professional_type', 'in', '("supplier")')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        setItems((data ?? []) as LatestProfile[]);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Widget icon={Users} title="Latest Profiles" viewAllLink="/discover" loading={loading} empty={items.length === 0}>
        {items.map((profile) => (
          <button
            key={profile.user_id}
            onClick={() => setSelectedUserId(profile.user_id)}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-left w-full"
          >
            <ImageThumb src={profile.avatar_url} fallback={profile.full_name || 'U'} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-tight">{profile.full_name || 'Anonymous'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {profile.professional_type ? (PROF_LABELS[profile.professional_type] ?? profile.professional_type) : ''}
                {profile.location ? ` · ${profile.location}` : ''}
              </p>
            </div>
          </button>
        ))}
      </Widget>

      {selectedUserId && (
        <ProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </>
  );
}

// ── Inline Factory Modal ──────────────────────────────────────────────────────
function FactoryDetailModal({
  factory,
  products,
  onClose,
}: {
  factory: DerivedFactory | null;
  products: RawFactoryProduct[];
  onClose: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  if (!factory) return null;

  function openProduct(p: RawFactoryProduct) {
    setSelectedProduct({
      id: p.id,
      name: getProductName(p),
      description: '',
      category: detectCat(p.metadata).charAt(0).toUpperCase() + detectCat(p.metadata).slice(1),
      type: getMaterialCategory(p.metadata) || '',
      status: 'active',
      images: p.image_url ? [{ url: p.image_url, alt: p.name, isPrimary: true }] : [],
      metadata: p.metadata,
      pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
      stock: { quantity: 0, status: 'Unknown', unit: 'unit' },
      tags: [],
      sku: '',
    });
  }

  return (
    <>
      <Dialog open={!!factory} onOpenChange={() => onClose()}>
        <DialogContent hideClose className="max-w-2xl p-0 overflow-hidden rounded-2xl gap-0 max-h-[85vh] flex flex-col">
          {/* Banner */}
          <div className="scrim-hero brand-hero h-24 sm:h-32 relative overflow-hidden shrink-0">
            <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute top-3 right-3">
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="bg-white shadow-sm shrink-0 relative z-10 px-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="scrim-hero brand-hero w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-4 border-white shadow-xl flex items-center justify-center shrink-0 -mt-8 sm:-mt-10">
                <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="flex-1 min-w-0 pt-3">
                <h2 className="text-lg font-semibold tracking-tight truncate">{factory.name}</h2>
                <p className="text-sm text-muted-foreground">{factory.productCount} material{factory.productCount !== 1 ? 's' : ''}</p>
                {factory.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {factory.categories.slice(0, 5).map((c) => (
                      <Badge
                        key={c}
                        className="text-xs px-1.5 py-0"
                        style={{
                          backgroundColor: `${CAT_COLORS[c] ?? CAT_COLORS.other}18`,
                          color: CAT_COLORS[c] ?? CAT_COLORS.other,
                          borderColor: `${CAT_COLORS[c] ?? CAT_COLORS.other}40`,
                        }}
                      >
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products grid */}
          <div className="overflow-y-auto flex-1 p-6">
            <p className="text-sm font-medium mb-3 text-muted-foreground">Materials — click to view details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-accent/30 hover:border-primary/30 transition-colors text-left w-full"
                >
                  <ImageThumb src={p.image_url} fallback={p.name} />
                  <p className="text-xs font-medium truncate flex-1 min-w-0">{p.name}</p>
                </button>
              ))}
            </div>
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No materials found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product detail overlay — renders on top of the factory modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}

// ── Widget: Latest Factories ──────────────────────────────────────────────────
function FactoriesWidget() {
  const [allProducts, setAllProducts] = useState<RawFactoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFactory, setSelectedFactory] = useState<DerivedFactory | null>(null);

  useEffect(() => {
    supabase
      .from('products')
      .select(`id, name, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .limit(500)
      .then(({ data }) => {
        const products = (data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          metadata: p.metadata ?? {},
          image_url: getProductImageUrl(p),
        }));
        setAllProducts(products);
        setLoading(false);
      });
  }, []);

  // Derive factories from product metadata via shared accessor — picks up
  // VALENOVA-style records where the manufacturer lives in metadata.manufacturer
  // rather than metadata.factory_group_name.
  const factories = useMemo<DerivedFactory[]>(() => {
    const map = new Map<string, { count: number; cats: Set<string> }>();
    allProducts.forEach((p) => {
      const name = getManufacturer(p.metadata);
      if (!name || name === 'Unknown') return;
      if (!map.has(name)) map.set(name, { count: 0, cats: new Set() });
      const e = map.get(name)!;
      e.count++;
      const cat = detectCat(p.metadata);
      if (cat !== 'other') e.cats.add(cat);
    });
    return Array.from(map.entries())
      .map(([name, { count, cats }]) => ({ name, productCount: count, categories: Array.from(cats) }))
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, 6);
  }, [allProducts]);

  const factoryProducts = useMemo(() =>
    selectedFactory
      ? allProducts.filter((p) => getManufacturer(p.metadata) === selectedFactory.name)
      : [],
    [allProducts, selectedFactory],
  );

  return (
    <>
      <Widget
        icon={Factory}
        title="Latest Factories"
        viewAllLink="/discover"
        loading={loading}
        empty={factories.length === 0}
      >
        {factories.map((f) => (
          <button
            key={f.name}
            onClick={() => setSelectedFactory(f)}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-left w-full"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-tight">{f.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {f.productCount} material{f.productCount !== 1 ? 's' : ''}
                {f.categories.length > 0 ? ` · ${f.categories[0]}` : ''}
              </p>
            </div>
          </button>
        ))}
      </Widget>

      <FactoryDetailModal
        factory={selectedFactory}
        products={factoryProducts}
        onClose={() => setSelectedFactory(null)}
      />
    </>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
const _LatestWidgets: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
    <MaterialsWidget />
    <KnowledgeWidget />
    <ProfilesWidget />
    <FactoriesWidget />
  </div>
);
export const LatestWidgets = React.memo(_LatestWidgets);
