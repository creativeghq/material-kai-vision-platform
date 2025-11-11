import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeroSection } from './HeroSection';
import { MetricsGrid } from './MetricsGrid';
import styles from './Dashboard.module.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className={styles.container}>
      {/* Hero Section with Headline and CTAs */}
      <HeroSection onNavigate={handleNavigate} />

      {/* Enhanced System Metrics */}
      <MetricsGrid />
    </div>
  );
};
