#!/usr/bin/env node

/**
 * MASTER API VALIDATION SCRIPT
 * 
 * Runs comprehensive validation of all Material Kai Vision Platform APIs:
 * 1. Direct MIVAA service endpoints (58 endpoints)
 * 2. Supabase Edge Function gateway actions (27+ actions)  
 * 3. Frontend-backend integration flows (7 critical components)
 * 4. Data flow validation and mock data detection
 * 5. Authentication and error handling validation
 * 
 * Generates comprehensive reports and actionable recommendations.
 */

const fs = require('fs');
const path = require('path');
const { runComprehensiveValidation } = require('./validate-all-endpoints');
const { runFrontendIntegrationValidation } = require('./validate-frontend-integration');
const { CONFIG, API_ENDPOINTS, GATEWAY_ACTIONS } = require('./api-validation-framework');

// Master validation results
const masterResults = {
  validation_id: `validation_${Date.now()}`,
  timestamp: new Date().toISOString(),
  platform: 'Material Kai Vision Platform',
  version: '1.0.0',
  summary: {
    total_tests: 0,
    passed: 0,
    failed: 0,
    success_rate: 0,
    critical_success_rate: 0,
    mock_data_issues: 0,
    data_flow_issues: 0,
    authentication_issues: 0
  },
  test_categories: {
    direct_endpoints: { total: 0, passed: 0, failed: 0 },
    gateway_actions: { total: 0, passed: 0, failed: 0 },
    frontend_integration: { total: 0, passed: 0, failed: 0 }
  },
  critical_issues: [],
  recommendations: [],
  detailed_reports: []
};

function displayHeader() {
  console.log('🚀 MATERIAL KAI VISION PLATFORM - COMPREHENSIVE API VALIDATION');
  console.log('================================================================');
  console.log('📊 Validation Scope:');
  console.log(`   • ${API_ENDPOINTS.length} Direct MIVAA API Endpoints`);
  console.log(`   • ${GATEWAY_ACTIONS.length} Supabase Gateway Actions`);
  console.log(`   • 7 Critical Frontend Components`);
  console.log(`   • Complete Data Flow Validation`);
  console.log(`   • Mock Data Detection & Removal`);
  console.log(`   • Authentication & Error Handling`);
  console.log('================================================================');
  console.log(`🎯 MIVAA Service: ${CONFIG.MIVAA_BASE_URL}`);
  console.log(`🌐 Supabase: ${CONFIG.SUPABASE_URL}`);
  console.log(`🔑 Authentication: ${CONFIG.TEST_AUTH_TOKEN ? 'Configured' : 'Missing'}`);
  console.log('================================================================\n');
}

async function runMasterValidation() {
  displayHeader();
  
  console.log('⏱️  Starting comprehensive validation...\n');
  const startTime = Date.now();
  
  try {
    // Phase 1: Direct API Endpoints Validation
    console.log('🔄 PHASE 1: DIRECT API ENDPOINTS VALIDATION');
    console.log('============================================');
    await runComprehensiveValidation();
    
    console.log('\n⏳ Waiting 5 seconds before next phase...\n');
    await sleep(5000);
    
    // Phase 2: Frontend Integration Validation  
    console.log('🔄 PHASE 2: FRONTEND INTEGRATION VALIDATION');
    console.log('===========================================');
    await runFrontendIntegrationValidation();
    
    // Phase 3: Aggregate Results and Generate Master Report
    console.log('\n🔄 PHASE 3: AGGREGATING RESULTS & GENERATING MASTER REPORT');
    console.log('==========================================================');
    await aggregateResults();
    
    const totalTime = Date.now() - startTime;
    console.log(`\n⏱️  Total validation time: ${(totalTime / 1000).toFixed(1)} seconds`);
    
    generateMasterReport();
    
  } catch (error) {
    console.error('❌ Master validation failed:', error);
    process.exit(1);
  }
}

