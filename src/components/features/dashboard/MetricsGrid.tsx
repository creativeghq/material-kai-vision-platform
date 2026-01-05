import React, { useEffect, useState } from 'react';
import { Database, Target, TrendingUp, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MetricData {
  id: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: string;
  label: string;
  change: string;
  loading?: boolean;
}

export const MetricsGrid: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricData[]>([
    {
      id: 'documents',
      icon: Database,
      value: '0',
      label: 'Documents Processed',
      change: 'Loading...',
      loading: true,
    },
    {
      id: 'products',
      icon: Target,
      value: '0',
      label: 'Products Extracted',
      change: 'Loading...',
      loading: true,
    },
    {
      id: 'chunks',
      icon: TrendingUp,
      value: '0',
      label: 'Knowledge Chunks',
      change: 'Loading...',
      loading: true,
    },
    {
      id: 'embeddings',
      icon: Shield,
      value: '0',
      label: 'AI Embeddings',
      change: 'Loading...',
      loading: true,
    },
  ]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Fetch documents count
        const { count: documentsCount } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true });

        // Fetch products count
        const { count: productsCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true });

        // Fetch chunks count
        const { count: chunksCount } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true });

        // Fetch embeddings count
        const { count: embeddingsCount } = await supabase
          .from('embeddings')
          .select('*', { count: 'exact', head: true });

        // Format numbers with commas
        const formatNumber = (num: number | null) => {
          if (num === null) return '0';
          return num.toLocaleString();
        };

        setMetrics([
          {
            id: 'documents',
            icon: Database,
            value: formatNumber(documentsCount),
            label: 'Documents Processed',
            change: 'Total in system',
            loading: false,
          },
          {
            id: 'products',
            icon: Target,
            value: formatNumber(productsCount),
            label: 'Products Extracted',
            change: 'Total in system',
            loading: false,
          },
          {
            id: 'chunks',
            icon: TrendingUp,
            value: formatNumber(chunksCount),
            label: 'Knowledge Chunks',
            change: 'Total in system',
            loading: false,
          },
          {
            id: 'embeddings',
            icon: Shield,
            value: formatNumber(embeddingsCount),
            label: 'AI Embeddings',
            change: 'Total in system',
            loading: false,
          },
        ]);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setMetrics((prev) =>
          prev.map((m) => ({ ...m, change: 'Error loading', loading: false })),
        );
      }
    };

    fetchMetrics();
  }, []);

  return (
    <div style={{
      paddingLeft: 'var(--page-padding-x)',
      paddingRight: 'var(--page-padding-x)',
      paddingBottom: 'var(--space-xl)',
    }}>
      <div className="w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--grid-gap)' }}>
          {metrics.map((metric) => {
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
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                      backgroundColor: metric.loading ? 'hsl(0 0% 95%)' : 'hsl(142 71% 95%)',
                      color: metric.loading ? 'hsl(0 0% 40%)' : 'hsl(142 71% 35%)',
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
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {metric.value}
                </div>
                {/* Label with muted text */}
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-normal)',
                    color: 'hsl(var(--muted-foreground))',
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
