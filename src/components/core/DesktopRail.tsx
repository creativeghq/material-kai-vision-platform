import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useIsMobile } from '@/hooks/use-mobile';
import { SIDEBAR_NAV_ITEMS, filterNavItems } from '@/config/nav-items';

/**
 * Desktop left icon rail (2026 command-center nav). Rendered only at md+ via
 * `hidden md:flex`; mobile keeps its own top bar + bottom nav untouched. The
 * same nav items as the old horizontal top nav, as icons with tooltips; the
 * top-bar controls (workspace switcher, module actions, profile) live in the
 * slim top bar rendered by Sidebar's desktop branch.
 */
export const DesktopRail: React.FC = () => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep } = usePermissions();
  const { isModuleAvailable } = useEntitlements();

  const items = filterNavItems(SIDEBAR_NAV_ITEMS, {
    isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, isModuleAvailable, can,
  });

  // Mobile keeps its own top bar + bottom nav — the rail is desktop-only, gated
  // by the SAME hook as Sidebar so there's never a size where both nav shells show.
  if (isMobile) return null;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="flex relative z-40 w-[68px] shrink-0 flex-col items-center gap-1 py-4 bg-sidebar/70 backdrop-blur-xl border-r border-white/8">
      {/* Brand mark */}
      <Link to="/" aria-label="Home" className="mb-3 shrink-0">
        <div className="w-10 h-10 rounded-xl shadow-lg shadow-primary/20" style={{ background: 'var(--brand-gradient)' }} />
      </Link>

      {/* Nav icons */}
      <nav className="flex-1 flex flex-col items-center gap-1 w-full overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.id}
              to={item.path}
              title={item.label}
              aria-label={item.label}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              {active && (
                <span className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-primary" aria-hidden="true" />
              )}
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
