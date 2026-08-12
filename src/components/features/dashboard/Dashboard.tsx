import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { LatestWidgets } from './LatestWidgets';
import { MyOffice } from './MyOffice';
import { RecentActivity } from './RecentActivity';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Search-first work surface */}
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <HeroSection onNavigate={navigate} />
        </div>

        {/* My Office — greeting, the four operational blocks (orders / quotes /
            finance / customers, each with its breakdown and a way in), quick
            access, and KAI live insights. Per-workspace. */}
        <MyOffice />
      </div>

      {/* What actually moved lately, merged across orders, quotes and CRM. Sits
          above the "latest content" widgets because it is workspace-specific:
          your orders before the platform's newest materials. */}
      <RecentActivity />

      {/* Latest content across the platform (generated areas) */}
      <LatestWidgets />
    </div>
  );
};
