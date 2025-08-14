/** @type {import('jest').Config} */
export default {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest/presets/default-esm',
  
  // Test environment
  testEnvironment: 'node',
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform files with ts-jest
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2020',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }]
  },
  
  // Module name mapping for path aliases
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.(ts|tsx|js)',
    '<rootDir>/tests/**/*.spec.(ts|tsx|js)',
    '<rootDir>/src/**/__tests__/**/*.(ts|tsx|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js)'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/types/**',
    '!src/**/*.stories.{ts,tsx}'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    // Specific thresholds for Phase 2 services
    'src/services/batch/**/*.ts': {
      branches: 98,
      functions: 98,
      lines: 98,
      statements: 98
    },
    'src/middleware/validationMiddleware.ts': {
      branches: 98,
      functions: 98,
      lines: 98,
      statements: 98
    },
    'src/services/validationIntegrationService.ts': {
      branches: 98,
      functions: 98,
      lines: 98,
      statements: 98
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Handle ES modules
  extensionsToTreatAsEsm: ['.ts'],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  
  // Test results processor for performance tracking
  testResultsProcessor: '<rootDir>/tests/utils/testResultsProcessor.ts',
  
  // Custom reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/test-results',
      outputName: 'junit.xml'
    }]
  ],
  
  // Performance testing configuration
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Mock configuration
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Maximum worker processes
  maxWorkers: '50%'
};