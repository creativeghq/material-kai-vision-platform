import React from 'react';
import { 
  Home, 
  Eye, 
  Archive, 
  Palette, 
  Grid3X3, 
  Brain, 
  Activity 
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'recognition', label: 'Recognition', icon: Eye },
  { id: 'catalog', label: 'Material Catalog', icon: Archive },
  { id: 'moodboard', label: 'MoodBoards', icon: Palette },
  { id: '3d', label: '3D Visualization', icon: Grid3X3 },
  { id: 'agents', label: 'AI Agents', icon: Brain },
  { id: 'analytics', label: 'Analytics', icon: Activity },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  return (
    <aside className="w-64 border-r bg-card min-h-screen">
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => (
          <Button
            key={item.id}
            variant={activeTab === item.id ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => onTabChange(item.id)}
          >
            <item.icon className="w-4 h-4 mr-2" />
            {item.label}
          </Button>
        ))}
      </nav>
    </aside>
  );
};