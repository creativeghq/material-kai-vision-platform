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
                {/* Mocha-colored icon background */}
                <div className="stat-icon-mocha">
                  <metric.icon className="h-5 w-5 text-foreground/70" />
                </div>
                {/* Badge with proper colors */}
                <div className={`${
                  metric.change.startsWith('+') ? 'badge-success' :
                  metric.change.startsWith('-') ? 'badge-error' : 'badge-neutral'
                }`}>
                  {metric.change}
                </div>
              </div>
              {/* Dark text on white card */}
              <div className="text-4xl font-bold mb-2 text-foreground">
                {metric.value}
              </div>
              <div className="text-sm text-muted-foreground font-medium">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
