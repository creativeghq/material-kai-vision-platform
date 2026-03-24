import React from 'react';

import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative min-h-screen overflow-x-hidden flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col page-wrapper md:pt-4">
        <main className="flex-1 overflow-x-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};
