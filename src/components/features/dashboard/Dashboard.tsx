import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { LatestWidgets } from './LatestWidgets';
import { MyOffice } from './MyOffice';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 sm:space-y-10">
      {/* Command center first: greeting, quick actions, headline metrics, the one
          mesh surface, then the Activities panel. Numbers lead the page — the old
          order opened on a 400px search hero, so the state of the business was
          below the fold on every laptop. */}
      <div className="grid grid-cols-12 gap-6 items-stretch">
        <MyOffice />
      </div>

      {/* Search-first work surface */}
      <HeroSection onNavigate={navigate} />

      {/* Latest content across the platform (generated areas) */}
      <LatestWidgets />
    </div>
  );
};
