import React from 'react';

import { Button } from '@/components/ui/button';

import styles from './Dashboard.module.css';
import { heroConfig, type HeroAction } from './dashboardData';

interface HeroSectionProps {
  onNavigate: (path: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  return (
    <div className={styles.heroSection}>
      <div className={styles.heroBackground} />
      <div className={styles.heroContent}>
        <div className={styles.heroFloating}>
          <div className={styles.heroBadge}>
            <heroConfig.badge.icon className="h-4 w-4" />
            {heroConfig.badge.text}
          </div>
        </div>

        <h1 className={styles.heroTitle}>
          {heroConfig.title}
          <br />
          <span className={styles.heroSubtitle}>{heroConfig.subtitle}</span>
        </h1>

        <p className={styles.heroDescription}>
          {heroConfig.description}
        </p>

        <div className={styles.heroActions}>
          {heroConfig.actions.map((action: HeroAction, index: number) => (
            <Button
              key={index}
              className={action.type === 'primary' ? styles.primaryButton : styles.outlineButton}
              onClick={() => onNavigate(action.path)}
            >
              <action.icon className="mr-2 h-5 w-5" />
              {action.text}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
