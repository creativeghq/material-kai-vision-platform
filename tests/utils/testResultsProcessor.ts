/**
 * Test Results Processor
 * Processes and formats test results for performance tracking and reporting
 */

import { jest } from '@jest/globals';

export interface TestResult {
  testName: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  memoryUsage?: number;
  performanceMetrics?: Record<string, number>;
}

export interface TestSuiteResult {
  suiteName: string;
  tests: TestResult[];
  totalDuration: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
}

export class TestResultsProcessor {
  private results: TestSuiteResult[] = [];

  /**
   * Add test suite results
   */
  addSuiteResult(suiteResult: TestSuiteResult): void {
    this.results.push(suiteResult);
  }

  /**
   * Generate performance summary
   */
  generatePerformanceSummary(): {
    totalTests: number;
    totalDuration: number;
    averageDuration: number;
    slowestTests: TestResult[];
    memoryUsage: {
      average: number;
      peak: number;
    };
  } {
    const allTests = this.results.flatMap(suite => suite.tests);
    const totalTests = allTests.length;
    const totalDuration = this.results.reduce((sum, suite) => sum + suite.totalDuration, 0);
    const averageDuration = totalDuration / totalTests;

    // Find slowest tests
    const slowestTests = allTests
      .filter(test => test.status === 'passed')
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    // Calculate memory usage statistics
    const testsWithMemory = allTests.filter(test => test.memoryUsage !== undefined);
    const memoryUsages = testsWithMemory.map(test => test.memoryUsage!);
    const averageMemory = memoryUsages.length > 0 
      ? memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length 
      : 0;
    const peakMemory = memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0;

    return {
      totalTests,
      totalDuration,
      averageDuration,
      slowestTests,
      memoryUsage: {
        average: averageMemory,
        peak: peakMemory
      }
    };
  }

  /**
   * Generate coverage report summary
   */
  generateCoverageReport(): {
    overall: number;
    byCategory: Record<string, number>;
    recommendations: string[];
  } {
    // This would integrate with Jest coverage data
    // For now, return a placeholder structure
    return {
      overall: 0,
      byCategory: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      },
      recommendations: [
        'Increase unit test coverage for validation layer',
        'Add integration tests for batch processing',
        'Implement end-to-end testing scenarios'
      ]
    };
  }

  /**
   * Export results to JSON
   */
  exportToJson(): string {
    const summary = this.generatePerformanceSummary();
    const coverage = this.generateCoverageReport();

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      coverage,
      suites: this.results
    }, null, 2);
  }

  /**
   * Clear all results
   */
  clear(): void {
    this.results = [];
  }
}

// Global instance for use across tests
export const testResultsProcessor = new TestResultsProcessor();

/**
 * Helper function to measure test performance
 */
export function measureTestPerformance<T>(
  testName: string,
  testFunction: () => T | Promise<T>
): Promise<{ result: T; metrics: TestResult }> {
  return new Promise(async (resolve, reject) => {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await testFunction();
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      const metrics: TestResult = {
        testName,
        duration: endTime - startTime,
        status: 'passed',
        memoryUsage: endMemory - startMemory
      };

      resolve({ result, metrics });
    } catch (error) {
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      const metrics: TestResult = {
        testName,
        duration: endTime - startTime,
        status: 'failed',
        memoryUsage: endMemory - startMemory
      };

      reject({ error, metrics });
    }
  });
}