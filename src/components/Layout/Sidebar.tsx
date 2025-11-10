import React, { useState, useEffect } from 'react';
import { Home, Palette, Settings, Box, Search, MessageSquare, User, ChevronRight, ChevronLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: '3d', label: '3D Designer', path: '/3d', icon: Box },
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
      className={`border-r border-sidebar-border bg-sidebar-background min-h-screen flex flex-col py-6 transition-all duration-300 shadow-xl ${
        isExpanded ? 'w-72' : 'w-20'
      }`}
    >
      {/* Logo/Brand and Toggle */}
      <div className="mb-8 px-4">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-primary-foreground font-bold text-xl">K</span>
          </div>
          {isExpanded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
        </div>
        {isExpanded && (
          <div className="mt-3">
            <h2 className="font-bold text-base text-sidebar-foreground">KAI Platform</h2>
            <p className="text-sm text-sidebar-foreground/60">Material Intelligence</p>
          </div>
        )}
      </div>

      {/* Navigation Icons */}
      <TooltipProvider>
        <nav className="flex-1 flex flex-col space-y-2 px-3">
          {navigationItems.map((item) => (
            <Tooltip key={item.id} delayDuration={isExpanded ? 99999 : 300}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={`${isExpanded ? 'w-full justify-start' : 'w-14'} h-14 rounded-2xl transition-all duration-200 ${
                    isActive(item.path)
                      ? 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`}
                  asChild
                >
                  <Link to={item.path}>
                    <item.icon className={`${isExpanded ? 'w-5 h-5' : 'w-6 h-6'}`} />
                    {isExpanded && <span className="ml-4 font-medium">{item.label}</span>}
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

      {/* Expand Button (when collapsed) */}
      {!isExpanded && (
        <div className="px-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="w-14 h-14 rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* User Profile at Bottom */}
      <TooltipProvider>
        <Tooltip delayDuration={isExpanded ? 99999 : 300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className={`${isExpanded ? 'w-full justify-start mx-3' : 'w-14 mx-auto'} h-14 rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent`}
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              {isExpanded && (
                <div className="ml-4 text-left">
                  <p className="text-sm font-semibold text-sidebar-foreground">Profile</p>
                  <p className="text-xs text-sidebar-foreground/60">Settings</p>
                </div>
              )}
            </Button>
          </TooltipTrigger>
          {!isExpanded && (
            <TooltipContent side="right" className="rounded-xl">
              <p>Profile</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </aside>
  );
};
