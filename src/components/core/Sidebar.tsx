import React, { useState, useEffect } from 'react';
import { User, Menu, LogOut, BookOpen, ExternalLink } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import type { Capability } from '@/auth/capabilities';
import { useIsMobile } from '@/hooks/use-mobile';
import { SIDEBAR_NAV_ITEMS, type SidebarNavItem } from '@/config/nav-items';
import { ModuleHeaderActions } from '@/modules/_core';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Button } from '@/components/core/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/core/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { WorkspaceSwitcher } from '@/components/core/WorkspaceSwitcher';

function filterNavItems(
  items: readonly SidebarNavItem[],
  ctx: { isFactory: boolean; isAdmin: boolean; isPlatformOperator: boolean; isAccountant: boolean; isSalesRep: boolean; isModuleAvailable: (slug: string) => boolean; can: (c: Capability) => boolean },
): SidebarNavItem[] {
  return items.filter((item) => {
    // Scoped invited roles see a focused subset only (overrides the gates below).
    if (ctx.isAccountant) return item.id === 'dashboard' || item.id === 'finance';
    if (ctx.isSalesRep) return item.id === 'dashboard' || item.id === 'quotes';
    if (item.requirePlatform && !ctx.isPlatformOperator) return false;
    // Factory analytics is for verified factories only — not dealers/operators.
    if (item.requireRole === 'factory' && !ctx.isFactory) return false;
    if (item.requireRole === 'admin' && !ctx.isAdmin) return false;
    // #195 capability gate (the unified persona model — drives end-user restriction).
    if (item.requireCapability && !ctx.can(item.requireCapability)) return false;
    // #212 entitlement gate — hide a paid module unless the active workspace owns it.
    // isModuleAvailable already folds in platform-enabled (the access RPC only returns enabled
    // modules) + free baseline tiers + per-workspace entitlement, and fails OPEN while loading.
    if (item.moduleSlug && !ctx.isModuleAvailable(item.moduleSlug)) return false;
    return true;
  });
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigationItems = filterNavItems(SIDEBAR_NAV_ITEMS, { isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, isModuleAvailable, can });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const profileMenu = user ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
            isActive('/profile')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          }`}
        >
          <User className="w-4 h-4" />
          <span className="font-light">Profile</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
        <DropdownMenuItem disabled className="py-3">
          <User className="mr-3 h-4 w-4" />
          <span className="text-sm">{user.email}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')} className="py-3">
          <User className="mr-3 h-4 w-4" />
          <span className="text-sm">My Profile</span>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-light">API Documentation</DropdownMenuLabel>
            <DropdownMenuItem asChild className="py-3">
              <a href="/api/edge-swagger.html" target="_blank" rel="noopener noreferrer">
                <BookOpen className="mr-3 h-4 w-4" />
                <span className="text-sm flex-1">Edge API — Swagger</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="py-3">
              <a href="/api/openapi-edge.json" target="_blank" rel="noopener noreferrer">
                <BookOpen className="mr-3 h-4 w-4" />
                <span className="text-sm flex-1">Edge API — OpenAPI JSON</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="py-3">
              <a href="https://v1api.materialshub.gr/docs" target="_blank" rel="noopener noreferrer">
                <BookOpen className="mr-3 h-4 w-4" />
                <span className="text-sm flex-1">Core API — Swagger</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="py-3 text-destructive focus:text-destructive"
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span className="text-sm">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Link
      to="/profile"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
        isActive('/profile')
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      <User className="w-4 h-4" />
      <span className="font-light">Profile</span>
    </Link>
  );

  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-white/8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-foreground/70 hover:text-foreground hover:bg-white/5">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-sidebar border-r border-white/8">
              <div className="flex flex-col h-full py-8 px-4">
                <div className="mb-8">
                  <img src="/mh-logo.png" alt="materialshub" className="h-8 w-auto block dark:hidden" />
                  <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-8 w-auto hidden dark:block" />
                </div>
                <nav className="flex-1 flex flex-col space-y-1">
                  {navigationItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                        isActive(item.path)
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-light">{item.label}</span>
                    </Link>
                  ))}
                </nav>
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    isActive('/profile')
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span className="font-light">Profile</span>
                </Link>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center">
            <img src="/mh-logo.png" alt="materialshub" className="h-7 w-auto block dark:hidden" />
            <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
          </div>

          <div className="flex items-center gap-1">
            <WorkspaceSwitcher />
            <ModuleHeaderActions />
            {profileMenu}
          </div>
        </div>
        <div className="h-14 flex-shrink-0" />
      </>
    );
  }

  return (
    <header className="sticky top-0 z-50 h-14 flex items-center px-6 bg-sidebar border-b border-white/8">
      <Link to="/" className="flex items-center mr-8 flex-shrink-0">
        {/* Logo swaps with theme: dark wordmark on light nav, white wordmark on dark nav */}
        <img src="/mh-logo.png" alt="materialshub" className="h-8 w-auto block dark:hidden" />
        <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-8 w-auto hidden dark:block" />
      </Link>

      <nav className="flex items-center gap-1 flex-1">
        {navigationItems.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
              isActive(item.path)
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-light">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <WorkspaceSwitcher />
        <ModuleHeaderActions />
        {profileMenu}
      </div>
    </header>
  );
};
