import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { MetricsGrid } from './MetricsGrid';
import { RecommendedForYou } from '@/components/features/recommendations';
import styles from './Dashboard.module.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-12 gap-6">
        {/* Hero Section - Main Feature */}
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <HeroSection onNavigate={handleNavigate} />
        </div>

        {/* AI Insights / Side Stats - Bento Panel */}
        <div className="col-span-12 lg:col-span-4 glass-panel p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold mb-2">AI Insights</h3>
            <p className="text-sm text-muted-foreground mb-4">
              KAI is analyzing 2 new PDF catalogs discovered this morning. 
              Found 12 matching materials for your "Luxury Villas" project.
            </p>
          </div>
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Pro Tip</span>
            <p className="text-sm mt-1">Use the Agent Hub to compare technical specs across different manufacturers.</p>
          </div>
        </div>

        {/* Metrics Grid - Re-integrated into Bento */}
        <div className="col-span-12">
          <MetricsGrid />
        </div>

        {/* Personalized Recommendations */}
        <div className="col-span-12 mt-4">
          <h2 className="text-2xl font-bold mb-6">Recommended for You</h2>
          <RecommendedForYou limit={20} algorithm="user_user" />
        </div>
      </div>
    </div>
  );
};
