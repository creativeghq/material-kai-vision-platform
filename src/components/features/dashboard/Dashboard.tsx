import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { LatestWidgets } from './LatestWidgets';
import { MyOffice } from './MyOffice';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Search-first work surface */}
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <HeroSection onNavigate={navigate} />
        </div>

        {/* My Office — greeting + personal numbers (finance/projects/tasks/inbox)
            + KAI live insights, all in one command panel (per-workspace, cached). */}
        <MyOffice />
      </div>

      {/* Latest content across the platform (generated areas) */}
      <LatestWidgets />
    </div>
  );
};
