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
      filterNavItems(SIDEBAR_NAV_ITEMS, {
        isFactory,
        isAdmin,
        isPlatformOperator,
        isAccountant,
        isSalesRep,
        isModuleAvailable,
        can,
      })
        // #251 — surface:'app' items live in the App Launcher (mobile top bar), not the bottom bar.
        .filter((i) => i.surface !== 'app'),
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
        className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-50 md:hidden bg-sidebar/95 backdrop-blur-lg border-t border-white/8"
      >
        <ul className="grid h-14" style={{ gridTemplateColumns: `repeat(${barItems.length + 1}, minmax(0, 1fr))` }}>
          {barItems.map((item) => {
            const active = isActive(item.path);
            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-full flex-col items-center justify-center gap-0.5 transition-colors ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                      style={{ background: 'var(--brand-gradient)' }}
                    />
                  )}
                  <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                  <span className="text-[10px] leading-none font-light max-w-full truncate px-0.5">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 transition-colors ${
                moreActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {moreActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                  style={{ background: 'var(--brand-gradient)' }}
                />
              )}
              <MoreHorizontal className="w-5 h-5 flex-shrink-0" strokeWidth={moreActive ? 2.2 : 1.8} />
              <span className="text-[10px] leading-none font-light">More</span>
            </button>
          </li>
        </ul>
        {/* Safe-area cushion so the bar clears the iOS home indicator. */}
        <div className="mobile-safe-bottom" />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl bg-sidebar border-t border-white/8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base font-light">Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 pt-2">
            {overflowItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 px-1 text-center transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-[11px] leading-tight font-light">{item.label}</span>
                </Link>
              );
            })}
            <Link
              to="/profile"
              onClick={() => setMoreOpen(false)}
              aria-current={location.pathname.startsWith('/profile') ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 px-1 text-center transition-colors ${
                location.pathname.startsWith('/profile')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <User className="w-5 h-5 flex-shrink-0" />
              <span className="text-[11px] leading-tight font-light">Profile</span>
            </Link>
          </div>
          <MobileInstallButton onDone={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
};
