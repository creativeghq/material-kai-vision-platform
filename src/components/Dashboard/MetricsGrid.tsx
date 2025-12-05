import React from 'react';

import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  // Cycle through bubble colors (purple, orange, yellow, default)
  const bubbleColors = ['purple', 'orange', 'yellow', ''];

  return (
    <div className="py-12 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricsConfig.metrics.map((metric: Metric, index: number) => {
            const colorClass = bubbleColors[index % bubbleColors.length];

            return (
              <div
                key={metric.id}
                className={`stat-bubble ${colorClass} p-6 transition-all duration-200 hover:scale-105`}
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
            );
          })}
        </div>
      </div>
    </div>
  );
};
