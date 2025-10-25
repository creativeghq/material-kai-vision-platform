/**
 * React hooks for Knowledge Base Admin API endpoints
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface MetadataResponse {
  workspace_id: string;
  metadata: {
    chunks?: any[];
    images?: any[];
    products?: any[];
  };
  summary: {
    total_entities: number;
    entities_with_metadata: number;
    metadata_fields: string[];
  };
}

interface QualityScoresResponse {
  workspace_id: string;
  kpis: {
    chunks?: any;
    images?: any;
    products?: any;
    documents?: any;
  };
  distributions: {
    chunks?: any;
    images?: any;
    products?: any;
  };
  trends?: any;
}

interface EmbeddingsStatsResponse {
  workspace_id: string;
  total_embeddings: number;
  by_type: Record<string, number>;
  by_model: Record<string, number>;
  by_embedding_type?: Record<string, number>;
  coverage: {
    chunks: { total: number; with_embeddings: number; coverage_percentage: string };
    images: { total: number; with_embeddings: number; coverage_percentage: string };
    products: { total: number; with_embeddings: number; coverage_percentage: string };
  };
  document_vectors?: any;
  quality?: any;
}

interface DetectionsResponse {
  workspace_id: string;
  total_detections: number;
  detections: any[];
  summary: {
    by_type: Record<string, number>;
    by_event: Record<string, number>;
    avg_confidence: number;
    high_confidence_count: number;
    low_confidence_count: number;
  };
  timeline?: Record<string, number>;
}

interface QualityDashboardResponse {
  workspace_id: string;
  period: {
    start_date: string;
    end_date: string;
    days: number;
  };
  current_kpis: any;
  trends: any;
  daily_metrics: any[];
  alerts: any[];
}

interface PatternsResponse {
  workspace_id: string;
  patterns: any[];
  anomalies: any[];
  summary: {
    total_patterns: number;
    total_anomalies: number;
    high_severity_count: number;
    medium_severity_count: number;
    low_severity_count: number;
  };
}

/**
 * Hook to fetch metadata from all entities
 */
export const useKnowledgeBaseMetadata = (workspaceId: string | null, entityType?: string) => {
  const [data, setData] = useState<MetadataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchMetadata = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (entityType) params.append('entity_type', entityType);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-metadata?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch metadata');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, [workspaceId, entityType, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

/**
 * Hook to fetch quality scores
 */
export const useQualityScores = (workspaceId: string | null) => {
  const [data, setData] = useState<QualityScoresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchQualityScores = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-quality-scores?workspace_id=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch quality scores');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQualityScores();
  }, [workspaceId, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

/**
 * Hook to fetch embeddings statistics
 */
export const useEmbeddingsStats = (workspaceId: string | null) => {
  const [data, setData] = useState<EmbeddingsStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchEmbeddingsStats = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-embeddings-stats?workspace_id=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch embeddings stats');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmbeddingsStats();
  }, [workspaceId, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

/**
 * Hook to fetch detection events
 */
export const useDetections = (
  workspaceId: string | null,
  detectionType?: string,
  startDate?: string,
  endDate?: string
) => {
  const [data, setData] = useState<DetectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchDetections = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (detectionType) params.append('detection_type', detectionType);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-detections?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch detections');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetections();
  }, [workspaceId, detectionType, startDate, endDate, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

/**
 * Hook to fetch quality dashboard
 */
export const useQualityDashboard = (workspaceId: string | null, days: number = 30) => {
  const [data, setData] = useState<QualityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchDashboard = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-quality-dashboard?workspace_id=${workspaceId}&days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch quality dashboard');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [workspaceId, days, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

/**
 * Hook to fetch patterns and insights
 */
export const usePatterns = (workspaceId: string | null) => {
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchPatterns = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-kb-patterns?workspace_id=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch patterns');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatterns();
  }, [workspaceId, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
};

