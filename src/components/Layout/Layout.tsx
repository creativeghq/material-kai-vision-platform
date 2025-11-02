import React, { useState } from 'react';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Fixed gradient background behind everything */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-accent/5 -z-10" />

      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden">
          <div className="w-full h-full p-6 pt-6 pr-8">{children}</div>
        </main>
      </div>
    </div>
  );
};
