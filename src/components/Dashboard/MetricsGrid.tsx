import React from 'react';
import { Card } from '@/components/ui/card';
import styles from './Dashboard.module.css';
import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  return (
    <div className={styles.metricsSection}>
      <div className={styles.metricsContainer}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{metricsConfig.sectionHeader.title}</h3>
          <p className={styles.sectionDescription}>{metricsConfig.sectionHeader.description}</p>
        </div>
        
        <div className={styles.metricsGrid}>
          {metricsConfig.metrics.map((metric: Metric) => (
            <Card key={metric.id} className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <metric.icon className={`h-6 w-6 ${metric.iconColor} mr-2`} />
                <div className={`${styles.metricValue} ${styles[metric.valueColor]}`}>
                  {metric.value}
                </div>
              </div>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricChange}>{metric.change}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};