// Mac-Spotlight-style global search. Lives at the end of the top bar (after the App
// Launcher) as a click-to-open search field, and opens app-wide on ⌘K / Ctrl+K.
// It surfaces three things in one palette: quick product matches (live from the DB),
// an action to run the full 7-vector "smart search" over materials (Discover → Products),
// and navigation to any page/app the active persona can reach.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Package, User, CornerDownLeft } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/core/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/core/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { SIDEBAR_NAV_ITEMS, filterNavItems, type SidebarNavItem } from '@/config/nav-items';
import { PRODUCT_BROWSE_ANY } from '@/auth/capabilities';
import {
  PRODUCT_IMAGE_SELECT,
  getManufacturer,
  getProductImageUrl,
  getProductName,
} from '@/utils/productMetadata';

interface ProductHit {
  id: string;
  name: string;
  img: string | null;
  brand: string | null;
}

interface GlobalSearchProps {
  /** `bar` → full search field (desktop); `icon` → icon-only trigger (mobile top bar). */
  variant?: 'bar' | 'icon';
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ variant = 'bar' }) => {
  const navigate = useNavigate();
  const { isAdmin, isPlatformOperator, isSupplierWorkspace } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isRealEstateAgent } = usePermissions();
  const { isModuleAvailable } = useEntitlements();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Product lookups + the full material search both land on Discover → Products, open to anyone
  // who works with the catalog (marketplace buyers + clients building moodboards/quotes). For
  // personas without any of those (finance-only, HR-only) we keep the palette to page navigation.
  const browseOk = PRODUCT_BROWSE_ANY.some(can);

  // ── ⌘K / Ctrl+K toggles the palette anywhere. Only one GlobalSearch mounts at a time
  //    (Sidebar renders either the desktop bar OR the mobile icon), so no double-binding. ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fresh palette on every open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setProducts([]);
    }
  }, [open]);

  // Debounced live product search.
  useEffect(() => {
    if (!open || !browseOk) return;
    const q = query.trim();
    if (q.length < 2) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    let active = true;
    setLoadingProducts(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select(`id, name, metadata, ${PRODUCT_IMAGE_SELECT}`)
        .ilike('name', `%${q}%`)
        .limit(6);
      if (!active) return;
      setProducts(
        (data ?? []).map((p: any) => ({
          id: p.id,
          name: getProductName(p),
          img: getProductImageUrl(p),
          brand: getManufacturer(p.metadata),
        })),
      );
      setLoadingProducts(false);
    }, 220);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open, browseOk]);

  // Navigation targets the active persona can reach (top bar + App Launcher), plus Profile.
  const navItems = useMemo<SidebarNavItem[]>(() => {
    const gated = filterNavItems(SIDEBAR_NAV_ITEMS, {
      isAdmin,
      isPlatformOperator,
      isSupplierWorkspace,
      isAccountant,
      isSalesRep,
      isRealEstateAgent,
      isModuleAvailable,
      can,
    });
    return [...gated, { id: 'profile', label: 'Profile', path: '/profile', icon: User }];
  }, [isAdmin, isPlatformOperator, isSupplierWorkspace, isAccountant, isSalesRep, isRealEstateAgent, isModuleAvailable, can]);

  const navMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems.slice(0, 6);
    return navItems.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 8);
  }, [navItems, query]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const trimmed = query.trim();

  return (
    <>
      {variant === 'bar' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="group hidden md:flex items-center gap-2 h-8 w-44 lg:w-56 xl:w-64 shrink-0 rounded-full border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left font-light truncate">Search…</span>
          <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <Search className="w-5 h-5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg max-w-xl top-[15%] translate-y-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search products, run a smart material search, or jump to any page.
          </DialogDescription>
          {/* shouldFilter=false: products come pre-filtered from the DB and nav is filtered by
              us, so cmdk must not second-guess which items to hide. */}
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search products, pages, actions…"
            />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>{loadingProducts ? 'Searching…' : 'No results.'}</CommandEmpty>

              {browseOk && trimmed && (
                <CommandGroup heading="Actions">
                  <CommandItem
                    value="__smart_search__"
                    onSelect={() =>
                      go(`/discover?tab=products&mode=smart&q=${encodeURIComponent(trimmed)}`)
                    }
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    <span>
                      Smart search materials for “<span className="font-medium">{trimmed}</span>”
                    </span>
                    <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </CommandItem>
                </CommandGroup>
              )}

              {browseOk && products.length > 0 && (
                <CommandGroup heading="Products">
                  {products.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`product-${p.id}`}
                      onSelect={() => go(`/discover?product=${p.id}`)}
                    >
                      <span className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                        {p.img ? (
                          <img src={p.img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground/60" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{p.name}</span>
                        {p.brand && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.brand}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {navMatches.length > 0 && (
                <CommandGroup heading="Go to">
                  {navMatches.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`nav-${item.id}`}
                      onSelect={() => go(item.path)}
                    >
                      <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};
