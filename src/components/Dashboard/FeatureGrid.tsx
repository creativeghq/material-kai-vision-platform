import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import styles from './Dashboard.module.css';
import { featuresConfig, type FeatureCard } from './dashboardData';

interface FeatureGridProps {
  onNavigate: (path: string) => void;
}

export const FeatureGrid: React.FC<FeatureGridProps> = ({ onNavigate }) => {
  return (
    <div className={styles.mainSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{featuresConfig.sectionHeader.title}</h2>
        <p className={styles.sectionDescription}>
          {featuresConfig.sectionHeader.description}
        </p>
      </div>

      <div className={styles.featuresGrid}>
        {featuresConfig.cards.map((card: FeatureCard) => (
          <Card
            key={card.id}
            className={styles.featureCard}
            onClick={() => onNavigate(card.path)}
          >
            <CardHeader className="pb-4">
              <div className={styles.featureHeader}>
                <div className={`${styles.featureIconWrapper} ${styles[card.iconColor]}`}>
                  <card.icon className="h-8 w-8" />
                </div>
                <span className={styles.featureBadge}>{card.badge}</span>
              </div>
              <CardTitle className={styles.featureTitle}>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.featureDescription}>
                {card.description}
              </p>
              <div className={`${styles.featureAction} ${styles[card.action.color]}`}>
                <card.action.icon className="h-4 w-4 mr-2" />
                {card.action.text}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
