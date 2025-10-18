# Scripts Directory

Essential scripts for the Material Kai Vision Platform testing, database management, and utilities.

## 📁 Directory Structure

### `testing/`
Production-ready test scripts for QA and workflow validation:

- **`qa-comprehensive-test.js`** - Main QA test suite
  - Tests all 6 critical flows (PDF processing, storage, search, quality, auth, errors)
  - 13 comprehensive tests
  - Run: `node scripts/testing/qa-comprehensive-test.js`

- **`end-to-end-workflow.js`** - Basic end-to-end workflow test
  - 6-step workflow mimicking frontend flow
  - Tests PDF upload → processing → storage → retrieval
  - Run: `node scripts/testing/end-to-end-workflow.js`

- **`comprehensive-workflow-testing.js`** - Advanced workflow with metrics
  - 8-step enhanced workflow
  - Includes layout analysis, quality scoring, similarity testing
  - Run: `node scripts/testing/comprehensive-workflow-testing.js`

### `database/`
Database management and maintenance scripts:

- **`cleanup-database.js`** - Database and storage cleanup utility
  - Clears all test data while preserving user/config data
  - Deletes storage files from all buckets
  - Reports detailed cleanup statistics
  - Run: `node scripts/database/cleanup-database.js`

### `utilities/`
General utility scripts and tools:

- **`generate-keys.ps1`** - PowerShell script to generate API keys and secrets
- **`generate-mivaa-key.cjs`** - MIVAA API key generation
- **`error-handling-diagnostic.cjs`** - Error handling diagnostic tool

## 🚀 Quick Start

### Run QA Tests
```bash
node scripts/testing/qa-comprehensive-test.js
```

### Clean Database
```bash
node scripts/database/cleanup-database.js
```

### Generate Keys
```powershell
.\scripts\utilities\generate-keys.ps1
```

## 📊 What Was Cleaned Up

This directory was reorganized from **225 scripts** down to **8 essential scripts** (96% reduction).

**Removed:**
- ~120 one-off test scripts (test-*.js)
- ~80 debugging scripts (check-*, debug-*, monitor-*, verify-*)
- ~15 workflow-specific test scripts
- 6 subdirectories of old tests (auth-tests, frontend-tests, integration-tests, mivaa-tests, etc.)
- All result/output JSON files

**Kept:**
- 3 production-ready test scripts
- 1 database cleanup utility
- 3 utility scripts
- 2 README files

## 📝 Notes

- All scripts are production-ready and actively maintained
- Test scripts output results to terminal for easy monitoring
- Database cleanup preserves user data and configuration
- Each script includes comprehensive error handling and reporting
