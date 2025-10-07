#!/usr/bin/env node

/**
 * Generate 20-Character MIVAA API Key
 * 
 * Creates a secure 20-character API key for MIVAA service
 * that fits within Supabase environment variable limits.
 */

const crypto = require('crypto');

// Generate secure random key
function generateSecureKey(length = 20) {
  // Use alphanumeric characters (no special chars for compatibility)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  // Use crypto.randomBytes for cryptographically secure randomness
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomBytes[i] % chars.length);
  }
  
  return result;
}

// Generate multiple key options
function generateMivaaKeys() {
  console.log('🔑 MIVAA API Key Generator');
  console.log('=' .repeat(50));
  console.log('Generating 20-character keys for Supabase environment variables...\n');
  
  // Generate 5 different options
  for (let i = 1; i <= 5; i++) {
    const key = generateSecureKey(20);
    console.log(`Option ${i}: ${key}`);
  }
  
  console.log('\n📋 Instructions:');
  console.log('1. Choose one of the keys above');
  console.log('2. Go to Supabase Project Settings > Environment Variables');
  console.log('3. Set MIVAA_API_KEY = [chosen key]');
  console.log('4. Update your MIVAA service to accept this key');
  console.log('5. Test the integration');
  
  console.log('\n⚠️  Important:');
  console.log('- Save the chosen key securely');
  console.log('- Update all deployments that use MIVAA');
  console.log('- Test thoroughly before production use');
  
  console.log('\n🔧 Test Command:');
  console.log('node scripts/integration-tests/test-updated-mivaa-key.js');
}

// Generate with specific prefix if needed
function generateWithPrefix(prefix = 'mk') {
  const remainingLength = 20 - prefix.length - 1; // -1 for underscore
  if (remainingLength < 8) {
    throw new Error('Prefix too long for 20-character limit');
  }
  
  const suffix = generateSecureKey(remainingLength);
  return `${prefix}_${suffix}`;
}

// Main execution
if (require.main === module) {
  generateMivaaKeys();
  
  console.log('\n🎯 Alternative with prefix:');
  console.log(`With "mk" prefix: ${generateWithPrefix('mk')}`);
  console.log(`With "kai" prefix: ${generateWithPrefix('kai')}`);
}

// Export for use in other scripts
module.exports = {
  generateSecureKey,
  generateWithPrefix,
  generateMivaaKeys
};
