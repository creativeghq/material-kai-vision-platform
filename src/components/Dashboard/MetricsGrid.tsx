import React from 'react';

import { metricsConfig, type Metric } from './dashboardData';

export const MetricsGrid: React.FC = () => {
  return (
    <div style={{
      paddingLeft: 'var(--page-padding-x)',
      paddingRight: 'var(--page-padding-x)',
      paddingBottom: 'var(--space-xl)'
    }}>
      <div className="w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--grid-gap)' }}>
          {metricsConfig.metrics.map((metric: Metric) => {
            return (
              <div
                key={metric.id}
                className="dashboard-card transition-all duration-200 hover:shadow-md"
                style={{ padding: 'var(--card-padding)' }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
                  {/* Icon with sage green background */}
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'hsl(var(--primary) / 0.1)'
                    }}
                  >
                    <metric.icon className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  {/* Change badge with proper contrast */}
                  <div
                    className="font-medium"
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: 'var(--space-xs) calc(var(--space-xs) * 2)',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: metric.change.startsWith('+')
                        ? 'hsl(142 71% 95%)'
                        : metric.change.startsWith('-')
                        ? 'hsl(0 70% 95%)'
                        : 'hsl(0 0% 95%)',
                      color: metric.change.startsWith('+')
                        ? 'hsl(142 71% 35%)'
                        : metric.change.startsWith('-')
                        ? 'hsl(0 70% 45%)'
                        : 'hsl(0 0% 40%)'
                    }}
                  >
                    {metric.change}
                  </div>
                </div>
                {/* Value with dark text */}
                <div
                  style={{
                    fontSize: 'var(--text-4xl)',
                    fontWeight: 'var(--font-semibold)',
                    marginBottom: 'var(--space-xs)',
                    color: 'hsl(var(--foreground))'
                  }}
                >
                  {metric.value}
                </div>
                {/* Label with muted text */}
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-normal)',
                    color: 'hsl(var(--muted-foreground))'
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
