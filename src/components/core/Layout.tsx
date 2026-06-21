import React from 'react';

import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative h-screen overflow-hidden flex flex-col">
      <Sidebar />
      {/* `mobile-content` reserves room for the fixed bottom tab bar (mobile only). */}
      <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col page-wrapper mobile-content">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
};
