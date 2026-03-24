import React from 'react';

import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative h-screen overflow-hidden flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-0 page-wrapper pt-16 md:pt-4">
        <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};
