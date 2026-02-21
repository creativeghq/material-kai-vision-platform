import React, { useState, useEffect } from 'react';
import { Home, Palette, Settings, MessageSquare, User, ChevronRight, ChevronLeft, FileText } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: 'quotes', label: 'Quotes Cart', path: '/quotes', icon: FileText },
  { id: 'admin', label: 'Admin Panel', path: '/admin', icon: Settings },
];

const SIDEBAR_STORAGE_KEY = 'kai-sidebar-expanded';

export const Sidebar: React.FC = () => {
  const location = useLocation();

  // Initialize from localStorage - default to expanded (true)
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : true;
  });

  // Persist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isExpanded));
  }, [isExpanded]);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={`min-h-screen flex flex-col py-8 transition-all duration-500 m-4 rounded-[2.5rem] glass-panel shadow-2xl ${
        isExpanded ? 'w-72' : 'w-24'
      }`}
    >
      {/* Logo/Brand and Toggle */}
      <div className={`mb-10 px-4 flex flex-col ${!isExpanded ? 'items-center' : ''}`}>
        <div className="flex items-center justify-between w-full">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95">
            <span className="text-primary-foreground font-light text-xl">K</span>
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
            <h2 className="font-light text-lg text-sidebar-foreground tracking-tight">KAI Platform</h2>
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
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/40 border border-transparent hover:border-white/20'
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
                className={`h-16 rounded-2xl transition-all duration-300 ${isExpanded ? 'w-full justify-start px-3' : 'w-14 px-0'} text-sidebar-foreground hover:bg-white/40 border border-transparent hover:border-white/20 group ${
                  isActive('/profile')
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]'
                    : ''
                }`}
                asChild
              >
                <Link to="/profile">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shadow-inner group-hover:bg-primary/25 transition-colors">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  {isExpanded && (
                    <div className="ml-4 text-left">
                      <p className="text-sm font-light text-foreground tracking-tight">Profile</p>
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-light">Settings</p>
                    </div>
                  )}
                </Link>
              </Button>
            </TooltipTrigger>
            {!isExpanded && (
              <TooltipContent side="right" className="rounded-xl font-light">
                <p>User Profile</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
};
