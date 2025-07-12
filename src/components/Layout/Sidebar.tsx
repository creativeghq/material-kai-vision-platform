import React from 'react';
import { 
  Home, 
  Eye, 
  Archive, 
  Palette, 
  Grid3X3, 
  Brain, 
  Activity,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'recognition', label: 'Recognition', path: '/recognition', icon: Eye },
  { id: 'catalog', label: 'Material Catalog', path: '/catalog', icon: Archive },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: '3d', label: '3D Visualization', path: '/3d', icon: Grid3X3 },
  { id: 'agents', label: 'AI Agents', path: '/agents', icon: Brain },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: Activity },
  { id: 'admin', label: 'Admin Panel', path: '/admin', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 border-r bg-card min-h-screen">
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => (
          <Button
            key={item.id}
            variant={isActive(item.path) ? 'default' : 'ghost'}
            className="w-full justify-start"
            asChild
          >
            <Link to={item.path}>
              <item.icon className="w-4 h-4 mr-2" />
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>
    </aside>
  );
};