import React, { useState, useEffect } from 'react';
import { Home, Palette, Settings, MessageSquare, User, FileText, Users, BarChart3, Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { useIsMobile } from '@/hooks/use-mobile';

import { Button } from '@/components/core/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/core/ui/sheet';

const BASE_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { isFactory, isAdmin } = useFactoryRole();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigationItems = [
    ...BASE_NAV_ITEMS,
    ...(isFactory || isAdmin
      ? [{ id: 'factory-analytics', label: 'Factory Analytics', path: '/factory-analytics', icon: BarChart3 }]
      : []),
    { id: 'admin', label: 'Admin', path: '/admin', icon: Settings },
  ];

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Mobile: top bar with hamburger + sheet drawer
  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 bg-[hsl(0,0%,9%)] border-b border-white/8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-foreground/70 hover:text-foreground hover:bg-white/5">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-[hsl(0,0%,9%)] border-r border-white/8">
              <div className="flex flex-col h-full py-8 px-4">
                <div className="mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                      <span className="text-primary-foreground font-light text-lg">J</span>
                    </div>
                    <div>
                      <h2 className="font-light text-base text-foreground tracking-tight">JARVIS</h2>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-light">Platform</p>
                    </div>
                  </div>
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

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-light text-xs">J</span>
            </div>
            <span className="font-light text-sm text-foreground tracking-tight">JARVIS</span>
          </div>

          <div className="w-9" />
        </div>
        <div className="h-14 flex-shrink-0" />
      </>
    );
  }

  // Desktop: horizontal top navigation bar
  return (
    <header className="sticky top-0 z-50 h-14 flex items-center px-6 bg-[hsl(0,0%,9%)] border-b border-white/8">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 mr-8 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <span className="text-primary-foreground font-light text-sm">J</span>
        </div>
        <div className="flex flex-col">
          <span className="font-light text-sm text-foreground tracking-tight leading-tight">JARVIS</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-light leading-tight">Platform</span>
        </div>
      </Link>

      {/* Nav Items - Center */}
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

      {/* Profile - Right */}
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
    </header>
  );
};
