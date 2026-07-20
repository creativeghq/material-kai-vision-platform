import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal, User } from 'lucide-react';

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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { MobileInstallButton } from './MobileInstallButton';

/** Number of destinations shown directly in the bar; the rest fall under "More". */
const BAR_SLOTS = 4;

/**
 * Native-style mobile bottom tab bar (mobile only — hidden ≥ md).
 *
 * Surfaces the highest-priority destinations within thumb reach and routes the
 * long tail through a "More" bottom sheet. Gating is identical to the desktop
 * top nav and the drawer (shared {@link filterNavItems}), so all three surfaces
 * always agree on what the active persona can see.
 */
export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const navItems = useMemo(
    () =>
      // Every gated destination (universal top-bar surfaces + the workspace's entitled
      // apps) lives in the bottom bar on mobile: the priority set fills the bar, the rest
      // — including surface:'app' modules — fall under "More". The mobile top bar keeps no
      // hamburger/App Launcher, so this is the single mobile navigation surface.
      filterNavItems(SIDEBAR_NAV_ITEMS, {
        isFactory,
        isAdmin,
        isPlatformOperator,
        isAccountant,
        isSalesRep,
        isModuleAvailable,
        can,
      }),
    [isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, isModuleAvailable, can],
  );

  // Order the visible items by bottom-nav priority, then split into bar + overflow.
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

  // "More" is highlighted when the current route lives behind it (overflow or profile).
  const moreActive =
    overflowItems.some((i) => isActive(i.path)) || location.pathname.startsWith('/profile');

  if (!user) return null;

  return (
    <>
      <nav
        aria-label="Primary"
        // z-40, NOT z-50: dialogs/overlays (Radix + the agent's custom pickers)
        // all sit at z-50 and the nav is painted after <main>, so at equal z it
        // covered the bottom ~56px of every modal on mobile.
        className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-40 md:hidden bg-sidebar/95 backdrop-blur-lg border-t border-white/8"
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
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                moreActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-6 w-12 items-center justify-center rounded-full transition-colors ${
                  moreActive ? 'bg-primary/15' : 'bg-transparent'
                }`}
              >
                <MoreHorizontal className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={moreActive ? 2.2 : 1.8} />
              </span>
              <span className={`text-[10px] leading-none ${moreActive ? 'font-normal' : 'font-light'}`}>More</span>
            </button>
          </li>
        </ul>
        {/* Safe-area cushion so the bar clears the iOS home indicator. */}
        <div className="mobile-safe-bottom" />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        {/* The overflow list is unbounded (every entitled app lands here), so the
            sheet scrolls rather than growing past the viewport. 3 columns at
            390px = ~118px cells, enough for two-word labels ("Email Marketing",
            "Interior Design") that were being mangled in 4 columns. */}
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-sidebar border-t border-white/8 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-base font-light">Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-1.5 pt-2 sm:grid-cols-4">
            {overflowItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[76px] min-w-0 flex-col items-center justify-start gap-1.5 rounded-xl px-1 py-3 text-center transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="line-clamp-2 text-[11px] leading-tight font-light break-words">{item.label}</span>
                </Link>
              );
            })}
            <Link
              to="/profile"
              onClick={() => setMoreOpen(false)}
              aria-current={location.pathname.startsWith('/profile') ? 'page' : undefined}
              className={`flex min-h-[76px] min-w-0 flex-col items-center justify-start gap-1.5 rounded-xl px-1 py-3 text-center transition-colors ${
                location.pathname.startsWith('/profile')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <User className="w-5 h-5 flex-shrink-0" />
              <span className="line-clamp-2 text-[11px] leading-tight font-light break-words">Profile</span>
            </Link>
          </div>
          <MobileInstallButton onDone={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
};
