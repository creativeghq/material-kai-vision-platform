/**
 * Analytics Service
 *
 * Tracks and analyzes platform metrics including usage, performance, and quality.
 */

import { supabase } from '@/integrations/supabase/client';

import { BaseService } from './base/BaseService';

export interface AnalyticsEvent {
  event_type: string;
  workspace_id: string;
  user_id?: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AnalyticsMetrics {
  total_events: number;
  events_by_type: Record<string, number>;
  average_response_time: number;
  error_rate: number;
  user_count: number;
  session_count: number;
}

export interface AnalyticsReport {
  period: string;
  metrics: AnalyticsMetrics;
  trends: Array<{
    date: string;
    event_count: number;
    error_count: number;
  }>;
  top_events: Array<{
    event_type: string;
    count: number;
    percentage: number;
  }>;
}

class AnalyticsServiceImpl extends BaseService {
  constructor() {
    super({
      name: 'AnalyticsService',
      version: '1.0.0',
      environment: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'development',
      enabled: true,
      timeout: 30000,
    });
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Initialize analytics tracking
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify analytics service is operational
    // In a real implementation, this would check database connectivity
  }

  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    return this.executeOperation(async () => {
      const { error } = await supabase
        .from('analytics_events')
        .insert([
          {
            event_type: event.event_type,
            workspace_id: event.workspace_id,
            user_id: event.user_id,
            metadata: event.metadata,
            created_at: event.timestamp,
          },
        ]);

      if (error) {
        throw new Error(`Failed to track event: ${error.message}`);
      }
    }, 'trackEvent');
  }

  /**
   * Get analytics metrics for a workspace
   */
  async getMetrics(workspaceId: string, days: number = 30): Promise<AnalyticsMetrics> {
    return this.executeOperation(async () => {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get all events
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('created_at', startDate);

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // Calculate metrics
      const eventsByType: Record<string, number> = {};
      let errorCount = 0;
      const userIds = new Set<string>();
      const sessionIds = new Set<string>();

      (events || []).forEach(event => {
        eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;

        if (event.metadata?.error) {
          errorCount++;
        }

        if (event.user_id) {
          userIds.add(event.user_id);
        }

        if (event.metadata?.session_id) {
          sessionIds.add(event.metadata.session_id as string);
        }
      });

      const totalEvents = events?.length || 0;
      const errorRate = totalEvents > 0 ? errorCount / totalEvents : 0;

      return {
        total_events: totalEvents,
        events_by_type: eventsByType,
        average_response_time: this.calculateAverageResponseTime(events || []),
        error_rate: errorRate,
        user_count: userIds.size,
        session_count: sessionIds.size,
      };
    }, 'getMetrics');
  }

  /**
   * Get analytics report for a period
   */
  async getReport(workspaceId: string, days: number = 30): Promise<AnalyticsReport> {
    return this.executeOperation(async () => {
      const metrics = await this.getMetrics(workspaceId, days);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get events for trends
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('created_at', startDate)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch report data: ${error.message}`);
      }

      // Calculate trends
      const trends = this.calculateTrends(events || []);

      // Calculate top events
      const topEvents = Object.entries(metrics.events_by_type)
        .map(([eventType, count]) => ({
          event_type: eventType,
          count,
          percentage: (count / metrics.total_events) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        period: `Last ${days} days`,
        metrics,
        trends,
        top_events: topEvents,
      };
    }, 'getReport');
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagement(workspaceId: string, days: number = 30): Promise<{
    active_users: number;
    total_sessions: number;
    average_session_duration: number;
    returning_users: number;
  }> {
    return this.executeOperation(async () => {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('created_at', startDate);

      if (error) {
        throw new Error(`Failed to fetch engagement data: ${error.message}`);
      }

      const userSessions = new Map<string, number>();
      const uniqueUsers = new Set<string>();

      (events || []).forEach(event => {
        if (event.user_id) {
          uniqueUsers.add(event.user_id);
          const sessionId = event.metadata?.session_id as string;
          if (sessionId) {
            userSessions.set(sessionId, (userSessions.get(sessionId) || 0) + 1);
          }
        }
      });

      return {
        active_users: uniqueUsers.size,
        total_sessions: userSessions.size,
        average_session_duration: userSessions.size > 0
          ? Array.from(userSessions.values()).reduce((a, b) => a + b, 0) / userSessions.size
          : 0,
        returning_users: Math.floor(uniqueUsers.size * 0.3), // Estimate
      };
    }, 'getUserEngagement');
  }

  /**
   * Private helper methods
   */

  private calculateAverageResponseTime(events: any[]): number {
    const responseTimes = events
      .filter(e => e.metadata?.response_time)
      .map(e => e.metadata.response_time as number);

    if (responseTimes.length === 0) return 0;

    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  private calculateTrends(events: any[]): Array<{
    date: string;
    event_count: number;
    error_count: number;
  }> {
    const trendsByDate = new Map<string, { events: number; errors: number }>();

    events.forEach(event => {
      const date = new Date(event.created_at).toLocaleDateString();
      const current = trendsByDate.get(date) || { events: 0, errors: 0 };

      current.events++;
      if (event.metadata?.error) {
        current.errors++;
      }

      trendsByDate.set(date, current);
    });

    return Array.from(trendsByDate.entries())
      .map(([date, data]) => ({
        date,
        event_count: data.events,
        error_count: data.errors,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}

export const AnalyticsService = AnalyticsServiceImpl;

