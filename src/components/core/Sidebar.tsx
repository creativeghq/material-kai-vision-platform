import React from 'react';
import { User, LogOut, Wrench, Eye, EyeOff, LayoutDashboard, Settings, Compass } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { useDisplayProfile } from '@/hooks/useDisplayProfile';
import { useShowPrices } from '@/hooks/useShowPrices';

import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { SIDEBAR_NAV_ITEMS, filterNavItems } from '@/config/nav-items';
import { ModuleHeaderActions } from '@/modules/_core';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { WorkspaceSwitcher } from '@/components/core/WorkspaceSwitcher';
import { AppLauncher } from '@/components/core/AppLauncher';
import { GlobalSearch } from '@/components/core/GlobalSearch';

/** Header toggle to hide/show all prices across browse surfaces (demos / material research). */
const ShowPricesToggle: React.FC = () => {
  const { showPrices, toggle } = useShowPrices();
  return (
    <button
      type="button"
      onClick={() => toggle()}
      title={showPrices ? 'Prices shown — click to hide (demo / research mode)' : 'Prices hidden — click to show'}
      aria-pressed={!showPrices}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
    >
      {showPrices ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      <span className="hidden lg:inline">{showPrices ? 'Prices' : 'Prices hidden'}</span>
    </button>
  );
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin, isPlatformOperator, isSupplierWorkspace } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isRealEstateAgent, isGuest } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const isMobile = useIsMobile();

  const profile = useDisplayProfile(user?.id);
  const fullName = profile?.fullName ?? null;
  const accountAvatar = (cls: string) => (
    <UserAvatar
      userId={user?.id}
      name={fullName}
      className={cls}
      fallbackClassName="bg-transparent"
      fallback={<User className="w-4 h-4" />}
    />
  );

  const navigationItems = filterNavItems(SIDEBAR_NAV_ITEMS, { isAdmin, isPlatformOperator, isSupplierWorkspace, isAccountant, isSalesRep, isRealEstateAgent, isGuest, isModuleAvailable, can });
  // Items marked surface:'app' render in the App Launcher, not the top bar / drawer.
  const topNav = navigationItems.filter((item) => item.surface !== 'app');

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const profileMenu = user ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Profile"
          // min-h-9/min-w-9 on mobile: the label is `hidden md:inline`, so this
          // was a 28x32 icon-only hit area for the primary account entry point.
          className={`flex min-h-9 min-w-9 items-center justify-center gap-2 px-2 py-1.5 rounded-sm text-sm transition-colors duration-100 md:min-h-0 md:min-w-0 md:px-2.5 ${
            isActive('/profile')
              ? 'bg-primary/[0.12] text-primary font-semibold'
              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
          }`}
        >
          {accountAvatar('h-5 w-5')}
          <span className="hidden md:inline">{fullName || 'Profile'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
        <DropdownMenuItem disabled className="py-3">
          {accountAvatar('mr-3 h-6 w-6')}
          <span className="flex flex-col">
            {fullName && <span className="text-sm">{fullName}</span>}
            <span className={fullName ? 'text-xs text-muted-foreground' : 'text-sm'}>{user.email}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')} className="py-3">
          <User className="mr-3 h-4 w-4" />
          <span className="text-sm">My Profile</span>
        </DropdownMenuItem>
        {/* The first-run walkthrough. It auto-opens once; this is how anyone gets back to it. */}
        <DropdownMenuItem onClick={() => navigate('/start-here')} className="py-3">
          <Compass className="mr-3 h-4 w-4" />
          <span className="text-sm">Start Here</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/portal')} className="py-3">
          <LayoutDashboard className="mr-3 h-4 w-4" />
          <span className="text-sm">Client Portal</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/tools')} className="py-3">
          <Wrench className="mr-3 h-4 w-4" />
          <span className="text-sm">Tools</span>
        </DropdownMenuItem>
        {/* Operator-only: Admin moved off the top nav into the profile menu. */}
        {isPlatformOperator && (
          <DropdownMenuItem onClick={() => navigate('/admin')} className="py-3">
            <Settings className="mr-3 h-4 w-4" />
            <span className="text-sm">Admin</span>
          </DropdownMenuItem>
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
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-sm transition-colors duration-100 ${
        isActive('/profile')
          ? 'bg-primary/[0.12] text-primary font-semibold'
          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      <User className="w-4 h-4" />
      <span>Profile</span>
    </Link>
  );

  if (isMobile) {
    // No hamburger drawer and no App Launcher here — every destination (universal
    // surfaces + the workspace's entitled apps) lives in the MobileBottomNav, so the
    // top bar is just brand + workspace/profile controls.
    return (
      <>
        <div className="mobile-topbar fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 bg-sidebar border-b border-hairline">
          <Link to="/" className="flex items-center shrink-0 min-w-0" aria-label="Home">
            <img src="/mh-logo.png" alt="materialshub" className="h-7 w-auto block dark:hidden" />
            <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
          </Link>

          <div className="flex items-center gap-0.5 shrink-0">
            <GlobalSearch variant="icon" />
            <WorkspaceSwitcher />
            <ModuleHeaderActions />
            {profileMenu}
          </div>
        </div>
        <div className="mobile-topbar-spacer flex-shrink-0" />
      </>
    );
  }

  // Desktop: horizontal top nav. Glassy so the app atmosphere reads through it.
  return (
    <header className="sticky top-0 z-40 h-12 flex items-center px-4 bg-sidebar border-b border-hairline">
      <Link to="/" className="flex items-center mr-6 flex-shrink-0">
        {/* Logo swaps with theme: dark wordmark on light nav, white wordmark on dark nav */}
        <img src="/mh-logo.png" alt="materialshub" className="h-7 w-auto block dark:hidden" />
        <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
      </Link>

      {/* Scrolls horizontally when there are more nav items than fit (e.g. the
          operator's full set on a 1280 laptop) so the right-side controls below
          are never pushed off-screen and clipped by Layout's overflow-hidden. */}
      <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {topNav.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-sm whitespace-nowrap shrink-0 transition-colors duration-100 ${
              isActive(item.path)
                ? 'bg-primary/[0.12] text-primary font-semibold'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{item.label}</span>
          </Link>
        ))}
        {/* App Launcher sits at the end of the nav row (after Discover), not in the
            right-side controls, so optional workspace apps read as part of navigation. */}
        <AppLauncher />
      </nav>

      <div className="flex items-center gap-2 shrink-0 pl-2">
        {/* Mac-style Spotlight search — sits right after the App Launcher (end of nav). */}
        <GlobalSearch variant="bar" />
        <ShowPricesToggle />
        <WorkspaceSwitcher />
        <ModuleHeaderActions />
        {profileMenu}
      </div>
    </header>
  );
};
