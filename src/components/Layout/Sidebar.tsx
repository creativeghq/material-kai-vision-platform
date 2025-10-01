import React from 'react';
import {
  Home,
  Palette,
  Settings,
  Box,
  ScanText,
  Search,
  Globe,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/button';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'search', label: 'Search Hub', path: '/search-hub', icon: Search },
  { id: 'pdf', label: 'PDF Upload', path: '/pdf-processing', icon: ScanText },

  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: '3d', label: '3D Designer', path: '/3d', icon: Box },
  { id: 'scraper', label: 'Web Scraper', path: '/scraper', icon: Globe },
  { id: 'admin', label: 'Admin Panel', path: '/admin', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const router = useRouter();

  const isActive = (path: string) => {
    if (path === '/') return router.pathname === '/';
    return router.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 border-r bg-card min-h-screen">
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => (
          <Button
            key={item.id}
            className={`w-full justify-start ${
              isActive(item.path)
                ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                : 'bg-transparent hover:bg-accent hover:text-accent-foreground'
            }`}
            asChild
          >
            <Link href={item.path}>
              <item.icon className="w-4 h-4 mr-2" />
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>
    </aside>
  );
};
