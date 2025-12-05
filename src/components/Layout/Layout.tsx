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
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area - Warm beige background */}
      <div className="flex-1 flex flex-col bg-card">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="flex-1 overflow-x-hidden">
          <div className="w-full h-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
