import React from 'react';

import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  // Cycle through bubble colors (cyan, green, blue, purple) - Reference dashboard style
  const bubbleColors = ['cyan', 'green', 'blue', 'purple'];

  return (
    <div style={{
      paddingLeft: 'var(--page-padding-x)',
      paddingRight: 'var(--page-padding-x)',
      paddingBottom: 'var(--space-xl)'
    }}>
      <div className="w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--grid-gap)' }}>
          {metricsConfig.metrics.map((metric: Metric, index: number) => {
            const colorClass = bubbleColors[index % bubbleColors.length];

            return (
              <div
                key={metric.id}
                className={`stat-bubble ${colorClass} transition-all duration-200 hover:scale-105`}
                style={{ padding: 'var(--card-padding)' }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
                  {/* Icon with subtle background */}
                  <div
                    className="flex items-center justify-center bg-white/10"
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: 'var(--radius-lg)'
                    }}
                  >
                    <metric.icon className="h-5 w-5 text-white" />
                  </div>
                  {/* Badge with muted colors - NO GREEN */}
                  <div
                    className={`font-medium ${
                      metric.change.startsWith('+') ? 'bg-white/20' :
                      metric.change.startsWith('-') ? 'bg-white/10' :
                      'bg-white/15'
                    }`}
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: 'var(--space-xs) calc(var(--space-xs) * 2)',
                      borderRadius: 'var(--radius-full)',
                      color: 'hsl(var(--bubble-text))'
                    }}
                  >
                    {metric.change}
                  </div>
                </div>
                {/* White text on colored bubble */}
                <div
                  className="font-bold"
                  style={{
                    fontSize: 'var(--text-4xl)',
                    marginBottom: 'var(--space-xs)',
                    color: 'hsl(var(--bubble-text))'
                  }}
                >
                  {metric.value}
                </div>
                <div
                  className="font-medium"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'hsl(var(--bubble-text-muted))'
                  }}
                >
                  {metric.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
