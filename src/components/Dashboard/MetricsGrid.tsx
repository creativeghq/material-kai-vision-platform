import React from 'react';

import { metricsConfig, type Metric } from './dashboardData';

const getBubbleColor = (valueColor: string) => {
  switch (valueColor) {
    case 'primary':
      return 'hsl(var(--bubble-yellow))';
    case 'blue':
      return 'hsl(var(--bubble-blue))';
    case 'purple':
      return 'hsl(var(--bubble-purple))';
    case 'green':
      return 'hsl(var(--bubble-green))';
    case 'orange':
      return 'hsl(var(--bubble-orange))';
    default:
      return 'hsl(var(--bubble-yellow))';
  }
};

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
                background: getBubbleColor(metric.valueColor),
                boxShadow: 'var(--shadow-sm)',
                border: 'none',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                {/* Icon with subtle background */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/50">
                  <metric.icon className="h-5 w-5 text-foreground" />
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
              {/* Dark text on colored bubble */}
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
