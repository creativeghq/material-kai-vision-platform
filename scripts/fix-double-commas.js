#!/usr/bin/env node

/**
 * Fix double commas (semicolon followed by comma)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 Fixing double commas (;,)...\n');

// Find all TypeScript files in src
const files = glob.sync('src/**/*.{ts,tsx}', { cwd: rootDir });

let totalFixed = 0;

for (const file of files) {
  const filePath = path.join(rootDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Replace all instances of ;, with just ;
  content = content.replace(/;,/g, ';');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalFixed++;
    console.log(`✅ Fixed ${file}`);
  }
}

console.log(`\n✨ Complete! Fixed ${totalFixed} files.`);

