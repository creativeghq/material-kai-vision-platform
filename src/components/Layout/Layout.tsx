import React, { useState } from 'react';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="relative min-h-screen overflow-x-hidden flex">
      {/* Sidebar - Dark theme */}
      <Sidebar />

      {/* Main Content Area - Dark page background */}
      <div className="flex-1 flex flex-col page-wrapper">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="flex-1 overflow-x-hidden">
          {/* Consistent page container with max-width and padding */}
          <div className="page-container">{children}</div>
        </main>
      </div>
    </div>
  );
};
