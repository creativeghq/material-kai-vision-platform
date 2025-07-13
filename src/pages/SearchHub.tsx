import React from 'react';
import { SearchHub } from '@/components/Dashboard/SearchHub';

const SearchHubPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Search Hub</h1>
          <p className="text-muted-foreground">
            Multi-modal search interface with enhanced PDF knowledge integration
          </p>
        </div>
        
        <SearchHub 
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