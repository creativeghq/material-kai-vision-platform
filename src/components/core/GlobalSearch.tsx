// Mac-Spotlight-style global search. Lives at the end of the top bar (after the App
// Launcher) as a click-to-open search field, and opens app-wide on ⌘K / Ctrl+K.
//
// It is a GENERAL search: people, CRM parties, deals, products, projects, quotes, orders,
// invoices and properties come back from one `global_search` round trip (RLS-scoped), alongside
// navigation to any page the active persona can reach.
//
// Order in this list is not cosmetic. cmdk highlights the first item, so whatever renders first
// is what Enter opens. Real results therefore come FIRST, best match at the top, and the deep
// material search is an explicitly-labelled action pinned to the BOTTOM. It used to be the only
// item in the palette for any query that was not a product name — so searching for a colleague
// silently ran a material search and dropped you in the product catalogue.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, User, Package, CornerDownLeft } from 'lucide-react';

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
import { Badge } from '@/components/core/ui/badge';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { HUBS, SIDEBAR_NAV_ITEMS, filterNavItems, type SidebarNavItem } from '@/config/nav-items';
import { PRODUCT_BROWSE_ANY } from '@/auth/capabilities';
import {
  allowedSearchKinds,
  attachProductImages,
  globalSearch,
  groupHits,
  MIN_QUERY_LENGTH,
  type GlobalSearchGroup,
  type GlobalSearchHit,
} from '@/services/globalSearchService';

