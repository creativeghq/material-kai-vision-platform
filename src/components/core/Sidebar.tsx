import React, { useState, useEffect } from 'react';
import { Home, Palette, Settings, MessageSquare, User, ChevronRight, ChevronLeft, FileText, Users, BarChart3, Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { useIsMobile } from '@/hooks/use-mobile';

import { Button } from '@/components/core/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
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
  { id: 'quotes', label: 'Quotes Cart', path: '/quotes', icon: FileText },
];

const SIDEBAR_STORAGE_KEY = 'kai-sidebar-expanded';

const NavItems: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const location = useLocation();
  const { isFactory, isAdmin } = useFactoryRole();

  const navigationItems = [
    ...BASE_NAV_ITEMS,
    ...(isFactory || isAdmin
      ? [{ id: 'factory-analytics', label: 'Factory Analytics', path: '/factory-analytics', icon: BarChart3 }]
      : []),
    { id: 'admin', label: 'Admin Panel', path: '/admin', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {navigationItems.map((item) => (
        <Button
          key={item.id}
          variant="ghost"
          className={`w-full justify-start px-4 h-14 rounded-2xl transition-all duration-300 ${
            isActive(item.path)
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] ring-1 ring-[hsl(var(--amber)/0.5)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-[hsl(var(--amber)/0.25)]'
          }`}
          asChild
        >
          <Link to={item.path} className="flex items-center justify-start" onClick={onNavigate}>
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="ml-3 font-light tracking-tight">{item.label}</span>
          </Link>
        </Button>
      ))}
      <Button
        variant="ghost"
        className={`w-full justify-start px-4 h-14 rounded-2xl transition-all duration-300 border border-transparent hover:border-white/20 ${
          location.pathname === '/profile'
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] ring-1 ring-[hsl(var(--amber)/0.5)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`}
        asChild
      >
        <Link to="/profile" className="flex items-center justify-start" onClick={onNavigate}>
          <User className="w-5 h-5 flex-shrink-0" />
          <span className="ml-3 font-light tracking-tight">Profile</span>
        </Link>
      </Button>
    </>
  );
};

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
    { id: 'admin', label: 'Admin Panel', path: '/admin', icon: Settings },
  ];

  // Initialize from localStorage - default to expanded (true)
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : true;
  });

  // Persist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isExpanded));
  }, [isExpanded]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Mobile: sticky top bar with hamburger + sheet drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4 glass-panel border-b border-white/20 shadow-md">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 glass-panel border-r border-white/20">
              <div className="flex flex-col h-full py-8 px-4">
                <div className="mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-[hsl(var(--amber)/0.45)]">
                      <span className="text-primary-foreground font-light text-xl">J</span>
                    </div>
                    <div>
                      <h2 className="font-light text-lg text-sidebar-foreground tracking-tight">JARVIS Platform</h2>
                      <p className="text-xs text-muted-foreground/80 uppercase tracking-widest font-light">Intelligence</p>
                    </div>
                  </div>
                </div>
                <nav className="flex-1 flex flex-col space-y-3">
                  <NavItems onNavigate={() => setMobileOpen(false)} />
                </nav>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <span className="text-primary-foreground font-light text-sm">J</span>
            </div>
            <span className="font-light text-sm text-foreground tracking-tight">JARVIS Platform</span>
          </div>

          <div className="w-10" /> {/* spacer to balance hamburger */}
        </div>
        {/* Spacer to push content below the fixed top bar */}
        <div className="h-16 flex-shrink-0" />
      </>
    );
  }

  // Desktop: original sidebar
  return (
    <aside
      className={`min-h-screen flex flex-col py-8 transition-all duration-500 m-4 rounded-[2.5rem] glass-panel shadow-2xl ${
        isExpanded ? 'w-72' : 'w-24'
      }`}
    >
      {/* Logo/Brand and Toggle */}
      <div className={`mb-10 px-4 flex flex-col ${!isExpanded ? 'items-center' : ''}`}>
        <div className="flex items-center justify-between w-full">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-[hsl(var(--amber)/0.45)] transition-transform hover:scale-105 hover:ring-[hsl(var(--amber)/0.7)] active:scale-95">
            <span className="text-primary-foreground font-light text-xl">J</span>
          </div>
          {isExpanded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-9 w-9 text-sidebar-foreground hover:bg-secondary"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
        </div>
        {isExpanded && (
          <div className="mt-4">
            <h2 className="font-light text-lg text-sidebar-foreground tracking-tight">JARVIS Platform</h2>
            <p className="text-xs text-muted-foreground/80 uppercase tracking-widest font-light">Intelligence</p>
          </div>
        )}
      </div>

      {/* Navigation Icons */}
      <TooltipProvider>
        <nav className={`flex-1 flex flex-col space-y-3 px-4 ${!isExpanded ? 'items-center' : ''}`}>
          {navigationItems.map((item) => (
            <Tooltip key={item.id} delayDuration={isExpanded ? 99999 : 300}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={`${isExpanded ? 'w-full justify-start px-4' : 'w-14 px-0 justify-center'} h-14 rounded-2xl transition-all duration-300 ${
                    isActive(item.path)
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] ring-1 ring-[hsl(var(--amber)/0.5)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-[hsl(var(--amber)/0.25)]'
                  }`}
                  asChild
                >
                  <Link to={item.path} className={`flex items-center ${isExpanded ? 'justify-start' : 'justify-center'}`}>
                    <item.icon className={`${isExpanded ? 'w-5 h-5 flex-shrink-0' : 'w-6 h-6'}`} />
                    {isExpanded && <span className="ml-3 font-light tracking-tight">{item.label}</span>}
                  </Link>
                </Button>
              </TooltipTrigger>
              {!isExpanded && (
                <TooltipContent side="right" className="rounded-xl">
                  <p>{item.label}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>

      {/* User Profile at Bottom */}
      <div className={`px-4 mt-auto mb-2 flex flex-col ${!isExpanded ? 'items-center' : ''}`}>
        {!isExpanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="w-14 h-14 rounded-2xl text-sidebar-foreground hover:bg-white/40 mb-4 border border-transparent hover:border-white/20 transition-all duration-300"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}

        <TooltipProvider>
          <Tooltip delayDuration={isExpanded ? 99999 : 300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={`h-14 rounded-2xl transition-all duration-300 ${isExpanded ? 'w-full justify-start px-4' : 'w-14 px-0 justify-center'} border border-transparent hover:border-white/20 group ${
                  isActive('/profile')
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] ring-1 ring-[hsl(var(--amber)/0.5)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                asChild
              >
                <Link to="/profile" className={`flex items-center ${isExpanded ? 'justify-start' : 'justify-center'}`}>
                  <User className="w-5 h-5 flex-shrink-0" />
                  {isExpanded && <span className="ml-3 font-light tracking-tight">Profile</span>}
                </Link>
              </Button>
            </TooltipTrigger>
            {!isExpanded && (
              <TooltipContent side="right" className="rounded-xl font-light z-[200]">
                <p>User Profile</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
};
