import React from 'react';
import { Home, Palette, Settings, Box, Search, MessageSquare, User } from 'lucide-react';
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

export const Sidebar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-16 border-r bg-sidebar-background min-h-screen flex flex-col items-center py-4">
      {/* Logo/Brand */}
      <div className="mb-6">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-lg">K</span>
        </div>
      </div>

      {/* Navigation Icons */}
      <TooltipProvider>
        <nav className="flex-1 flex flex-col items-center space-y-2">
          {navigationItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`w-12 h-12 rounded-lg ${
                    isActive(item.path)
                      ? 'bg-primary/10 text-primary border-l-2 border-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                  asChild
                >
                  <Link to={item.path}>
                    <item.icon className="w-5 h-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>

      {/* User Profile at Bottom */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12 rounded-full mt-auto"
            >
              <User className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Profile</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </aside>
  );
};