interface GlobalSearchProps {
  /** `bar` → full search field (desktop); `icon` → icon-only trigger (mobile top bar). */
  variant?: 'bar' | 'icon';
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ variant = 'bar' }) => {
  const navigate = useNavigate();
  const { isAdmin, isPlatformOperator, isSupplierWorkspace } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isRealEstateAgent, isWorkspaceManager } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const { activeWorkspaceId } = useWorkspace();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [searching, setSearching] = useState(false);

  // The deep 7-vector material search lands on Discover → Products, so it is offered to anyone
  // who works with the catalog (marketplace buyers + clients building moodboards/quotes).
  const browseOk = PRODUCT_BROWSE_ANY.some(can);

  // Only the kinds this persona actually has a surface for — a result that opens onto a
  // permission wall is its own broken process.
  const kinds = useMemo(
    () => allowedSearchKinds({ can, isModuleAvailable, isWorkspaceManager }),
    [can, isModuleAvailable, isWorkspaceManager],
  );

  const routeCtx = useMemo(
    () => ({ isPlatformOperator, isWorkspaceManager }),
    [isPlatformOperator, isWorkspaceManager],
  );

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
      setGroups([]);
    }
  }, [open]);

  // Debounced cross-entity search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setGroups([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const hits = await globalSearch(activeWorkspaceId, q, kinds);
        const withImages = await attachProductImages(hits);
        if (!active) return;
        setGroups(groupHits(withImages));
      } catch {
        // A failed search shows "No results", never a blank palette or a thrown dialog.
        if (active) setGroups([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 220);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open, activeWorkspaceId, kinds]);

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

  /**
   * Navigation, grouped.
   *
   * With a query it is one flat list of matches (label OR description, so "invoice" finds Finance).
   * With no query it is the persona's WHOLE reachable surface, grouped the way the App Launcher
   * groups it — an open palette should be a way to get anywhere, not a six-item teaser of a
   * thirty-eight-item nav.
   */
  const navGroups = useMemo<{ key: string; heading: string; items: SidebarNavItem[] }[]>(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const matches = navItems.filter(
        (i) => i.label.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q),
      );
      return matches.length ? [{ key: 'go', heading: 'Go to', items: matches.slice(0, 10) }] : [];
    }

    const top = navItems.filter((i) => (i.surface ?? 'top') === 'top');
    const groups = top.length ? [{ key: 'top', heading: 'Go to', items: top }] : [];
    for (const hub of HUBS) {
      const items = navItems.filter((i) => i.surface === 'app' && i.hub === hub.id);
      if (items.length) groups.push({ key: hub.id, heading: hub.label, items });
    }
    // Apps with no hub — the launcher's catch-all bucket. Same convention here.
    const more = navItems.filter((i) => i.surface === 'app' && !i.hub);
    if (more.length) groups.push({ key: 'more', heading: 'More', items: more });
    return groups;
  }, [navItems, query]);

  /**
   * What Enter opens — driven from the DATA, not left to cmdk.
   *
   * Source order alone is not enough, and this is the original bug's last hiding place. Results
   * arrive AFTER the 220 ms debounce, so for a moment the only rendered item is the Actions group;
   * cmdk selects it, and it KEEPS that selection when the results prepend. Measured in the real
   * app: searching "tsatsos" left the highlight on "Ask the agent" with the person sitting two
   * rows above it, so Enter still did not open the thing the user typed. Re-pointing the selection
   * whenever the top row changes is the fix; the escalation action is the target only when there
   * is genuinely nothing else.
   */
  const topValue = useMemo(() => {
    const firstHit = groups[0]?.hits[0];
    if (firstHit) return `${groups[0].spec.kind}-${firstHit.id}`;
    const firstNav = navGroups[0]?.items[0];
    if (firstNav) return `nav-${firstNav.id}`;
    return query.trim() ? '__ask_agent__' : '';
  }, [groups, navGroups, query]);

  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(topValue), [topValue]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const openHit = (group: GlobalSearchGroup, hit: GlobalSearchHit) => {
    go(group.spec.route(hit, routeCtx));
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
            Search people, customers, records and products, or jump to any page.
          </DialogDescription>
          {/* shouldFilter=false: results come pre-filtered from the DB and nav is filtered by
              us, so cmdk must not second-guess which items to hide. */}
          <Command
            value={selected}
            onValueChange={setSelected}
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search people, customers, records, products, pages…"
            />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>{searching ? 'Searching…' : 'No results.'}</CommandEmpty>

              {/* Records first, best match at the top — this is what Enter opens. */}
              {groups.map((group) => (
                <CommandGroup key={group.spec.kind} heading={group.spec.label}>
                  {group.hits.map((hit) => (
                    <CommandItem
                      key={`${group.spec.kind}-${hit.id}`}
                      value={`${group.spec.kind}-${hit.id}`}
                      onSelect={() => openHit(group, hit)}
                    >
                      <span className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken">
                        {hit.imageUrl ? (
                          <img src={hit.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <group.spec.icon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{hit.title}</span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      {hit.badge && (
                        <Badge variant="neutral" className="ml-2 shrink-0">
                          {hit.badge}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {navGroups.map((group) => (
                <CommandGroup key={group.key} heading={group.heading}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`nav-${item.id}`}
                      onSelect={() => go(item.path)}
                    >
                      <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {item.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {/* Last, and each named after where it goes.
                  This palette answers LOOKUPS — a name, a title, a number — instantly and
                  deterministically. A question ("unpaid invoices over 5k", "who supplied the
                  tiles") is not a lookup, and the agent is where it belongs. Escalation is a
                  choice the user makes here rather than a model turn charged to every keystroke:
                  routing the whole palette through the agent would trade a ~50 ms answer for a
                  multi-second one and an LLM call per search. */}
              {trimmed && (
                <CommandGroup heading="Actions">
                  <CommandItem
                    value="__ask_agent__"
                    onSelect={() => go(`/agent-hub?q=${encodeURIComponent(trimmed)}`)}
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    <span>
                      Ask the agent about “<span className="font-medium">{trimmed}</span>”
                    </span>
                    <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </CommandItem>
                  {browseOk && (
                    <CommandItem
                      value="__smart_search__"
                      onSelect={() =>
                        go(`/discover?tab=products&mode=smart&q=${encodeURIComponent(trimmed)}`)
                      }
                    >
                      <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>
                        Deep material search for “<span className="font-medium">{trimmed}</span>” in
                        Discover
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};
