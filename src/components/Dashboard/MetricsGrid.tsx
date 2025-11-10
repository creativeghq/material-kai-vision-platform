import React from 'react';

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
            <div key={metric.id} className="stat-card-glass p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-white/10 backdrop-blur-sm`}>
                  <metric.icon className={`h-6 w-6 text-white`} />
                </div>
                <div className={`${
                  metric.change.startsWith('+') ? 'badge-success' : 'badge-neutral'
                }`}>
                  {metric.change}
                </div>
              </div>
              <div className="text-4xl font-bold mb-2 text-white">
                {metric.value}
              </div>
              <div className="text-sm text-white/70 font-medium">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
