/**
 * Quality Trends Chart Component
 *
 * Displays quality metrics trends over time using a line chart.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QualityTrend } from '@/services/QualityDashboardService';

interface QualityTrendsChartProps {
  trends: QualityTrend[];
}

export const QualityTrendsChart: React.FC<QualityTrendsChartProps> = ({ trends }) => {
  const chartData = trends.map(trend => ({
    date: new Date(trend.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    overall: Math.round(trend.overall_score * 100),
    image: Math.round(trend.image_quality * 100),
    enrichment: Math.round(trend.enrichment_quality * 100),
    validation: Math.round(trend.validation_pass_rate * 100),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quality Trends (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        {/* @ts-expect-error - Recharts types have React version mismatch */}
        <ResponsiveContainer width="100%" height={300}>
          {/* @ts-expect-error - Recharts types have React version mismatch */}
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            {/* @ts-expect-error - Recharts types have React version mismatch */}
            <XAxis dataKey="date" />
            {/* @ts-expect-error - Recharts types have React version mismatch */}
            <YAxis domain={[0, 100]} />
            <Tooltip
              formatter={(value) => `${value}%`}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
              }}
            />
            {/* @ts-expect-error - Recharts types have React version mismatch */}
            <Legend />
            <Line
              type="monotone"
              dataKey="overall"
              stroke="hsl(var(--primary))"
              name="Overall Score"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="image"
              stroke="hsl(var(--accent))"
              name="Image Quality"
              strokeWidth={1}
              dot={false}
              opacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="enrichment"
              stroke="hsl(var(--secondary))"
              name="Enrichment Quality"
              strokeWidth={1}
              dot={false}
              opacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="validation"
              stroke="hsl(var(--muted-foreground))"
              name="Validation Pass Rate"
              strokeWidth={1}
              dot={false}
              opacity={0.7}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

