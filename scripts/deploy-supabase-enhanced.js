#!/usr/bin/env node

/**
 * Enhanced Supabase Functions Deployment Script
 * 
 * Features:
 * - Beautiful UI with collapsible sections
 * - Clear backup/rollback process explanation
 * - Visible deployment URLs
 * - No .env file dependencies (GitHub secrets only)
 * - Streamlined output with hidden technical details
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  SUPABASE_FUNCTIONS_DIR: 'supabase/functions',
  BACKUP_DIR: 'backups', // Changed from deployment-backups to backups
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,
  TIMEOUT: 300000,
};

// Enhanced UI Logger with collapsible sections
class EnhancedLogger {
  constructor() {
    this.startTime = new Date();
    this.deployedUrls = [];
    this.currentSection = null;
  }

  // Main status messages
  status(message) {
    console.log(`\n🚀 ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  error(message) {
    console.log(`❌ ${message}`);
  }

  warning(message) {
    console.log(`⚠️  ${message}`);
  }

  // URL tracking
  addDeployedUrl(functionName, url) {
    this.deployedUrls.push({ functionName, url });
  }

  // Collapsible sections
  startSection(title) {
    this.currentSection = title;
    console.log(`\n📋 ${title}`);
    console.log('━'.repeat(50));
  }

  endSection() {
    if (this.currentSection) {
      console.log('━'.repeat(50));
      console.log(`✓ ${this.currentSection} completed\n`);
      this.currentSection = null;
    }
  }

  // Hidden details (only shown in verbose mode)
  detail(message) {
    if (process.env.VERBOSE === 'true') {
      console.log(`  └─ ${message}`);
    }
  }

  // Show final summary
  showSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 DEPLOYMENT SUMMARY');
    console.log('═'.repeat(60));
    
    if (this.deployedUrls.length > 0) {
      console.log('\n📍 DEPLOYED FUNCTION URLS:');
      this.deployedUrls.forEach(({ functionName, url }) => {
        console.log(`   • ${functionName}: ${url}`);
      });
    }
    
    const duration = Math.round((Date.now() - this.startTime.getTime()) / 1000);
    console.log(`\n⏱️  Total deployment time: ${duration}s`);
    console.log('═'.repeat(60));
  }
}

class SupabaseDeployer {
  constructor(options = {}) {
    this.logger = new EnhancedLogger();
    this.environment = options.environment || this.detectEnvironment();
    this.projectId = options.projectId || this.getProjectId();
    this.specificFunctions = options.functions || [];
    this.skipBackup = options.skipBackup || false;
    this.backupId = null;
  }

  detectEnvironment() {
    if (process.env.GITHUB_REF === 'refs/heads/main') return 'production';
    if (process.env.GITHUB_REF === 'refs/heads/staging') return 'staging';
    return 'development';
  }

  getProjectId() {
    try {
      const configPath = path.join('supabase', 'config.toml');
      const config = fs.readFileSync(configPath, 'utf8');
      const match = config.match(/project_id\s*=\s*"([^"]+)"/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  async validateEnvironment() {
    this.logger.startSection('Environment Validation');

    // Only check GitHub secrets - no .env files
    const requiredSecrets = ['SUPABASE_ACCESS_TOKEN'];
    if (this.environment === 'production') {
      requiredSecrets.push('SUPABASE_DB_PASSWORD');
    }

    for (const secret of requiredSecrets) {
      if (!process.env[secret]) {
        throw new Error(`Missing required GitHub secret: ${secret}`);
      }
      this.logger.detail(`✓ ${secret} is configured`);
    }

    if (!this.projectId) {
      throw new Error('Project ID not found in supabase/config.toml');
    }

    this.logger.success(`Environment: ${this.environment}`);
    this.logger.success(`Project ID: ${this.projectId}`);
    this.logger.endSection();
  }

  async createBackup() {
    if (this.skipBackup) {
      this.logger.warning('Backup creation skipped');
      return null;
    }

    this.logger.startSection('Creating Deployment Backup');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.backupId = timestamp;
    const backupPath = path.join(CONFIG.BACKUP_DIR, this.backupId);

    try {
      // Create backup directory structure
      fs.mkdirSync(backupPath, { recursive: true });
      fs.mkdirSync(path.join(backupPath, 'functions'), { recursive: true });
      fs.mkdirSync(path.join(backupPath, 'config'), { recursive: true });

      // Backup functions
      if (fs.existsSync(CONFIG.SUPABASE_FUNCTIONS_DIR)) {
        this.logger.detail('Backing up function code...');
        execSync(`cp -r ${CONFIG.SUPABASE_FUNCTIONS_DIR}/* ${path.join(backupPath, 'functions')}/`, { stdio: 'pipe' });
      }

      // Backup config
      const configFiles = ['supabase/config.toml'];
      configFiles.forEach(file => {
        if (fs.existsSync(file)) {
          this.logger.detail(`Backing up ${file}...`);
          fs.copyFileSync(file, path.join(backupPath, 'config', path.basename(file)));
        }
      });

      // Create metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        environment: this.environment,
        projectId: this.projectId,
        functions: this.getFunctionList(),
        backupId: this.backupId
      };

      fs.writeFileSync(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      this.logger.success(`Backup created: ${CONFIG.BACKUP_DIR}/${this.backupId}`);
      this.logger.detail(`Backup location: ${path.resolve(backupPath)}`);
      this.logger.endSection();

      // Cleanup old backups (keep last 10)
      this.cleanupOldBackups();

      return this.backupId;
    } catch (error) {
      this.logger.error(`Backup creation failed: ${error.message}`);
      throw error;
    }
  }

  cleanupOldBackups() {
    try {
      if (!fs.existsSync(CONFIG.BACKUP_DIR)) return;

      const backups = fs.readdirSync(CONFIG.BACKUP_DIR)
        .filter(dir => fs.statSync(path.join(CONFIG.BACKUP_DIR, dir)).isDirectory())
        .sort()
        .reverse();

      if (backups.length > 10) {
        const toDelete = backups.slice(10);
        toDelete.forEach(backup => {
          const backupPath = path.join(CONFIG.BACKUP_DIR, backup);
          fs.rmSync(backupPath, { recursive: true, force: true });
          this.logger.detail(`Cleaned up old backup: ${backup}`);
        });
      }
    } catch (error) {
      this.logger.warning(`Backup cleanup failed: ${error.message}`);
    }
  }

  getFunctionList() {
    try {
      if (!fs.existsSync(CONFIG.SUPABASE_FUNCTIONS_DIR)) return [];
      
      return fs.readdirSync(CONFIG.SUPABASE_FUNCTIONS_DIR)
        .filter(item => {
          const itemPath = path.join(CONFIG.SUPABASE_FUNCTIONS_DIR, item);
          return fs.statSync(itemPath).isDirectory();
        });
    } catch (error) {
      return [];
    }
  }

  async deployFunctions() {
    this.logger.startSection('Deploying Functions');

    const functions = this.specificFunctions.length > 0 
      ? this.specificFunctions 
      : this.getFunctionList();

    if (functions.length === 0) {
      this.logger.warning('No functions found to deploy');
      this.logger.endSection();
      return;
    }

    this.logger.status(`Deploying ${functions.length} function(s): ${functions.join(', ')}`);

    for (const functionName of functions) {
      await this.deployFunction(functionName);
    }

    this.logger.endSection();
  }

  async deployFunction(functionName) {
    const maxRetries = CONFIG.MAX_RETRIES;
    let attempt = 1;

    while (attempt <= maxRetries) {
      try {
        this.logger.detail(`Deploying ${functionName} (attempt ${attempt}/${maxRetries})...`);

        const deployCmd = [
          'supabase', 'functions', 'deploy', functionName,
          '--project-ref', this.projectId
        ];

        const result = execSync(deployCmd.join(' '), { 
          stdio: 'pipe',
          timeout: CONFIG.TIMEOUT,
          env: { ...process.env }
        });

        // Extract and store the function URL
        const output = result.toString();
        const urlMatch = output.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          this.logger.addDeployedUrl(functionName, urlMatch[0]);
        }

        this.logger.success(`${functionName} deployed successfully`);
        return;

      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(`${functionName} deployment failed after ${maxRetries} attempts`);
          throw new Error(`Function ${functionName} deployment failed: ${error.message}`);
        }

        this.logger.warning(`${functionName} deployment attempt ${attempt} failed, retrying...`);
        await this.sleep(CONFIG.RETRY_DELAY);
        attempt++;
      }
    }
  }

  async runHealthChecks() {
    this.logger.startSection('Health Checks');

    if (this.deployedUrls.length === 0) {
      this.logger.warning('No deployed URLs to check');
      this.logger.endSection();
      return;
    }

    for (const { functionName, url } of this.deployedUrls) {
      await this.checkFunctionHealth(functionName, url);
    }

    this.logger.endSection();
  }

  async checkFunctionHealth(functionName, url) {
    try {
      this.logger.detail(`Checking health of ${functionName}...`);
      
      // Simple HTTP check
      const response = await fetch(url, { 
        method: 'GET',
        timeout: 10000 
      });

      if (response.status < 500) {
        this.logger.success(`${functionName} is healthy (${response.status})`);
      } else {
        this.logger.warning(`${functionName} returned ${response.status}`);
      }
    } catch (error) {
      this.logger.warning(`${functionName} health check failed: ${error.message}`);
    }
  }

  async rollback() {
    if (!this.backupId) {
      throw new Error('No backup available for rollback');
    }

    this.logger.startSection('Rolling Back Deployment');
    
    const backupPath = path.join(CONFIG.BACKUP_DIR, this.backupId);
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    try {
      // Restore functions from backup
      const backupFunctionsPath = path.join(backupPath, 'functions');
      if (fs.existsSync(backupFunctionsPath)) {
        this.logger.detail('Restoring functions from backup...');
        
        // Clear current functions
        if (fs.existsSync(CONFIG.SUPABASE_FUNCTIONS_DIR)) {
          fs.rmSync(CONFIG.SUPABASE_FUNCTIONS_DIR, { recursive: true, force: true });
        }
        
        // Restore from backup
        fs.mkdirSync(CONFIG.SUPABASE_FUNCTIONS_DIR, { recursive: true });
        execSync(`cp -r ${backupFunctionsPath}/* ${CONFIG.SUPABASE_FUNCTIONS_DIR}/`, { stdio: 'pipe' });
      }

      // Redeploy functions from backup
      const functions = this.getFunctionList();
      for (const functionName of functions) {
        await this.deployFunction(functionName);
      }

      this.logger.success('Rollback completed successfully');
      this.logger.endSection();
    } catch (error) {
      this.logger.error(`Rollback failed: ${error.message}`);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async deploy() {
    try {
      console.log('\n🚀 SUPABASE DEPLOYMENT STARTING');
      console.log('═'.repeat(60));
      
      // Show backup explanation
      this.showBackupExplanation();

      await this.validateEnvironment();
      await this.createBackup();
      await this.deployFunctions();
      await this.runHealthChecks();

      this.logger.showSummary();
      
    } catch (error) {
      this.logger.error(`Deployment failed: ${error.message}`);
      
      if (this.backupId) {
        this.logger.status('Attempting automatic rollback...');
        try {
          await this.rollback();
        } catch (rollbackError) {
          this.logger.error(`Rollback also failed: ${rollbackError.message}`);
        }
      }
      
      process.exit(1);
    }
  }

  showBackupExplanation() {
    console.log('\n📦 BACKUP & ROLLBACK PROCESS');
    console.log('━'.repeat(50));
    console.log('📍 Backup Location: ./backups/[timestamp]/');
    console.log('📋 Backup Contents:');
    console.log('   • functions/ - All function code');
    console.log('   • config/ - Supabase configuration');
    console.log('   • metadata.json - Deployment info');
    console.log('🔄 Rollback: Automatic on failure, manual via script');
    console.log('🗂️  Retention: Last 10 backups kept automatically');
    console.log('━'.repeat(50));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--environment':
      case '-e':
        options.environment = args[++i];
        break;
      case '--functions':
      case '-f':
        options.functions = args[++i].split(',');
        break;
      case '--project-id':
      case '-p':
        options.projectId = args[++i];
        break;
      case '--skip-backup':
        options.skipBackup = true;
        break;
      case '--verbose':
      case '-v':
        process.env.VERBOSE = 'true';
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  const deployer = new SupabaseDeployer(options);
  await deployer.deploy();
}

function showHelp() {
  console.log(`
🚀 Supabase Functions Deployment Script

Usage: node deploy-supabase-enhanced.js [options]

Options:
  -e, --environment <env>     Target environment (development|staging|production)
  -f, --functions <list>      Comma-separated list of functions to deploy
  -p, --project-id <id>       Supabase project ID
  --skip-backup              Skip backup creation
  -v, --verbose              Show detailed output
  -h, --help                 Show this help message

Examples:
  node deploy-supabase-enhanced.js
  node deploy-supabase-enhanced.js -e production
  node deploy-supabase-enhanced.js -f "api-gateway,search-functions"
  node deploy-supabase-enhanced.js --verbose

Environment Variables (GitHub Secrets):
  SUPABASE_ACCESS_TOKEN      Required: Supabase access token
  SUPABASE_DB_PASSWORD       Required for production deployments

Backup Process:
  • Backups stored in: ./backups/[timestamp]/
  • Contains: function code, config, metadata
  • Automatic cleanup: keeps last 10 backups
  • Rollback: automatic on failure, manual via rollback script
`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  });
}

module.exports = SupabaseDeployer;