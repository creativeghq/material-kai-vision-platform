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
      {/* Sidebar - White background with dark icons (SugarCRM style) */}
      <Sidebar />

      {/* Main Content Area - Light gray page background (#F0F0F0) */}
      <div className="flex-1 flex flex-col page-wrapper">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="flex-1 overflow-x-hidden">
          <div className="w-full h-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
