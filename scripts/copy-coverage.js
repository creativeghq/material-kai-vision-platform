#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Copy coverage reports to public folder for deployment
 * This allows the coverage reports to be served at /coverage/
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coverageDir = path.join(process.cwd(), 'coverage');
const publicCoverageDir = path.join(process.cwd(), 'public', 'coverage');

// Check if coverage directory exists
if (!fs.existsSync(coverageDir)) {
  console.log('ℹ️  Coverage directory not found. Skipping copy.');
  process.exit(0);
}

// Remove existing coverage in public if it exists
if (fs.existsSync(publicCoverageDir)) {
  console.log('🗑️  Removing existing coverage from public...');
  fs.rmSync(publicCoverageDir, { recursive: true, force: true });
}

// Copy coverage to public
console.log('📋 Copying coverage reports to public folder...');
fs.cpSync(coverageDir, publicCoverageDir, { recursive: true });

console.log('✅ Coverage reports copied successfully!');
console.log(`📍 Access at: /coverage/`);

