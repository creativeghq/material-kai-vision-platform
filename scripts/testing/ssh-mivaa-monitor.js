/**
 * SSH MIVAA Service Monitor
 * 
 * This script connects to the MIVAA server via SSH and monitors:
 * - Service status and health
 * - Environment variables configuration
 * - Real-time logs during PDF processing
 * - Database connectivity
 * - API endpoint availability
 * 
 * Usage:
 * 1. Ensure SSH MCP is configured
 * 2. Run: node scripts/testing/ssh-mivaa-monitor.js
 */

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';

console.log('🔍 MIVAA Service SSH Monitor');
console.log('=' .repeat(80));
console.log('');

/**
 * Step 1: Check MIVAA Service Health
 */
async function checkMivaaHealth() {
  console.log('📊 Step 1: Checking MIVAA Service Health');
  console.log('-'.repeat(80));
  
  try {
    const response = await fetch(`${MIVAA_SERVICE_URL}/api/health`);
    const data = await response.json();
    
    console.log('✅ MIVAA Health Check:', {
      status: response.status,
      success: data.success,
      message: data.message,
    });
    
    return data.success;
  } catch (error) {
    console.error('❌ MIVAA Health Check Failed:', error.message);
    return false;
  }
}

/**
 * Step 2: Check Environment Variables (via SSH)
 * 
 * This requires SSH access to the MIVAA server.
 * You'll need to use the ssh-mcp tool to execute these commands.
 */
function getEnvCheckCommands() {
  console.log('');
  console.log('📋 Step 2: Environment Variables Check');
  console.log('-'.repeat(80));
  console.log('');
  console.log('Run these commands via SSH MCP:');
  console.log('');
  
  const commands = [
    {
      name: 'Check SUPABASE_URL',
      command: 'echo "SUPABASE_URL: ${SUPABASE_URL:-NOT SET}"',
      expected: SUPABASE_URL,
    },
    {
      name: 'Check SUPABASE_SERVICE_ROLE_KEY',
      command: 'echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:20}... (${#SUPABASE_SERVICE_ROLE_KEY} chars)"',
      expected: 'Should show ~200+ characters',
    },
    {
      name: 'Check OPENAI_API_KEY',
      command: 'echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}... (${#OPENAI_API_KEY} chars)"',
      expected: 'Should show ~50+ characters',
    },
    {
      name: 'Check ANTHROPIC_API_KEY',
      command: 'echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:10}... (${#ANTHROPIC_API_KEY} chars)"',
      expected: 'Should show ~100+ characters',
    },
  ];
  
  commands.forEach((cmd, index) => {
    console.log(`${index + 1}. ${cmd.name}`);
    console.log(`   Command: ${cmd.command}`);
    console.log(`   Expected: ${cmd.expected}`);
    console.log('');
  });
  
  return commands;
}

/**
 * Step 3: Check MIVAA Service Logs
 */
function getLogCheckCommands() {
  console.log('');
  console.log('📜 Step 3: MIVAA Service Logs');
  console.log('-'.repeat(80));
  console.log('');
  console.log('Run these commands via SSH MCP to check logs:');
  console.log('');
  
  const commands = [
    {
      name: 'Check if service is running',
      command: 'systemctl status mivaa || docker ps | grep mivaa',
    },
    {
      name: 'View recent logs (systemd)',
      command: 'journalctl -u mivaa -n 50 --no-pager',
    },
    {
      name: 'View recent logs (Docker)',
      command: 'docker logs mivaa-container --tail 50',
    },
    {
      name: 'Follow logs in real-time (systemd)',
      command: 'journalctl -u mivaa -f',
    },
    {
      name: 'Follow logs in real-time (Docker)',
      command: 'docker logs mivaa-container -f',
    },
  ];
  
  commands.forEach((cmd, index) => {
    console.log(`${index + 1}. ${cmd.name}`);
    console.log(`   Command: ${cmd.command}`);
    console.log('');
  });
  
  return commands;
}

/**
 * Step 4: Test Database Connectivity from MIVAA Server
 */
function getDatabaseCheckCommands() {
  console.log('');
  console.log('🗄️  Step 4: Database Connectivity Check');
  console.log('-'.repeat(80));
  console.log('');
  console.log('Run these commands via SSH MCP to test database connectivity:');
  console.log('');
  
  const commands = [
    {
      name: 'Test Supabase REST API connectivity',
      command: `curl -H "apikey: \${SUPABASE_ANON_KEY}" "${SUPABASE_URL}/rest/v1/documents?limit=1"`,
    },
    {
      name: 'Test Supabase with service role key',
      command: `curl -H "apikey: \${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer \${SUPABASE_SERVICE_ROLE_KEY}" "${SUPABASE_URL}/rest/v1/documents?limit=1"`,
    },
    {
      name: 'Test OpenAI API connectivity',
      command: 'curl -H "Authorization: Bearer ${OPENAI_API_KEY}" https://api.openai.com/v1/models',
    },
  ];
  
  commands.forEach((cmd, index) => {
    console.log(`${index + 1}. ${cmd.name}`);
    console.log(`   Command: ${cmd.command}`);
    console.log('');
  });
  
  return commands;
}

/**
 * Step 5: Monitor PDF Processing in Real-Time
 */
