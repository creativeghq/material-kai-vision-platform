import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  SIDEBAR_NAV_ITEMS,
  BOTTOM_NAV_PRIORITY,
  filterNavItems,
  type SidebarNavItem,
} from '@/config/nav-items';
import { MobileAppsMenu } from './MobileAppsMenu';

/** Number of destinations shown directly in the bar; everything else is reached through Apps. */
const BAR_SLOTS = 4;

/**
 * Native-style mobile bottom tab bar (mobile only — hidden ≥ md).
 *
 * Surfaces the highest-priority destinations within thumb reach; the fifth cell opens the Apps
 * panel (MobileAppsMenu), which is the phone's version of the desktop Apps launcher — the same
 * hubs, the same apps, the same inner links. Gating is identical to the desktop top nav (shared
 * {@link filterNavItems}), so the bar, the panel and the desktop always agree on what the active
 * persona can see.
 */
export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin, isPlatformOperator, isSupplierWorkspace } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isRealEstateAgent } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the panel whenever the route changes — including a query-only change, since a section
  // link inside one app (?tab=ar → ?tab=ap) is a navigation too.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const navItems = useMemo(
    () =>
      filterNavItems(SIDEBAR_NAV_ITEMS, {
        isAdmin,
        isPlatformOperator,
        isSupplierWorkspace,
        isAccountant,
        isSalesRep,
        isRealEstateAgent,
        isModuleAvailable,
        can,
      }),
    [isAdmin, isPlatformOperator, isSupplierWorkspace, isAccountant, isSalesRep, isRealEstateAgent, isModuleAvailable, can],
  );

  // Order the visible items by bottom-nav priority; the first BAR_SLOTS fill the bar.
  const ordered = useMemo(() => {
    const byId = new Map(navItems.map((i) => [i.id, i]));
    const ranked: SidebarNavItem[] = [];
    for (const id of BOTTOM_NAV_PRIORITY) {
      const item = byId.get(id);
      if (item) {
        ranked.push(item);
        byId.delete(id);
      }
    }
    // Any items not covered by the priority list keep their original order.
    for (const item of navItems) if (byId.has(item.id)) ranked.push(item);
    return ranked;
  }, [navItems]);

  const barItems = ordered.slice(0, BAR_SLOTS);
  const overflowItems = ordered.slice(BAR_SLOTS);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // "Apps" lights up when the current route lives behind it and NOT in the bar. The second half
  // matters: six launcher apps live on /agent-hub?capability=…, whose pathname is the bar's own
  // Agent Hub cell, so a prefix test alone lit both cells on every studio page.
  const barHit = barItems.some((i) => isActive(i.path));
  const menuActive =
    !barHit && (overflowItems.some((i) => isActive(i.path)) || location.pathname.startsWith('/profile'));

  if (!user) return null;

  return (
    <>
      <nav
        aria-label="Primary"
        // z-40, NOT z-50: dialogs/overlays (Radix + the agent's custom pickers)
        // all sit at z-50 and the nav is painted after <main>, so at equal z it
        // covered the bottom ~56px of every modal on mobile.
        className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-40 md:hidden bg-sidebar/95 backdrop-blur-lg border-t border-hairline"
      >
        {/* Each cell keeps a full-width tap target (thumb reach) but its VISUAL
            weight is constrained to a centred pill, so a 5-across bar reads
            tight instead of four small glyphs floating in 78px columns. The
            active state is that pill filling in — a top hairline is a top-tab
            affordance and looked out of place on a bottom bar. */}
        <ul className="grid h-14" style={{ gridTemplateColumns: `repeat(${barItems.length + 1}, minmax(0, 1fr))` }}>
          {barItems.map((item) => {
            const active = isActive(item.path);
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <span
                    className={`flex h-6 w-12 items-center justify-center rounded-full transition-colors ${
                      active ? 'bg-primary/15' : 'bg-transparent'
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  <span
                    className={`max-w-full truncate text-[10px] leading-none ${
                      active ? 'font-normal' : 'font-light'
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className={`flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                menuActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-6 w-12 items-center justify-center rounded-full transition-colors ${
                  menuActive ? 'bg-primary/15' : 'bg-transparent'
                }`}
              >
                <LayoutGrid className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={menuActive ? 2.2 : 1.8} />
              </span>
              <span className={`text-[10px] leading-none ${menuActive ? 'font-normal' : 'font-light'}`}>Apps</span>
            </button>
          </li>
        </ul>
        {/* Safe-area cushion so the bar clears the iOS home indicator. */}
        <div className="mobile-safe-bottom" />
      </nav>

      <MobileAppsMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
};
