import React from 'react';

import { Card } from '@/components/ui/card';

import styles from './Dashboard.module.css';
import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  return (
    <div className="py-12 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h3 className="text-3xl font-bold text-foreground mb-2">
            {metricsConfig.sectionHeader.title}
          </h3>
          <p className="text-lg text-muted-foreground">
            {metricsConfig.sectionHeader.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricsConfig.metrics.map((metric: Metric) => (
            <Card key={metric.id} className="modern-card p-6 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-2xl ${metric.iconColor} bg-opacity-10`}>
                  <metric.icon className={`h-6 w-6 ${metric.iconColor}`} />
                </div>
                <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                  metric.change.startsWith('+') ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}>
                  {metric.change}
                </div>
              </div>
              <div className={`text-4xl font-bold mb-2 ${metric.valueColor}`}>
                {metric.value}
              </div>
              <div className="text-sm text-muted-foreground font-medium">{metric.label}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