function getProcessingMonitorCommands() {
  console.log('');
  console.log('🔄 Step 5: Real-Time PDF Processing Monitor');
  console.log('-'.repeat(80));
  console.log('');
  console.log('To monitor PDF processing in real-time:');
  console.log('');
  console.log('1. Start log monitoring (in one terminal):');
  console.log('   journalctl -u mivaa -f | grep -E "(PDF|embedding|chunk|image|database)"');
  console.log('   OR');
  console.log('   docker logs mivaa-container -f | grep -E "(PDF|embedding|chunk|image|database)"');
  console.log('');
  console.log('2. Upload a PDF via the web interface');
  console.log('');
  console.log('3. Watch for these log patterns:');
  console.log('   ✅ "Processing PDF: <filename>"');
  console.log('   ✅ "Extracted X chunks"');
  console.log('   ✅ "Generated X embeddings"');
  console.log('   ✅ "Extracted X images"');
  console.log('   ✅ "Stored to database"');
  console.log('   ❌ "OPENAI_API_KEY not found" - Missing API key');
  console.log('   ❌ "SUPABASE_URL not set" - Missing Supabase config');
  console.log('   ❌ "Database connection failed" - Connectivity issue');
  console.log('');
}

/**
 * Step 6: Diagnostic Script to Run on MIVAA Server
 */
function generateDiagnosticScript() {
  console.log('');
  console.log('🔧 Step 6: Comprehensive Diagnostic Script');
  console.log('-'.repeat(80));
  console.log('');
  console.log('Save this script on the MIVAA server as "mivaa-diagnostics.sh":');
  console.log('');
  console.log('```bash');
  console.log(`#!/bin/bash

echo "🔍 MIVAA Service Diagnostics"
echo "=============================="
echo ""

# Check service status
echo "📊 Service Status:"
systemctl status mivaa 2>/dev/null || docker ps | grep mivaa
echo ""

# Check environment variables
echo "🔑 Environment Variables:"
echo "SUPABASE_URL: \${SUPABASE_URL:-NOT SET}"
echo "SUPABASE_ANON_KEY: \${SUPABASE_ANON_KEY:0:20}... (\${#SUPABASE_ANON_KEY} chars)"
echo "SUPABASE_SERVICE_ROLE_KEY: \${SUPABASE_SERVICE_ROLE_KEY:0:20}... (\${#SUPABASE_SERVICE_ROLE_KEY} chars)"
echo "OPENAI_API_KEY: \${OPENAI_API_KEY:0:10}... (\${#OPENAI_API_KEY} chars)"
echo "ANTHROPIC_API_KEY: \${ANTHROPIC_API_KEY:0:10}... (\${#ANTHROPIC_API_KEY} chars)"
echo ""

# Test MIVAA health
echo "🏥 MIVAA Health Check:"
curl -s ${MIVAA_SERVICE_URL}/api/health | jq .
echo ""

# Test Supabase connectivity
echo "🗄️  Supabase Connectivity:"
curl -s -H "apikey: \${SUPABASE_SERVICE_ROLE_KEY}" \\
     -H "Authorization: Bearer \${SUPABASE_SERVICE_ROLE_KEY}" \\
     "${SUPABASE_URL}/rest/v1/documents?limit=1" | jq .
echo ""

# Test OpenAI connectivity
echo "🤖 OpenAI API Connectivity:"
curl -s -H "Authorization: Bearer \${OPENAI_API_KEY}" \\
     https://api.openai.com/v1/models | jq '.data[0].id'
echo ""

# Check recent logs
echo "📜 Recent Logs (last 20 lines):"
journalctl -u mivaa -n 20 --no-pager 2>/dev/null || docker logs mivaa-container --tail 20
echo ""

echo "✅ Diagnostics complete!"
`);
  console.log('```');
  console.log('');
  console.log('Run with: bash mivaa-diagnostics.sh');
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  // Step 1: Check MIVAA health
  const isHealthy = await checkMivaaHealth();
  
  if (!isHealthy) {
    console.log('');
    console.log('⚠️  MIVAA service is not responding. Check if the service is running.');
    console.log('');
  }
  
  // Step 2: Environment variables
  getEnvCheckCommands();
  
  // Step 3: Logs
  getLogCheckCommands();
  
  // Step 4: Database connectivity
  getDatabaseCheckCommands();
  
  // Step 5: Processing monitor
  getProcessingMonitorCommands();
  
  // Step 6: Diagnostic script
  generateDiagnosticScript();
  
  console.log('');
  console.log('=' .repeat(80));
  console.log('📝 Summary:');
  console.log('');
  console.log('1. Use SSH MCP to connect to the MIVAA server');
  console.log('2. Run the diagnostic commands above to check configuration');
  console.log('3. Ensure all environment variables are set correctly');
  console.log('4. Monitor logs in real-time during PDF processing');
  console.log('5. Check for errors related to API keys or database connectivity');
  console.log('');
  console.log('🎯 Expected Issues to Look For:');
  console.log('   - Missing OPENAI_API_KEY → No embeddings generated');
  console.log('   - Missing SUPABASE_SERVICE_ROLE_KEY → No database writes');
  console.log('   - Missing SUPABASE_URL → Cannot connect to database');
  console.log('   - Network connectivity issues → API calls fail');
  console.log('');
}

// Run the monitor
main().catch(console.error);

