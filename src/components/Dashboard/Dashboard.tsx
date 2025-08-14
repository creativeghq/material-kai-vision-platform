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

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <HeroSection onNavigate={navigate} />

      {/* Main Search Interface */}
      <div className={styles.mainSection}>
        <SearchHub
          onMaterialSelect={searchHubConfig.onMaterialSelect}
          onNavigateToMoodboard={() => navigate('/moodboard')}
          onNavigateTo3D={() => navigate('/3d')}
        />
      </div>

      {/* Feature Cards */}
      <FeatureGrid onNavigate={navigate} />

      {/* Enhanced System Metrics */}
      <MetricsGrid />
    </div>
  );
};