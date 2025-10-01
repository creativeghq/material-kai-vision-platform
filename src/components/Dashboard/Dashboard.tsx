import React from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchHub } from './SearchHub';
import { HeroSection } from './HeroSection';
import { FeatureGrid } from './FeatureGrid';
import { MetricsGrid } from './MetricsGrid';
import styles from './Dashboard.module.css';
import { searchHubConfig } from './dashboardData';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <HeroSection onNavigate={handleNavigate} />

      {/* Main Search Interface */}
      <div className={styles.mainSection}>
        <SearchHub
          onMaterialSelect={searchHubConfig.onMaterialSelect}
          onNavigateToMoodboard={() => handleNavigate('/moodboard')}
          onNavigateTo3D={() => handleNavigate('/3d')}
        />
      </div>

      {/* Feature Cards */}
      <FeatureGrid onNavigate={handleNavigate} />

      {/* Enhanced System Metrics */}
      <MetricsGrid />
    </div>
  );
};
