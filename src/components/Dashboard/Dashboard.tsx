import React from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchHub } from './SearchHub';
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
      {/* Enhanced System Metrics */}
      <MetricsGrid />

      {/* Main Search Interface */}
      <div className={styles.mainSection}>
        <SearchHub
          onMaterialSelect={searchHubConfig.onMaterialSelect}
          onNavigateToMoodboard={() => handleNavigate('/moodboard')}
          onNavigateTo3D={() => handleNavigate('/3d')}
        />
      </div>
    </div>
  );
};
