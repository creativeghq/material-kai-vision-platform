import React, { useState } from 'react';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 overflow-x-hidden">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 bg-gradient-to-br from-transparent to-accent/5 overflow-x-hidden">
          <div className="w-full h-full p-6 pt-6 pr-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
