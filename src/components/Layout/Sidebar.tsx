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

  // Initialize from localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : false;
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
      className={`border-r bg-sidebar-background min-h-screen flex flex-col py-4 transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* Logo/Brand and Toggle */}
      <div className="mb-6 px-3">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">K</span>
          </div>
          {isExpanded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        {isExpanded && (
          <div className="mt-2">
            <h2 className="font-semibold text-sm">KAI Platform</h2>
            <p className="text-xs text-muted-foreground">Material Intelligence</p>
          </div>
        )}
      </div>

      {/* Navigation Icons */}
      <TooltipProvider>
        <nav className="flex-1 flex flex-col space-y-2 px-2">
          {navigationItems.map((item) => (
            <Tooltip key={item.id} delayDuration={isExpanded ? 99999 : 300}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={`${isExpanded ? 'w-full justify-start' : 'w-12'} h-12 rounded-lg ${
                    isActive(item.path)
                      ? 'bg-primary/10 text-primary border-l-2 border-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                  asChild
                >
                  <Link to={item.path}>
                    <item.icon className="w-5 h-5" />
                    {isExpanded && <span className="ml-3">{item.label}</span>}
                  </Link>
                </Button>
              </TooltipTrigger>
              {!isExpanded && (
                <TooltipContent side="right">
                  <p>{item.label}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>

      {/* Expand Button (when collapsed) */}
      {!isExpanded && (
        <div className="px-2 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="w-12 h-12 rounded-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* User Profile at Bottom */}
      <TooltipProvider>
        <Tooltip delayDuration={isExpanded ? 99999 : 300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className={`${isExpanded ? 'w-full justify-start mx-2' : 'w-12 mx-auto'} h-12 rounded-lg`}
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              {isExpanded && (
                <div className="ml-3 text-left">
                  <p className="text-sm font-medium">Profile</p>
                  <p className="text-xs text-muted-foreground">Settings</p>
                </div>
              )}
            </Button>
          </TooltipTrigger>
          {!isExpanded && (
            <TooltipContent side="right">
              <p>Profile</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </aside>
  );
};
