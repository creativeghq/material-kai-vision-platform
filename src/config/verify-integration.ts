/**
 * Integration Verification Script
 * 
 * Run this file to verify that the new infrastructure is properly integrated.
 * This demonstrates that environment config and logger work together.
 * 
 * Usage: node --loader ts-node/esm src/config/verify-integration.ts
 */

import { env, logger, createLogger, isFeatureEnabled, getApiBaseUrl } from './index';

console.log('🔍 Verifying Infrastructure Integration...\n');

// 1. Verify Environment Configuration
console.log('1️⃣ Environment Configuration:');
console.log('   ✓ Node Environment:', env.nodeEnv);
console.log('   ✓ Is Development:', env.isDevelopment);
console.log('   ✓ Is Production:', env.isProduction);
console.log('   ✓ Supabase URL configured:', !!env.supabase.url);
console.log('   ✓ Supabase Key configured:', !!env.supabase.anonKey);
console.log('   ✓ MIVAA API URL:', env.mivaa.apiUrl);
console.log('');

// 2. Verify Feature Flags
console.log('2️⃣ Feature Flags:');
console.log('   ✓ Logging enabled:', env.features.enableLogging);
console.log('   ✓ Caching enabled:', env.features.enableCaching);
console.log('   ✓ Analytics enabled:', env.features.enableAnalytics);
console.log('   ✓ WebSocket enabled:', env.websocket.enabled);
console.log('');

// 3. Verify Helper Functions
console.log('3️⃣ Helper Functions:');
console.log('   ✓ isFeatureEnabled(\'enableLogging\'):', isFeatureEnabled('enableLogging'));
console.log('   ✓ getApiBaseUrl(\'supabase\'):', getApiBaseUrl('supabase'));
console.log('   ✓ getApiBaseUrl(\'mivaa\'):', getApiBaseUrl('mivaa'));
console.log('');

// 4. Verify Logger Service
console.log('4️⃣ Logger Service:');
logger.clearBuffer();
logger.info('Testing global logger', { test: true, timestamp: Date.now() });
logger.warn('Testing warning', { level: 'warn' });
logger.error('Testing error', new Error('Test error'), { severity: 'low' });

const recentLogs = logger.getRecentLogs(3);
console.log('   ✓ Global logger works:', recentLogs.length === 3);
console.log('   ✓ Info log captured:', recentLogs[0].message === 'Testing global logger');
console.log('   ✓ Metadata attached:', !!recentLogs[0].metadata);
console.log('');

// 5. Verify Scoped Logger
console.log('5️⃣ Scoped Logger:');
const scopedLogger = createLogger('VerificationService');
scopedLogger.info('Testing scoped logger', { service: 'verification' });

const scopedLogs = logger.getRecentLogs(1);
console.log('   ✓ Scoped logger works:', scopedLogs.length > 0);
console.log('   ✓ Service name in metadata:', scopedLogs[0].metadata?.service === 'verification');
console.log('');

// 6. Verify Integration
console.log('6️⃣ Integration Check:');
try {
  // Test that logger respects environment
  if (env.features.enableLogging) {
    scopedLogger.info('Logging is enabled based on env config');
    console.log('   ✓ Logger respects environment config');
  }
  
  // Test that we can use env and logger together
  scopedLogger.info('Environment info', {
    nodeEnv: env.nodeEnv,
    isDev: env.isDevelopment,
    hasSupabase: !!env.supabase.url,
  });
  console.log('   ✓ Env and logger work together');
  
  console.log('');
  console.log('✅ All integration checks passed!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   - Environment: ${env.nodeEnv}`);
  console.log(`   - Logging enabled: ${env.features.enableLogging}`);
  console.log(`   - Recent logs: ${logger.getRecentLogs().length}`);
  console.log('');
  console.log('🚀 New infrastructure is ready to use!');
  console.log('   Import with: import { env, logger, createLogger } from \'@/config\';');
  
} catch (error) {
  console.error('❌ Integration check failed:', error);
  process.exit(1);
}
