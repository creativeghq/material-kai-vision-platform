import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { LatestWidgets } from './LatestWidgets';
import { RecommendedForYou } from '@/components/features/recommendations';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="grid grid-cols-12 gap-6">
        {/* Hero Section */}
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <HeroSection onNavigate={navigate} />
        </div>

        {/* AI Insights panel */}
        <div className="col-span-12 lg:col-span-4 glass-panel p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold mb-2">AI Insights</h3>
            <p className="text-sm text-muted-foreground mb-4">
              KAI is continuously learning from new catalogs and materials added to the platform.
              Ask it anything about specs, suppliers, or design.
            </p>
          </div>
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Pro Tip</span>
            <p className="text-sm mt-1">Use the Agent Hub to compare technical specs across different manufacturers.</p>
          </div>
        </div>
      </div>

      {/* Latest content widgets */}
      <LatestWidgets />

      {/* Personalized Recommendations */}
      <div>
        <h2 className="text-xl font-light tracking-tight mb-4">Recommended for You</h2>
        <RecommendedForYou limit={20} algorithm="user_user" />
      </div>
    </div>
  );
};