async function aggregateResults() {
  console.log('📊 Aggregating validation results...');
  
  // Load endpoint validation results
  const endpointReports = fs.readdirSync(__dirname)
    .filter(file => file.startsWith('validation-report-') && file.endsWith('.json'))
    .sort()
    .slice(-1); // Get latest report
  
  if (endpointReports.length > 0) {
    const endpointData = JSON.parse(fs.readFileSync(path.join(__dirname, endpointReports[0]), 'utf8'));
    masterResults.test_categories.direct_endpoints = {
      total: endpointData.summary.passed + endpointData.summary.failed,
      passed: endpointData.summary.passed,
      failed: endpointData.summary.failed
    };
    masterResults.detailed_reports.push({
      type: 'endpoint_validation',
      file: endpointReports[0],
      summary: endpointData.summary
    });
  }
  
  // Load frontend integration results
  const integrationReports = fs.readdirSync(__dirname)
    .filter(file => file.startsWith('frontend-integration-report-') && file.endsWith('.json'))
    .sort()
    .slice(-1); // Get latest report
  
  if (integrationReports.length > 0) {
    const integrationData = JSON.parse(fs.readFileSync(path.join(__dirname, integrationReports[0]), 'utf8'));
    masterResults.test_categories.frontend_integration = {
      total: integrationData.summary.passed + integrationData.summary.failed,
      passed: integrationData.summary.passed,
      failed: integrationData.summary.failed
    };
    masterResults.detailed_reports.push({
      type: 'frontend_integration',
      file: integrationReports[0],
      summary: integrationData.summary
    });
    
    // Count issues
    masterResults.summary.mock_data_issues += integrationData.mock_data_issues.length;
    masterResults.summary.data_flow_issues += integrationData.data_flow_issues.length;
  }
  
  // Calculate totals
  const categories = masterResults.test_categories;
  masterResults.summary.total_tests = categories.direct_endpoints.total + 
                                     categories.gateway_actions.total + 
                                     categories.frontend_integration.total;
  masterResults.summary.passed = categories.direct_endpoints.passed + 
                                 categories.gateway_actions.passed + 
                                 categories.frontend_integration.passed;
  masterResults.summary.failed = categories.direct_endpoints.failed + 
                                 categories.gateway_actions.failed + 
                                 categories.frontend_integration.failed;
  
  if (masterResults.summary.total_tests > 0) {
    masterResults.summary.success_rate = 
      ((masterResults.summary.passed / masterResults.summary.total_tests) * 100);
  }
}

function generateMasterReport() {
  console.log('\n📋 MASTER VALIDATION REPORT');
  console.log('============================');
  
  const { summary, test_categories } = masterResults;
  
  console.log(`📈 Overall Success Rate: ${summary.success_rate.toFixed(1)}% (${summary.passed}/${summary.total_tests})`);
  console.log('\n📂 Results by Category:');
  
  Object.entries(test_categories).forEach(([category, stats]) => {
    if (stats.total > 0) {
      const rate = ((stats.passed / stats.total) * 100).toFixed(1);
      const icon = rate >= 90 ? '✅' : rate >= 70 ? '⚠️' : '❌';
      console.log(`  ${icon} ${category.replace('_', ' ')}: ${rate}% (${stats.passed}/${stats.total})`);
    }
  });
  
  // Critical Issues Summary
  console.log('\n🚨 CRITICAL ISSUES SUMMARY:');
  if (summary.mock_data_issues > 0) {
    console.log(`  • ${summary.mock_data_issues} components with mock data detected`);
    masterResults.critical_issues.push(`Mock data found in ${summary.mock_data_issues} components`);
  }
  
  if (summary.data_flow_issues > 0) {
    console.log(`  • ${summary.data_flow_issues} components with data flow issues`);
    masterResults.critical_issues.push(`Data flow issues in ${summary.data_flow_issues} components`);
  }
  
  if (summary.authentication_issues > 0) {
    console.log(`  • ${summary.authentication_issues} authentication failures`);
    masterResults.critical_issues.push(`Authentication issues in ${summary.authentication_issues} endpoints`);
  }
  
  if (masterResults.critical_issues.length === 0) {
    console.log('  🎉 No critical issues detected!');
  }
  
  // Generate Recommendations
  generateRecommendations();
  
  // Save master report
  const masterReportPath = path.join(__dirname, `master-validation-report-${Date.now()}.json`);
  fs.writeFileSync(masterReportPath, JSON.stringify(masterResults, null, 2));
  
  console.log(`\n💾 Master report saved: ${masterReportPath}`);
  
  // Generate summary for user
  generateExecutiveSummary();
}

