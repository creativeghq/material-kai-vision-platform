/**
 * Integration Tests for New Infrastructure
 * 
 * Tests that the new environment config and logger service
 * are properly integrated and working together.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env, isFeatureEnabled, getApiBaseUrl } from '../environment';
import { logger, createLogger, LogLevel } from '../../services/logger.service';

describe('Infrastructure Integration Tests', () => {
  describe('Environment Configuration', () => {
    it('should have environment config loaded', () => {
      expect(env).toBeDefined();
      expect(env.nodeEnv).toBeDefined();
      expect(['development', 'production', 'test', 'staging']).toContain(env.nodeEnv);
    });

    it('should have Supabase configuration', () => {
      expect(env.supabase).toBeDefined();
      expect(env.supabase.url).toBeDefined();
      expect(env.supabase.anonKey).toBeDefined();
    });

    it('should have MIVAA configuration', () => {
      expect(env.mivaa).toBeDefined();
      expect(env.mivaa.apiUrl).toBeDefined();
    });

    it('should have feature flags', () => {
      expect(env.features).toBeDefined();
      expect(typeof env.features.enableLogging).toBe('boolean');
      expect(typeof env.features.enableCaching).toBe('boolean');
      expect(typeof env.features.enableAnalytics).toBe('boolean');
    });

    it('should provide environment helpers', () => {
      expect(typeof env.isDevelopment).toBe('boolean');
      expect(typeof env.isProduction).toBe('boolean');
      expect(typeof env.isTest).toBe('boolean');
    });
  });

  describe('Feature Flags', () => {
    it('should check feature flags correctly', () => {
      const enableLogging = isFeatureEnabled('enableLogging');
      expect(typeof enableLogging).toBe('boolean');
      
      const enableCaching = isFeatureEnabled('enableCaching');
      expect(typeof enableCaching).toBe('boolean');
    });
  });

  describe('API Base URL Helper', () => {
    it('should get Supabase API URL', () => {
      const url = getApiBaseUrl('supabase');
      expect(url).toContain(env.supabase.url);
      expect(url).toContain('/functions/v1');
    });

    it('should get MIVAA API URL', () => {
      const url = getApiBaseUrl('mivaa');
      expect(url).toBe(env.mivaa.apiUrl);
    });
  });

  describe('Logger Service', () => {
    beforeEach(() => {
      logger.clearBuffer();
    });

    it('should have global logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should log info messages', () => {
      logger.info('Test message', { test: true });
      const logs = logger.getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should log with metadata', () => {
      const metadata = { userId: '123', action: 'test' };
      logger.info('Test with metadata', metadata);
      const logs = logger.getRecentLogs(1);
      expect(logs[0].metadata).toEqual(metadata);
    });

    it('should create scoped loggers', () => {
      const scopedLogger = createLogger('TestService');
      expect(scopedLogger).toBeDefined();
      expect(typeof scopedLogger.info).toBe('function');
    });

    it('should maintain log buffer', () => {
      logger.info('Log 1');
      logger.info('Log 2');
      logger.info('Log 3');
      
      const logs = logger.getRecentLogs(3);
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Log 1');
      expect(logs[2].message).toBe('Log 3');
    });

    it('should clear log buffer', () => {
      logger.info('Test');
      expect(logger.getRecentLogs()).toHaveLength(1);
      
      logger.clearBuffer();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });
  });

  describe('Environment and Logger Integration', () => {
    it('should use environment config in logger', () => {
      const scopedLogger = createLogger('IntegrationTest');
      
      scopedLogger.info('Testing integration', {
        environment: env.nodeEnv,
        isDev: env.isDevelopment,
      });
      
      const logs = logger.getRecentLogs(1);
      expect(logs[0].metadata?.environment).toBe(env.nodeEnv);
    });

    it('should respect feature flags for logging', () => {
      if (env.features.enableLogging) {
        logger.info('Logging is enabled');
        expect(logger.getRecentLogs(1)).toHaveLength(1);
      }
    });
  });

  describe('Barrel Exports', () => {
    it('should export from central config file', async () => {
      // Test that barrel exports work
      const config = await import('../index');
      
      expect(config.env).toBeDefined();
      expect(config.logger).toBeDefined();
      expect(config.createLogger).toBeDefined();
      expect(config.isFeatureEnabled).toBeDefined();
      expect(config.getApiBaseUrl).toBeDefined();
    });
  });
});
