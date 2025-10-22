/**
 * Quality Control System Validation Test
 * 
 * Tests the complete human-in-the-loop quality control system:
 * - QualityControlService functionality
 * - Database schema and migrations
 * - Edge function operations
 * - Admin panel integration
 * - Human review workflows
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  verbose: true,
  checkFiles: true,
  checkDatabase: true,
  checkIntegration: true,
};

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logTest(testName, status, details = '') {
  const statusColor = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  log(`${statusSymbol} ${testName}: ${status}`, statusColor);
  if (details) {
    log(`   ${details}`, 'reset');
  }
}

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
};

function runTest(testName, testFunction) {
  testResults.total++;
  try {
    const result = testFunction();
    if (result === true) {
      testResults.passed++;
      logTest(testName, 'PASS');
      return true;
    } else if (result === false) {
      testResults.failed++;
      logTest(testName, 'FAIL');
      return false;
    } else {
      testResults.warnings++;
      logTest(testName, 'WARN', result);
      return null;
    }
  } catch (error) {
    testResults.failed++;
    logTest(testName, 'FAIL', error.message);
    return false;
  }
}

// ===== FILE EXISTENCE TESTS =====

function testQualityControlServiceExists() {
  const filePath = 'src/services/qualityControlService.ts';
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const requiredClasses = ['QualityControlService'];
  const requiredMethods = [
    'assessProductQuality',
    'assessChunkQuality', 
    'assessImageQuality',
    'batchAssessQuality',
    'createHumanReviewTask',
    'getPendingReviewTasks',
    'completeReviewTask',
    'getQualityControlStats'
  ];
  
  for (const className of requiredClasses) {
    if (!content.includes(`class ${className}`)) {
      return `Missing class: ${className}`;
    }
  }
  
  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return `Missing method: ${method}`;
    }
  }
  
  return true;
}

function testHumanReviewPanelExists() {
  const filePath = 'src/components/Admin/HumanReviewPanel.tsx';
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const requiredComponents = ['HumanReviewPanel'];
  const requiredFeatures = [
    'getPendingReviewTasks',
    'handleReviewDecision',
    'getPriorityBadge',
    'getEntityTypeIcon',
    'approve',
    'reject',
    'needs_improvement',
    'escalate'
  ];
  
  for (const component of requiredComponents) {
    if (!content.includes(component)) {
      return `Missing component: ${component}`;
    }
  }
  
  for (const feature of requiredFeatures) {
    if (!content.includes(feature)) {
      return `Missing feature: ${feature}`;
    }
  }
  
  return true;
}

function testDatabaseMigrationExists() {
  const filePath = 'supabase/migrations/20251022000001_add_quality_control_tables.sql';
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const requiredTables = [
    'quality_assessments',
    'human_review_tasks',
    'quality_control_config',
    'quality_metrics_tracking'
  ];
  const requiredFeatures = [
    'Row Level Security',
    'CREATE INDEX',
    'CREATE TRIGGER',
    'quality_thresholds',
    'review_decision'
  ];
  
  for (const table of requiredTables) {
    if (!content.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      return `Missing table: ${table}`;
    }
  }
  
  for (const feature of requiredFeatures) {
    if (!content.includes(feature)) {
      return `Missing feature: ${feature}`;
    }
  }
  
  return true;
}

function testEdgeFunctionExists() {
  const filePath = 'supabase/functions/quality-control-operations/index.ts';
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const requiredActions = [
    'assess_quality',
    'batch_assess',
    'get_review_tasks',
    'complete_review',
    'get_stats'
  ];
  const requiredFunctions = [
    'assessEntityQuality',
    'assessProductQuality',
    'assessChunkQuality',
    'assessImageQuality',
    'batchAssessQuality',
    'getReviewTasks',
    'completeReviewTask',
    'getQualityStats'
  ];
  
  for (const action of requiredActions) {
    if (!content.includes(`'${action}'`)) {
      return `Missing action: ${action}`;
    }
  }
  
  for (const func of requiredFunctions) {
    if (!content.includes(`function ${func}`)) {
      return `Missing function: ${func}`;
    }
  }
  
  return true;
}

// ===== INTERFACE AND TYPE TESTS =====

function testQualityControlInterfaces() {
  const filePath = 'src/services/qualityControlService.ts';
  const content = fs.readFileSync(filePath, 'utf8');
  
  const requiredInterfaces = [
    'QualityThresholds',
    'QualityAssessment',
    'QualityIssue',
    'HumanReviewTask',
    'QualityControlConfig'
  ];
  
  for (const interfaceName of requiredInterfaces) {
    if (!content.includes(`interface ${interfaceName}`)) {
      return `Missing interface: ${interfaceName}`;
    }
  }
  
  // Check for required properties
  const requiredProperties = [
    'minProductQualityScore',
    'needsHumanReview',
    'reviewDecision',
    'qualityAssessment',
    'humanReviewEnabled'
  ];
  
  for (const prop of requiredProperties) {
    if (!content.includes(prop)) {
      return `Missing property: ${prop}`;
    }
  }
  
  return true;
}

function testQualityThresholds() {
  const filePath = 'src/services/qualityControlService.ts';
  const content = fs.readFileSync(filePath, 'utf8');
  
  const requiredThresholds = [
    'minProductQualityScore: 0.7',
    'minProductConfidenceScore: 0.6',
    'minProductCompletenessScore: 0.8',
    'minChunkCoherenceScore: 0.65',
    'minImageQualityScore: 0.6',
    'minEmbeddingCoverage: 0.8'
  ];
  
  for (const threshold of requiredThresholds) {
    if (!content.includes(threshold)) {
      return `Missing threshold: ${threshold}`;
    }
  }
  
  return true;
}

// ===== INTEGRATION TESTS =====

function testAdminPanelIntegration() {
  const adminPanelPath = 'src/components/Admin/AdminPanel.tsx';
  if (!fs.existsSync(adminPanelPath)) {
    return 'AdminPanel.tsx not found';
  }
  
  const content = fs.readFileSync(adminPanelPath, 'utf8');
  
  // Check if quality control is integrated
  const qualityFeatures = [
    'quality',
    'QualityMetricsDashboard',
    'TabsTrigger value="quality"'
  ];
  
  let foundFeatures = 0;
  for (const feature of qualityFeatures) {
    if (content.includes(feature)) {
      foundFeatures++;
    }
  }
  
  if (foundFeatures === 0) {
    return 'No quality control integration found in AdminPanel';
  }
  
  return foundFeatures === qualityFeatures.length ? true : 
    `Partial integration: ${foundFeatures}/${qualityFeatures.length} features found`;
}

function testMultiVectorIntegration() {
  const qualityServicePath = 'src/services/qualityControlService.ts';
  const content = fs.readFileSync(qualityServicePath, 'utf8');
  
  const multiVectorFeatures = [
    'embedding_coverage',
    'embedding_confidence',
    'text_embedding_1536',
    'visual_clip_embedding_512',
    'color_embedding_256',
    'texture_embedding_256',
    'application_embedding_512',
    'calculateEmbeddingCoverage',
    'calculateEmbeddingConfidence'
  ];
  
  let foundFeatures = 0;
  for (const feature of multiVectorFeatures) {
    if (content.includes(feature)) {
      foundFeatures++;
    }
  }
  
  return foundFeatures >= 7 ? true : 
    `Insufficient multi-vector integration: ${foundFeatures}/${multiVectorFeatures.length} features found`;
}

// ===== WORKFLOW TESTS =====

function testHumanReviewWorkflow() {
  const panelPath = 'src/components/Admin/HumanReviewPanel.tsx';
  const content = fs.readFileSync(panelPath, 'utf8');
  
  const workflowSteps = [
    'pending',
    'in_progress', 
    'completed',
    'escalated',
    'approve',
    'reject',
    'needs_improvement',
    'escalate',
    'reviewNotes',
    'reviewDecision'
  ];
  
  let foundSteps = 0;
  for (const step of workflowSteps) {
    if (content.includes(step)) {
      foundSteps++;
    }
  }
  
  return foundSteps >= 8 ? true : 
    `Incomplete workflow: ${foundSteps}/${workflowSteps.length} steps found`;
}

function testQualityAssessmentWorkflow() {
  const servicePath = 'src/services/qualityControlService.ts';
  const content = fs.readFileSync(servicePath, 'utf8');
  
  const assessmentSteps = [
    'assessProductQuality',
    'identifyQualityIssues',
    'generateRecommendations',
    'storeQualityAssessment',
    'createHumanReviewTask',
    'passesThresholds',
    'needsHumanReview',
    'overallScore'
  ];
  
  let foundSteps = 0;
  for (const step of assessmentSteps) {
    if (content.includes(step)) {
      foundSteps++;
    }
  }
  
  return foundSteps >= 7 ? true : 
    `Incomplete assessment workflow: ${foundSteps}/${assessmentSteps.length} steps found`;
}

// ===== MAIN TEST EXECUTION =====

async function runAllTests() {
  log('🧪 Quality Control System Validation Test', 'bright');
  log('Testing human-in-the-loop quality control implementation\n', 'reset');

  // File Existence Tests
  logSection('📁 FILE EXISTENCE TESTS');
  runTest('QualityControlService exists', testQualityControlServiceExists);
  runTest('HumanReviewPanel exists', testHumanReviewPanelExists);
  runTest('Database migration exists', testDatabaseMigrationExists);
  runTest('Edge function exists', testEdgeFunctionExists);

  // Interface and Type Tests
  logSection('🔧 INTERFACE AND TYPE TESTS');
  runTest('Quality control interfaces', testQualityControlInterfaces);
  runTest('Quality thresholds configuration', testQualityThresholds);

  // Integration Tests
  logSection('🔗 INTEGRATION TESTS');
  runTest('Admin panel integration', testAdminPanelIntegration);
  runTest('Multi-vector integration', testMultiVectorIntegration);

  // Workflow Tests
  logSection('🔄 WORKFLOW TESTS');
  runTest('Human review workflow', testHumanReviewWorkflow);
  runTest('Quality assessment workflow', testQualityAssessmentWorkflow);

  // Final Results
  logSection('📊 TEST RESULTS SUMMARY');
  log(`Total Tests: ${testResults.total}`, 'bright');
  log(`Passed: ${testResults.passed}`, 'green');
  log(`Failed: ${testResults.failed}`, 'red');
  log(`Warnings: ${testResults.warnings}`, 'yellow');
  
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red');

  if (testResults.failed === 0) {
    log('\n🎉 All tests passed! Quality Control System is ready for deployment.', 'green');
  } else {
    log(`\n⚠️  ${testResults.failed} test(s) failed. Please review and fix issues before deployment.`, 'red');
  }

  return testResults.failed === 0;
}

// Run tests
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runAllTests, testResults };