function generateRecommendations() {
  const recommendations = [];
  
  // Priority 1: Critical Issues
  if (masterResults.summary.mock_data_issues > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Mock Data',
      action: `Remove mock data from ${masterResults.summary.mock_data_issues} components`,
      impact: 'Users receiving fake data instead of real API responses'
    });
  }
  
  if (masterResults.summary.data_flow_issues > 0) {
    recommendations.push({
      priority: 'HIGH', 
      category: 'Data Flow',
      action: `Fix data transformation issues in ${masterResults.summary.data_flow_issues} components`,
      impact: 'Frontend not properly processing backend responses'
    });
  }
  
  // Priority 2: Performance Issues
  if (masterResults.summary.success_rate < 90) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Reliability',
      action: `Improve API reliability - currently ${masterResults.summary.success_rate.toFixed(1)}%`,
      impact: 'Platform stability and user experience'
    });
  }
  
  // Priority 3: Authentication Issues
  if (masterResults.summary.authentication_issues > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Authentication',
      action: `Fix authentication for ${masterResults.summary.authentication_issues} endpoints`,
      impact: 'API access and security'
    });
  }
  
  masterResults.recommendations = recommendations;
  
  if (recommendations.length > 0) {
    console.log('\n🔧 PRIORITIZED RECOMMENDATIONS:');
    recommendations.forEach((rec, i) => {
      const priorityIcon = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${priorityIcon} [${rec.priority}] ${rec.category}: ${rec.action}`);
      console.log(`     Impact: ${rec.impact}`);
    });
  } else {
    console.log('\n🎉 EXCELLENT! No recommendations needed - all systems working perfectly!');
  }
}

function generateExecutiveSummary() {
  console.log('\n📋 EXECUTIVE SUMMARY');
  console.log('====================');
  
  const { summary } = masterResults;
  
  if (summary.success_rate >= 95) {
    console.log('🟢 STATUS: EXCELLENT - Platform is production-ready');
  } else if (summary.success_rate >= 85) {
    console.log('🟡 STATUS: GOOD - Minor issues to address');
  } else if (summary.success_rate >= 70) {
    console.log('🟠 STATUS: NEEDS ATTENTION - Several issues require fixing');
  } else {
    console.log('🔴 STATUS: CRITICAL - Major issues must be resolved before production');
  }
  
  console.log(`\n📊 Key Metrics:`);
  console.log(`   • API Success Rate: ${summary.success_rate.toFixed(1)}%`);
  console.log(`   • Total Tests: ${summary.total_tests}`);
  console.log(`   • Critical Issues: ${masterResults.critical_issues.length}`);
  console.log(`   • Mock Data Issues: ${summary.mock_data_issues}`);
  console.log(`   • Data Flow Issues: ${summary.data_flow_issues}`);
  
  console.log('\n🎯 Next Steps:');
  if (masterResults.recommendations.length > 0) {
    const highPriority = masterResults.recommendations.filter(r => r.priority === 'HIGH');
    if (highPriority.length > 0) {
      console.log(`   1. Address ${highPriority.length} high-priority issues immediately`);
      console.log(`   2. Test fixes and re-run validation`);
      console.log(`   3. Address remaining medium/low priority items`);
    } else {
      console.log(`   1. Address ${masterResults.recommendations.length} remaining issues`);
      console.log(`   2. Re-run validation to confirm fixes`);
    }
  } else {
    console.log('   🎉 Platform is ready for production deployment!');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run master validation
if (require.main === module) {
  runMasterValidation().catch(console.error);
}

module.exports = { 
  runMasterValidation,
  masterResults
};
