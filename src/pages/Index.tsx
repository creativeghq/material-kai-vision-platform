import React, { useState } from 'react';
import { Layout } from '@/components/Layout/Layout';
import { Dashboard } from '@/components/Dashboard/Dashboard';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      default:
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} module - Coming in next steps
            </p>
          </div>
        );
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

export default Index;