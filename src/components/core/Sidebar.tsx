import React, { useState, useEffect } from 'react';
import { User, Menu, LogOut } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { SIDEBAR_NAV_ITEMS, type SidebarNavItem } from '@/config/nav-items';
import { useEnabledModules, ModuleHeaderActions } from '@/modules/_core';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { WorkspaceSwitcher } from '@/components/core/WorkspaceSwitcher';

function filterNavItems(
  items: readonly SidebarNavItem[],
  ctx: { isFactory: boolean; isAdmin: boolean; isPlatformOperator: boolean; enabledSlugs: Set<string> },
): SidebarNavItem[] {
  return items.filter((item) => {
    if (item.requirePlatform && !ctx.isPlatformOperator) return false;
    if (item.requireRole === 'factory' && !(ctx.isFactory || ctx.isAdmin)) return false;
    if (item.requireRole === 'admin' && !ctx.isAdmin) return false;
    if (item.moduleSlug && !ctx.enabledSlugs.has(item.moduleSlug)) return false;
    return true;
  });
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { enabledSlugs } = useEnabledModules();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigationItems = filterNavItems(SIDEBAR_NAV_ITEMS, { isFactory, isAdmin, isPlatformOperator, enabledSlugs });

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
