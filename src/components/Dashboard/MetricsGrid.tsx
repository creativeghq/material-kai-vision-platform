import React from 'react';

import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  return (
    <div className="py-12 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricsConfig.metrics.map((metric: Metric) => (
            <div
              key={metric.id}
              className="p-6 rounded-[20px] transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--glass-shadow)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                {/* Mocha-colored icon background */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--mocha-color)' }}
                >
                  <metric.icon className="h-5 w-5 text-foreground/70" />
                </div>
                {/* Badge with proper colors */}
                <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                  metric.change.startsWith('+') ? 'bg-green-500/20 text-green-700' :
                  metric.change.startsWith('-') ? 'bg-red-500/20 text-red-700' :
                  'bg-gray-500/20 text-gray-700'
                }`}>
                  {metric.change}
                </div>
              </div>
              {/* Dark text on glass card */}
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
