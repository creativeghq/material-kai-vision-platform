import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { LatestWidgets } from './LatestWidgets';
import { MyOverview } from './MyOverview';
import { DashboardAiInsights } from './DashboardAiInsights';
import { RecommendedForYou } from '@/components/features/recommendations';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
      <div className="grid grid-cols-12 gap-6">
        {/* Hero Section */}
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <HeroSection onNavigate={navigate} />
        </div>

        {/* AI Insights panel — real, generated per workspace, cached 15 days */}
        <DashboardAiInsights />
      </div>

      {/* Personal quick overview — finance, projects, tasks, inbox */}
      <MyOverview />

      {/* Personalized Recommendations — before the platform-generated areas */}
      <div>
        <h2 className="text-xl font-light tracking-tight mb-4">Recommended for You</h2>
        <RecommendedForYou limit={20} algorithm="user_user" />
      </div>

      {/* Latest content across the platform (generated areas) */}
      <LatestWidgets />
    </div>
  );
};
