import React from 'react';

import { MaterialAgentSearchInterface } from '@/components/AI/MaterialAgentSearchInterface';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

const SearchHubPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="AI Search Hub"
        description="Intelligent material research powered by Material Agent Orchestrator"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Search Hub' },
        ]}
      />
      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <MaterialAgentSearchInterface
            onMaterialSelect={(materialId) => {
              console.log('Material selected:', materialId);
              window.location.href = `/catalog?material=${materialId}`;
            }}
            onNavigateToMoodboard={() => {
              window.location.href = '/moodboard';
            }}
            onNavigateTo3D={() => {
              window.location.href = '/3d';
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SearchHubPage;
