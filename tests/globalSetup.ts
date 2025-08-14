/**
 * Jest Global Setup
 * Runs once before all test suites
 */

import { jest } from '@jest/globals';

export default async function globalSetup(): Promise<void> {
  console.log('🚀 Starting Jest Global Setup for Phase 2 Testing...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
  
  // Initialize any global test resources
  console.log('✅ Global setup completed');
}