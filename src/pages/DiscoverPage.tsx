import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Users, MapPin, Globe, Package,
  Layers, ChevronLeft, ChevronRight as ChevronRightIcon, Store,
  Sparkles, LayoutList, Home,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCatalogPrices, type CatalogPrice } from '@/hooks/useCatalogPrices';
import { useModule } from '@/modules/_core';
import { PropertyDiscoveryTab } from '@/modules/real-estate/components/PropertyDiscoveryTab';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { FilterBar, useFilters } from '@/components/core/filters';
import { HubSegmented, type HubSegment } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useFieldRegistry } from '@/hooks/useFieldRegistry';
import { FollowButton } from '@/components/features/social/FollowButton';
import { PageHeader } from '@/components/shared/PageHeader';
import { AddToQuoteButton } from '@/modules/quotes/components/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import { productDetailService } from '@/services/productDetailService';
import { Product } from '@/components/features/products/types';
import { ProfileModal } from '@/components/features/discover/ProfileModal';
import { MarketplaceTab } from '@/components/features/discover/MarketplaceTab';
import { UnifiedSearchInterface } from '@/components/features/search/UnifiedSearchInterface';
import { SavedSearches } from '@/components/features/search/SavedSearches';
import { marketplaceService } from '@/services/marketplaceService';
import {
  CAT_COLORS, PROFESSIONAL_TYPE_LABELS,
  detectCat, catLabel, initials,
} from '@/lib/materialCategories';
import { buildProductFilters, buildProfileFilters, productFacetFields } from '@/pages/discoverFilters';
import {

  getManufacturer,
  getMaterialCategory,
  getProductImageUrl,
  getProductName,
} from '@/utils/productMetadata';
import { onEnterOrSpace } from '@/utils/a11y';
import { httpUrlOrNull } from '@/utils/safeUrl';
import { getOptimizedImageUrl } from '@/utils/imageUrl';

// ─── Constants ───────────────────────────────────────────────────────────────

const PER_PAGE = 24;

type ProductMode = 'browse' | 'smart';

const PRODUCT_MODES: readonly HubSegment<ProductMode>[] = [
  {
    value: 'browse',
    label: <><LayoutList className="h-3.5 w-3.5" aria-hidden="true" /> Browse</>,
  },
  {
    value: 'smart',
    label: <><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Smart search</>,
  },
];

