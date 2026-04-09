import React from 'react';

import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative h-screen overflow-hidden flex flex-col">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col page-wrapper">
        {children}
      </main>
    </div>
  );
};
