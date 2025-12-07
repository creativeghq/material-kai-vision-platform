import React from 'react';
import { Search } from 'lucide-react';

import { MaterialAgentSearchInterface } from '@/components/AI/MaterialAgentSearchInterface';

const SearchHubPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header - Customer Style */}
      <div className="bg-card" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
        <div className="page-container">
          <div className="flex items-center gap-3">
            <Search className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">AI Search Hub</h1>
              <p className="text-muted-foreground">
                Intelligent material research powered by Material Agent Orchestrator
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container" style={{ paddingBottom: 'var(--space-xl)' }}>
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
  );
};

export default SearchHubPage;
