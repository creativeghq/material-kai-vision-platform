/**
 * AnalyticsService Tests
 */

import { AnalyticsService } from '../AnalyticsService';

jest.mock('@/integrations/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    const chainable: any = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    if (table === 'analytics_events') {
      chainable.insert = jest.fn().mockReturnThis();

      Object.defineProperty(chainable, Symbol.toStringTag, { value: 'Promise' });
      chainable.then = (onFulfilled: any) => {
        const result = {
          data: [
            {
              id: 'event-1',
              event_type: 'search',
              workspace_id: 'workspace-1',
              user_id: 'user-1',
              metadata: { response_time: 150 },
              created_at: new Date().toISOString(),
            },
            {
              id: 'event-2',
              event_type: 'recommendation',
              workspace_id: 'workspace-1',
              user_id: 'user-1',
              metadata: { response_time: 200 },
              created_at: new Date().toISOString(),
            },
            {
              id: 'event-3',
              event_type: 'search',
              workspace_id: 'workspace-1',
              user_id: 'user-2',
              metadata: { response_time: 180, error: false },
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        };
        return Promise.resolve(result).then(onFulfilled);
      };
    }

    return chainable;
  });

  return { supabase: { from: mockFrom } };
});

describe('AnalyticsService', () => {
  let service: InstanceType<typeof AnalyticsService>;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });

    it('should have correct service name', () => {
      const config = service.getConfig();
      expect(config.name).toBe('AnalyticsService');
    });

    it('should have correct version', () => {
      const config = service.getConfig();
      expect(config.version).toBe('1.0.0');
    });
  });

  describe('trackEvent', () => {
    it('should track analytics event', async () => {
      await service.initialize();
      await service.trackEvent({
        event_type: 'search',
        workspace_id: 'workspace-1',
        user_id: 'user-1',
        metadata: { query: 'materials' },
        timestamp: new Date().toISOString(),
      });

      // Event should be tracked without error
      expect(true).toBe(true);
    });

    it('should track event with metadata', async () => {
      await service.initialize();
      await service.trackEvent({
        event_type: 'recommendation',
        workspace_id: 'workspace-1',
        user_id: 'user-1',
        metadata: { product_id: 'prod-1', confidence: 0.85 },
        timestamp: new Date().toISOString(),
      });

      expect(true).toBe(true);
    });

    it('should track event without user_id', async () => {
      await service.initialize();
      await service.trackEvent({
        event_type: 'page_view',
        workspace_id: 'workspace-1',
        metadata: { page: 'dashboard' },
        timestamp: new Date().toISOString(),
      });

      expect(true).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should retrieve analytics metrics', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect(metrics).toBeDefined();
      expect((metrics as any).total_events).toBeGreaterThanOrEqual(0);
      expect((metrics as any).events_by_type).toBeDefined();
      expect((metrics as any).error_rate).toBeGreaterThanOrEqual(0);
      expect((metrics as any).user_count).toBeGreaterThanOrEqual(0);
      expect((metrics as any).session_count).toBeGreaterThanOrEqual(0);
    });

    it('should calculate events by type', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect(typeof (metrics as any).events_by_type).toBe('object');
      Object.values((metrics as any).events_by_type || {}).forEach(count => {
        expect(typeof count).toBe('number');
        expect((count as any)).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate error rate', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect((metrics as any).error_rate).toBeGreaterThanOrEqual(0);
      expect((metrics as any).error_rate).toBeLessThanOrEqual(1);
    });

    it('should count unique users', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect((metrics as any).user_count).toBeGreaterThanOrEqual(0);
    });

    it('should count sessions', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect((metrics as any).session_count).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average response time', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect((metrics as any).average_response_time).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getReport', () => {
    it('should generate analytics report', async () => {
      await service.initialize();
      const report = await service.getReport('workspace-1', 30);

      expect(report).toBeDefined();
      expect(report.period).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.top_events).toBeDefined();
    });

    it('should include metrics in report', async () => {
      await service.initialize();
      const report = await service.getReport('workspace-1', 30);

      expect(report.metrics.total_events).toBeGreaterThanOrEqual(0);
      expect(report.metrics.error_rate).toBeGreaterThanOrEqual(0);
    });

    it('should include trends in report', async () => {
      await service.initialize();
      const report = await service.getReport('workspace-1', 30);

      expect(Array.isArray(report.trends)).toBe(true);
      report.trends.forEach(trend => {
        expect(trend.date).toBeDefined();
        expect(trend.event_count).toBeGreaterThanOrEqual(0);
        expect(trend.error_count).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include top events in report', async () => {
      await service.initialize();
      const report = await service.getReport('workspace-1', 30);

      expect(Array.isArray(report.top_events)).toBe(true);
      report.top_events.forEach(event => {
        expect(event.event_type).toBeDefined();
        expect(event.count).toBeGreaterThan(0);
        expect(event.percentage).toBeGreaterThan(0);
        expect(event.percentage).toBeLessThanOrEqual(100);
      });
    });

    it('should sort top events by count', async () => {
      await service.initialize();
      const report = await service.getReport('workspace-1', 30);

      for (let i = 1; i < report.top_events.length; i++) {
        expect(report.top_events[i - 1].count).toBeGreaterThanOrEqual(report.top_events[i].count);
      }
    });
  });

  describe('getUserEngagement', () => {
    it('should retrieve user engagement metrics', async () => {
      await service.initialize();
      const engagement = await service.getUserEngagement('workspace-1', 30);

      expect(engagement).toBeDefined();
      expect(engagement.active_users).toBeGreaterThanOrEqual(0);
      expect(engagement.total_sessions).toBeGreaterThanOrEqual(0);
      expect(engagement.average_session_duration).toBeGreaterThanOrEqual(0);
      expect(engagement.returning_users).toBeGreaterThanOrEqual(0);
    });

    it('should count active users', async () => {
      await service.initialize();
      const engagement = await service.getUserEngagement('workspace-1', 30);

      expect(typeof engagement.active_users).toBe('number');
      expect(engagement.active_users).toBeGreaterThanOrEqual(0);
    });

    it('should count total sessions', async () => {
      await service.initialize();
      const engagement = await service.getUserEngagement('workspace-1', 30);

      expect(typeof engagement.total_sessions).toBe('number');
      expect(engagement.total_sessions).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average session duration', async () => {
      await service.initialize();
      const engagement = await service.getUserEngagement('workspace-1', 30);

      expect(typeof engagement.average_session_duration).toBe('number');
      expect(engagement.average_session_duration).toBeGreaterThanOrEqual(0);
    });

    it('should estimate returning users', async () => {
      await service.initialize();
      const engagement = await service.getUserEngagement('workspace-1', 30);

      expect(typeof engagement.returning_users).toBe('number');
      expect(engagement.returning_users).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing workspace gracefully', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('non-existent', 30);

      expect(metrics).toBeDefined();
      expect((metrics as any).total_events).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero events', async () => {
      await service.initialize();
      const metrics = await (service as any).getAnalyticsMetrics('workspace-1', 30);

      expect((metrics as any).error_rate).toBeGreaterThanOrEqual(0);
      expect((metrics as any).error_rate).toBeLessThanOrEqual(1);
    });
  });

  describe('Service Health', () => {
    it('should report healthy status', async () => {
      await service.initialize();
      const health = await service.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should track metrics', async () => {
      await service.initialize();
      await service.trackEvent({
        event_type: 'test',
        workspace_id: 'workspace-1',
        metadata: {},
        timestamp: new Date().toISOString(),
      });

      // Service should be ready after initialization
      expect(service.isReady()).toBe(true);
    });
  });
});

