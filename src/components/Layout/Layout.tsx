import React, { useState } from 'react';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 bg-gradient-to-br from-transparent to-accent/5">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