function toProduct(p: RawProduct): Product {
  const imageUrl = p.imageUrl || null;
  return {
    id: p.id,
    name: getProductName(p),
    description: p.description || '',
    category: catLabel(p.detectedCat),
    type: p.metadata?.material_category || '',
    status: p.status || 'active',
    images: imageUrl
      ? [{ url: imageUrl, alt: p.name, isPrimary: true }]
      : [],
    metadata: p.metadata,
    pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
    stock: { quantity: 0, status: 'Unknown', unit: 'unit' },
    tags: [],
    sku: '',
  };
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PublicCreator {
  user_id: string;
  full_name?: string;
  company?: string;
  bio?: string;
  avatar_url?: string;
  location?: string;
  website_url?: string;
  services: string[];
  skill_tags: string[];
  profile_views: number;
  professional_type?: string | null;
  follower_count?: number;
}

interface RawProduct {
  id: string;
  name: string;
  description?: string;
  status?: string;
  metadata: Record<string, any>;
  detectedCat: string;
  factoryName: string;
  imageUrl?: string | null;
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) {
  if (total <= 1) return null;

  const pages = Array.from({ length: total }, (_, i) => i + 1);
  // Show at most 7 page buttons: first, last, current ±2, with ellipsis
  const visible = pages.filter((n) =>
    n === 1 || n === total || Math.abs(n - page) <= 2,
  );

  const buttons: (number | '…')[] = [];
  visible.forEach((n, i) => {
    if (i > 0 && n - (visible[i - 1] as number) > 1) buttons.push('…');
    buttons.push(n);
  });

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {buttons.map((b, i) =>
        b === '…' ? (
          <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={b}
            onClick={() => onPage(b as number)}
            className={`w-7 h-7 rounded text-xs transition-colors ${page === b ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {b}
          </button>
        ),
      )}
      <button
        disabled={page === total}
        onClick={() => onPage(page + 1)}
        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Product Grid ─────────────────────────────────────────────────────────────

function ProductTile({ product, onView, surplus, price }: {
  product: RawProduct; onView: (p: RawProduct) => void;
  surplus?: { price: number; currency: string };
  price?: CatalogPrice;
}) {
  const color = CAT_COLORS[product.detectedCat] ?? CAT_COLORS.other;
  const rawCat = getMaterialCategory(product.metadata);
  const displayCat = rawCat ? rawCat.replace(/_/g, ' ') : catLabel(product.detectedCat);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={onEnterOrSpace(() => onView(product))}
      onClick={() => onView(product)}
      className="dashboard-card panel-interactive group flex flex-col overflow-hidden cursor-pointer"
    >
      <div className="relative aspect-square bg-surface-sunken overflow-hidden">
        {product.imageUrl && !imgFailed ? (
          <img
            src={getOptimizedImageUrl(product.imageUrl, 'preview')}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {product.status === 'draft' && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-5" title="Not published — only your workspace sees this product.">
              Draft
            </Badge>
          )}
          {surplus && (
            <Badge variant="success" className="text-[10px] px-1.5 py-0 h-5" title="Available as surplus on the Marketplace">
              Surplus €{surplus.price}
            </Badge>
          )}
        </div>

        <div
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
        >
          <AddToMoodboardButton
            productId={product.id}
            productName={product.name}
            productImage={product.imageUrl ?? undefined}
            variant="outline"
            size="sm"
            showText={false}
            className="h-7 w-7 p-0 bg-card shadow-overlay"
          />
          <AddToQuoteButton
            productId={product.id}
            productName={product.name}
            productImage={product.imageUrl ?? undefined}
            variant="outline"
            size="sm"
            showText={false}
            className="h-7 w-7 p-0 bg-card shadow-overlay"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-[11px] capitalize truncate" style={{ color }}>{displayCat}</span>
        <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {product.name}
        </p>
        {product.factoryName !== 'Unknown' && (
          <p className="text-xs text-muted-foreground truncate">{product.factoryName}</p>
        )}

        {/* An unpriced product is an em dash with a reason on hover — never a 0, which reads as free. */}
        <div className="mt-auto pt-2 flex items-baseline justify-between gap-2 tabular-nums">
          {price?.price != null ? (
            <>
              <span className="text-sm font-semibold text-foreground">
                {price.currency === 'EUR' ? '€' : `${price.currency} `}{price.price.toFixed(2)}
                {price.discount_pct > 0 && (
                  <span className="ml-1 text-[10px] font-normal text-primary">−{price.discount_pct}%</span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {price.kind === 'your_price' ? 'Your price' : 'Retail'}
              </span>
            </>
          ) : (
            <span
              className="text-sm text-muted-foreground"
              title={price ? 'No price has been set for this product in this workspace.' : 'Price not loaded.'}
            >
              —
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const PRODUCT_GRID = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4';

function ProductGrid({ products, onView, surplus }: { products: RawProduct[]; onView: (p: RawProduct) => void; surplus?: Record<string, { price: number; currency: string }> }) {
  const [page, setPage] = useState(1);
  const { activeWorkspaceId } = useWorkspace();
  const totalPages = Math.ceil(products.length / PER_PAGE);
  const paged = products.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // The VISIBLE page only: a price is resolved per viewer through the one ladder, and
  // resolving the whole filtered list would be a per-product call for tiles nobody is looking at.
  const pagedIds = useMemo(() => paged.map((p) => p.id), [paged]);
  const { byProduct: prices } = useCatalogPrices(activeWorkspaceId, pagedIds);

  React.useEffect(() => { setPage(1); }, [products.length]);

  return (
    <div>
      <div className={PRODUCT_GRID}>
        {paged.map((p) => (
          <ProductTile key={p.id} product={p} onView={onView} surplus={surplus?.[p.id]} price={prices[p.id]} />
        ))}
      </div>
      <Pagination page={page} total={totalPages} onPage={setPage} />
    </div>
  );
}

function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={PRODUCT_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dashboard-card overflow-hidden">
          <div className="aspect-square skeleton" />
          <div className="p-3 space-y-2">
            <div className="h-2.5 w-16 skeleton rounded" />
            <div className="h-3 w-3/4 skeleton rounded" />
            <div className="h-2.5 w-1/2 skeleton rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

/**
 * The tabs this page actually renders. `activeTab` is controlled, so a value with no matching
 * <TabsContent> leaves the tab bar sitting above an empty body — indistinguishable from a page
 * that failed to load. Deep links outlive the tabs they point at: `?tab=factory` (the removed
 * Brand tab) survives in bookmarks and browser history, and `?tab=properties` arrives whenever
 * the Real Estate module is off. Both resolve to a tab that exists.
 */
const DISCOVER_TABS = ['profiles', 'products', 'marketplace', 'properties'] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

/** `#products` wins over `?tab=products`; both are accepted links. */
function requestedTab(hash: string, search: URLSearchParams): string | null {
  return hash.replace(/^#/, '') || search.get('tab');
}

function resolveTab(raw: string | null, canMarketplace: boolean, realEstate: boolean): DiscoverTab {
  const fallback: DiscoverTab = canMarketplace ? 'profiles' : 'products';
  if (!raw || !(DISCOVER_TABS as readonly string[]).includes(raw)) return fallback;
  const tab = raw as DiscoverTab;
  // Products is the only tab a non-marketplace persona gets; Properties needs the module.
  if (!canMarketplace) return 'products';
  if (tab === 'properties' && !realEstate) return fallback;
  return tab;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const DiscoverPage: React.FC = () => {
  const { user } = useAuth();
  // The catalog (Products tab) is open to anyone who reaches this page (clients building
  // moodboards/quotes included). The network-discovery tabs — Profiles, Marketplace —
  // stay marketplace-only. CapabilityGuard blocks render until permissions load, so `can` is
  // reliable here (no default-tab flicker).
  const { can } = usePermissions();
  const canMarketplace = can('marketplace.browse');
  // Properties discovery tab shows only when the platform has the Real Estate module enabled.
  const { enabled: realEstateEnabled } = useModule('real-estate');

  // Profiles
  const [creators, setCreators] = useState<PublicCreator[]>([]);

  // Products
  const [products, setProducts] = useState<RawProduct[]>([]);
  const fieldRegistry = useFieldRegistry();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Sorting is a separate control from filtering — it never belongs in the filter modal.
  const [profileSort, setProfileSort] = useState<'followers' | 'views' | 'name'>('followers');
  const [productSort, setProductSort] = useState<'name' | 'factory'>('name');
  // Controlled so a deep-link (?tab=products&factory=…) can open the right tab. Gated and
  // retired tabs coerce to one that exists — see resolveTab.
  const [activeTab, setActiveTab] = useState<DiscoverTab>(() =>
    resolveTab(requestedTab(location.hash, searchParams), canMarketplace, realEstateEnabled),
  );

  const changeTab = useCallback((tab: DiscoverTab) => {
    setActiveTab(tab);
    navigate({ search: location.search, hash: tab }, { replace: true });
  }, [navigate, location.search]);

  // Products tab has two modes: "browse" (the filterable catalog list) and "smart" (the
  // 7-vector fusion search moved here from the old /search page). `?mode=smart&q=…` deep-links
  // (Spotlight action, /search redirect, capability links) open smart mode pre-searched.
  const [productMode, setProductMode] = useState<ProductMode>(
    searchParams.get('mode') === 'smart' ? 'smart' : 'browse',
  );
  const [smartQuery, setSmartQuery] = useState<string | undefined>(searchParams.get('q') || undefined);

  // Modals
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const [loading, setLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  // product_id → cheapest active surplus listing, for the "Surplus €X" badge.
  const [surplus, setSurplus] = useState<Record<string, { price: number; currency: string }>>({});

  useEffect(() => {
    // Everyone loads the catalog (Products). Profiles + surplus badges are marketplace-only, so
    // clients don't fire those cross-tenant reads.
    const tasks: Promise<unknown>[] = [loadProducts()];
    if (canMarketplace) {
      tasks.push(loadCreators());
      marketplaceService.surplusByProduct().then(setSurplus).catch(() => setSurplus({}));
    }
    Promise.all(tasks).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMarketplace]);

  async function loadCreators() {
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, company, bio, avatar_url, location, website_url, services, skill_tags, profile_views, professional_type')
      .eq('is_public', true)
      .order('profile_views', { ascending: false })
      .limit(80);
    if (!data) return;

    const ids = data.map((p) => p.user_id);
    const { data: follows } = await supabase
      .from('user_follows').select('following_id').in('following_id', ids);

    const countMap: Record<string, number> = {};
    follows?.forEach((f) => { countMap[f.following_id] = (countMap[f.following_id] ?? 0) + 1; });

    setCreators(data.map((p) => ({
      ...p,
      services: p.services ?? [],
      skill_tags: p.skill_tags ?? [],
      follower_count: countMap[p.user_id] ?? 0,
    })));
  }

  /**
   * One row → one RawProduct. Shared by the catalog load and the smart-search fallback below so
   * the two cannot drift — a product opened from search must be the same object the grid shows.
   */
  function toRawProduct(p: any): RawProduct {
    const meta = (p.metadata ?? {}) as Record<string, any>;
    // Use shared accessor so VALENOVA-style records (manufacturer in
    // metadata.manufacturer rather than factory_group_name) are correctly
    // bucketed under their real factory.
    return {
      ...p,
      metadata: meta,
      detectedCat: detectCat(meta),
      factoryName: getManufacturer(meta) || 'Unknown',
      imageUrl: p.image_url ?? getProductImageUrl(p),
    };
  }

  async function loadProducts() {
    // search_catalogue, not `.from('products')`: the base table's RLS is workspace
    // membership, so a direct read shows a signed-up architect only their own company.
    const { data, error } = await supabase.rpc('search_catalogue', { p_limit: 300 });
    if (error) { setProductsError(error.message); return; }
    setProductsError(null);
    if (!data) return;

    setProducts(data.map(toRawProduct));
  }

  const openSeq = React.useRef(0);
  function openProduct(p: RawProduct) {
    const base = toProduct(p);
    setModalProduct(base);
    const mine = ++openSeq.current;
    productDetailService.fetch(p.id)
      .then((detail) => {
        if (!detail || mine !== openSeq.current) return;
        setModalProduct({
          ...base,
          ...(detail as unknown as Partial<Product>),
          name: detail.name || base.name,
          category: base.category,
          images: base.images,
          metadata: ((detail as { metadata?: Product['metadata'] }).metadata ?? base.metadata),
        } as Product);
      })
      .catch((e: unknown) => {
        if (mine !== openSeq.current) return;
        toast({
          title: 'Showing a summary of this product',
          description: e instanceof Error ? e.message : 'The full product record could not be read.',
          variant: 'destructive',
        });
      });
  }

  /**
   * Open a product known only by id — a smart-search hit outside the 300-row grid window.
   */
  const openProductById = useCallback(async (id: string) => {
    if (!id) return;
    const local = products.find((p) => p.id === id);
    if (local) { openProduct(local); return; }
    const { data: rows, error } = await supabase.rpc('search_catalogue', {
      p_product_id: id,
      p_limit: 1,
    });
    const data = rows?.[0];
    if (error || !data) {
      toast({
        title: 'Could not open that result',
        description: error?.message ?? 'That product is no longer available.',
        variant: 'destructive',
      });
      return;
    }
    openProduct(toRawProduct(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Deep-link: /discover?product=<id> (e.g. from a public brand page) opens that
  // product's detail modal once the catalog has loaded.
  useEffect(() => {
    const pid = searchParams.get('product');
    if (!pid || products.length === 0) return;
    const raw = products.find((p) => p.id === pid);
    if (raw) openProduct(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, products]);

  // Deep-link: /discover#<name> or /discover?tab=<name> opens that tab. The `factory` query param is a separate
  // half of the same link, consumed by `productInitial` below to seed the Products brand facet.
  // realEstateEnabled is a dep because it resolves async — ?tab=properties must survive the flip.
  useEffect(() => {
    const t = requestedTab(location.hash, searchParams);
    if (t) setActiveTab(resolveTab(t, canMarketplace, realEstateEnabled));
    const m = searchParams.get('mode');
    if (m === 'smart') setProductMode('smart');
    else if (m === 'browse') setProductMode('browse');
  }, [searchParams, location.hash, canMarketplace, realEstateEnabled]);

  const profileGroups = useMemo(() => buildProfileFilters(creators), [creators]);
  const productFacets = useMemo(
    () => productFacetFields(products, fieldRegistry.snapshot),
    [products, fieldRegistry.snapshot],
  );
  const productGroups = useMemo(
    () => buildProductFilters(products, surplus, productFacets),
    [products, surplus, productFacets],
  );

  // /discover?tab=products&factory=<name> seeds the brand facet; once the user touches the
  // filters the `pf`/`bf`/`prf` URL bag takes over.
  const productInitial = useMemo(() => {
    const f = searchParams.get('factory');
    return f ? { brand: [f] } : {};
  }, [searchParams]);

  const profileFilters = useFilters(creators, profileGroups, { urlKey: 'pf' });
  const productFilters = useFilters(products, productGroups, { urlKey: 'prf', initial: productInitial });

  const filteredProfiles = useMemo(() =>
    [...profileFilters.filtered].sort((a, b) =>
      profileSort === 'name' ? (a.full_name || '').localeCompare(b.full_name || '') :
      profileSort === 'views' ? (b.profile_views || 0) - (a.profile_views || 0) :
      (b.follower_count || 0) - (a.follower_count || 0),
    ),
    [profileFilters.filtered, profileSort],
  );

  const filteredProducts = useMemo(() =>
    [...productFilters.filtered].sort((a, b) =>
      productSort === 'factory'
        ? a.factoryName.localeCompare(b.factoryName) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    ),
    [productFilters.filtered, productSort],
  );

  return (
    <div className="min-h-full w-full">
      <PageHeader
        icon={canMarketplace ? Layers : Package}
        title={canMarketplace ? 'Discover' : 'Products'}
        subtitle={canMarketplace
          ? 'Explore profiles, materials, and marketplace listings from the community.'
          : 'Browse and search the material catalog.'}
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => changeTab(v as DiscoverTab)}>
          {/* Network-discovery tabs are marketplace-only; Products is always available. When the
              user only has Products, drop the single-tab bar entirely. */}
          {canMarketplace && (
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="profiles" className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Profiles
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Products
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="flex items-center gap-2">
                <Store className="h-4 w-4" /> Marketplace
              </TabsTrigger>
              {realEstateEnabled && (
                <TabsTrigger value="properties" className="flex items-center gap-2">
                  <Home className="h-4 w-4" /> Properties
                </TabsTrigger>
              )}
            </TabsList>
          )}

          {/* ── PROFILES ──────────────────────────────────────────────── */}
          <TabsContent value="profiles" className="mt-6 space-y-4">
            <FilterBar
              groups={profileGroups}
              values={profileFilters.values}
              onChange={profileFilters.setValues}
              previewCount={profileFilters.previewCount}
              title="Filter profiles"
              searchPlaceholder="Search by name, service, location…"
            >
              <Select value={profileSort} onValueChange={(v) => setProfileSort(v as 'followers' | 'views' | 'name')}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="followers">Most followed</SelectItem>
                  <SelectItem value="views">Most viewed</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl skeleton" />
                ))}
              </div>
            ) : filteredProfiles.length === 0 ? (
              <Empty icon={Users} text="No profiles found." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProfiles.map((creator) => (
                  <Card
                    key={creator.user_id}
                    onClick={() => setSelectedProfileId(creator.user_id)}
                    className="rounded-2xl hover:shadow-md hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer"
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12 shrink-0">
                          {creator.avatar_url && <AvatarImage src={creator.avatar_url} />}
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {initials(creator.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm truncate">{creator.full_name || 'Anonymous'}</span>
                            {creator.professional_type && (
                              <Badge className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20 shrink-0">
                                {PROFESSIONAL_TYPE_LABELS[creator.professional_type] ?? creator.professional_type}
                              </Badge>
                            )}
                          </div>
                          {creator.company && <p className="text-xs text-muted-foreground truncate">{creator.company}</p>}
                          {creator.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" /> {creator.location}
                            </p>
                          )}
                        </div>
                      </div>

                      {creator.bio && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{creator.bio}</p>
                      )}

                      {creator.services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {creator.services.slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs px-2 py-0">{s}</Badge>
                          ))}
                          {creator.services.length > 3 && (
                            <Badge variant="outline" className="text-xs px-2 py-0">+{creator.services.length - 3}</Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {!!creator.follower_count && (
                            <span>{creator.follower_count} follower{creator.follower_count !== 1 ? 's' : ''}</span>
                          )}
                          {httpUrlOrNull(creator.website_url) && (
                            <a href={httpUrlOrNull(creator.website_url)!} target="_blank" rel="noopener noreferrer"
                              className="hover:text-primary" role="presentation" onClick={(e) => e.stopPropagation()}>
                              <Globe className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div role="presentation" onClick={(e) => e.stopPropagation()}>
                          <FollowButton targetUserId={creator.user_id} currentUserId={user?.id} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── PRODUCTS ──────────────────────────────────────────────── */}
          <TabsContent value="products" className="mt-6 space-y-4">
            {/* Browse the catalog, or run the 7-vector "smart" search (text / image / color /
                texture / style / material) — both live here now that /search folded in. */}
            <HubSegmented
              aria-label="Product view"
              value={productMode}
              onChange={setProductMode}
              options={PRODUCT_MODES}
            />

            {productMode === 'smart' ? (
              <div className="space-y-3">
                <SavedSearches
                  currentQuery={smartQuery}
                  onApply={(q) => setSmartQuery(q)}
                />
                <UnifiedSearchInterface
                  key={smartQuery ?? ''}
                  initialQuery={smartQuery}
                  onMaterialSelect={openProductById}
                />
              </div>
            ) : (
              <>
                <FilterBar
                  groups={productGroups}
                  values={productFilters.values}
                  onChange={productFilters.setValues}
                  previewCount={productFilters.previewCount}
                  title="Filter materials"
                  searchPlaceholder="Search materials by name or brand…"
                >
                  <Select value={productSort} onValueChange={(v) => setProductSort(v as 'name' | 'factory')}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name A–Z</SelectItem>
                      <SelectItem value="factory">By brand</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterBar>

                {loading ? (
                  <ProductGridSkeleton />
                ) : productsError ? (
                  <Empty icon={Package} text={`The catalogue could not be loaded: ${productsError}`} />
                ) : filteredProducts.length === 0 ? (
                  <Empty icon={Package} text="No materials found." />
                ) : (
                  <ProductGrid products={filteredProducts} onView={openProduct} surplus={surplus} />
                )}
              </>
            )}
          </TabsContent>

          {/* ── MARKETPLACE (surplus / last-stock) ────────────────────── */}
          <TabsContent value="marketplace" className="mt-6">
            <MarketplaceTab />
          </TabsContent>

          {/* ── PROPERTIES (real-estate cross-workspace discovery) ── */}
          {realEstateEnabled && (
            <TabsContent value="properties" className="mt-6">
              <PropertyDiscoveryTab />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Profile modal */}
      <ProfileModal
        userId={selectedProfileId}
        onClose={() => setSelectedProfileId(null)}
      />

      {/* Product detail modal */}
      <ProductDetailModal
        product={modalProduct}
        isOpen={!!modalProduct}
        onClose={() => setModalProduct(null)}
      />
    </div>
  );
};
