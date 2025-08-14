/**
 * Jest Test Setup
 * Global test configuration and setup for Phase 2 transformation services testing
 */

import { jest } from '@jest/globals';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Reset all mocks between tests
  resetMocks: () => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  },
  
  // Restore console for specific tests if needed
  restoreConsole: () => {
    global.console = originalConsole;
  },
  
  // Mock console for specific tests
  mockConsole: () => {
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }
};

// Global beforeEach setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset any global state
  process.env.NODE_ENV = 'test';
});

// Global afterEach cleanup
afterEach(() => {
  // Clean up any test artifacts
  jest.restoreAllMocks();
});

// Global error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

// Export test utilities for use in test files
export const testUtils = global.testUtils;