#!/usr/bin/env node

/**
 * Dependency Fix Script for Material Kai Vision Platform
 * Addresses deprecation warnings and compatibility issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Starting dependency fix process...');

// Read package.json
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('📦 Current dependencies analysis:');

// Check for problematic dependencies
const problematicDeps = {
  'boolean': {
    issue: 'Package no longer supported',
    action: 'Remove if possible, replace with native boolean operations'
  },
  'three-mesh-bvh': {
    issue: 'Version incompatible with current Three.js',
    action: 'Update to v0.8.0+ for Three.js compatibility',
    fix: 'three-mesh-bvh@latest'
  }
};

// Analyze dependencies
let hasIssues = false;
const fixes = [];

Object.keys(packageJson.dependencies || {}).forEach(dep => {
  if (problematicDeps[dep]) {
    console.log(`⚠️  Found ${dep}: ${problematicDeps[dep].issue}`);
    hasIssues = true;
    if (problematicDeps[dep].fix) {
      fixes.push(problematicDeps[dep].fix);
    }
  }
});

Object.keys(packageJson.devDependencies || {}).forEach(dep => {
  if (problematicDeps[dep]) {
    console.log(`⚠️  Found ${dep} (dev): ${problematicDeps[dep].issue}`);
    hasIssues = true;
    if (problematicDeps[dep].fix) {
      fixes.push(problematicDeps[dep].fix);
    }
  }
});

if (!hasIssues) {
  console.log('✅ No known problematic dependencies found');
  process.exit(0);
}

// Apply fixes
if (fixes.length > 0) {
  console.log('\n🔨 Applying dependency fixes...');
  
  try {
    // Update specific packages
    fixes.forEach(fix => {
      console.log(`📥 Installing ${fix}...`);
      execSync(`npm install ${fix}`, { stdio: 'inherit' });
    });
    
    console.log('✅ Dependency fixes applied successfully');
    
    // Run audit fix
    console.log('\n🔍 Running security audit...');
    try {
      execSync('npm audit fix', { stdio: 'inherit' });
      console.log('✅ Security audit completed');
    } catch (auditError) {
      console.log('⚠️  Audit fix completed with warnings (this is normal)');
    }
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error.message);
    process.exit(1);
  }
}

// Generate dependency report
const report = {
  timestamp: new Date().toISOString(),
  fixes_applied: fixes,
  recommendations: [
    'Monitor deprecation warnings during builds',
    'Update dependencies regularly',
    'Test thoroughly after dependency updates',
    'Consider alternatives for deprecated packages'
  ]
};

fs.writeFileSync('dependency-fix-report.json', JSON.stringify(report, null, 2));
console.log('\n📋 Dependency fix report saved to dependency-fix-report.json');
console.log('🎉 Dependency fix process completed!');