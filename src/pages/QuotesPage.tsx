import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

import { QuoteManagementSidebar } from '@/components/Quotes/QuoteManagementSidebar';

/**
 * Main Quotes Page
 * Shows the quote management sidebar for creating and managing quotes
 */
export const QuotesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const initialQuoteId = searchParams.get('quote') || undefined;

  useEffect(() => {
    // Always open sidebar when page loads
    setSidebarOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <ShoppingCart className="h-8 w-8 text-primary" />
                Quotes Cart
              </h1>
              <p className="text-muted-foreground mt-2">
                Create and manage your material quotes
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-container" style={{ marginTop: 'var(--space-xl)' }}>
        <div className="dashboard-card p-8 text-center">
          <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Manage Your Quotes</h2>
          <p className="text-muted-foreground mb-6">
            Create quotes, add products, and submit requests to suppliers
          </p>
          <p className="text-sm text-muted-foreground">
            Use the sidebar on the right to manage your quotes →
          </p>
        </div>
      </div>

      {/* Quote Management Sidebar */}
      <QuoteManagementSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        initialQuoteId={initialQuoteId}
      />
    </div>
  );
};

