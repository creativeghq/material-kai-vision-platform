import React from 'react';

import { Sidebar } from './Sidebar';
import { DesktopRail } from './DesktopRail';
import { MobileBottomNav } from './MobileBottomNav';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    // Desktop (md+): left icon rail + content column (flex-row). Mobile: the
    // rail returns null and this is a plain column — Sidebar's mobile top bar
    // and the MobileBottomNav are unchanged.
    <div className="relative h-screen overflow-hidden flex flex-col md:flex-row">
      {/* Command-center atmosphere — brand aurora + film grain behind every page. */}
      <div className="app-aurora" aria-hidden="true" />
      <div className="app-grain" aria-hidden="true" />
      <DesktopRail />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <Sidebar />
        {/* `mobile-content` reserves room for the fixed bottom tab bar (mobile only).
            `relative z-10` lifts page content above the fixed atmosphere. */}
        <main className="relative z-10 flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col page-wrapper mobile-content">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};
