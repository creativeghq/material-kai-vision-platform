#!/usr/bin/env node

/**
 * Vercel Deployment Setup Script
 * Prepares the Material Kai Vision Platform for Vercel deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Vercel deployment...\n');

// Check if package.json exists
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found. Please run this script from the project root.');
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Verify build script exists
if (!packageJson.scripts || !packageJson.scripts.build) {
  console.error('❌ Build script not found in package.json');
  process.exit(1);
}

console.log('✅ Project structure validated');

// Check for environment variables
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  console.log('✅ Environment template found (.env.example)');
  
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    console.log('⚠️  .env.local not found. Please create it based on .env.example');
  } else {
    console.log('✅ Local environment file exists');
  }
} else {
  console.log('⚠️  .env.example not found');
}

// Check Vercel configuration
const vercelConfigPath = path.join(process.cwd(), 'vercel.json');
if (fs.existsSync(vercelConfigPath)) {
  console.log('✅ Vercel configuration found');
} else {
  console.log('❌ vercel.json not found');
}

// Bundle size analysis recommendations
console.log('\n📊 Bundle Optimization Recommendations:');
console.log('1. Run "npm run build" to check bundle size');
console.log('2. Consider code splitting for large AI/ML libraries');
console.log('3. Use dynamic imports for Three.js components');
console.log('4. Optimize Hugging Face model loading');

// Deployment checklist
console.log('\n📋 Pre-deployment Checklist:');
console.log('□ Environment variables configured in Vercel dashboard');
console.log('□ Supabase project URL and keys set');
console.log('□ Build command verified (npm run build)');
console.log('□ Output directory set to "dist"');
console.log('□ Bundle size optimized (<25MB recommended)');
console.log('□ Edge function compatibility verified');

console.log('\n🎯 Next Steps:');
console.log('1. Install Vercel CLI: npm i -g vercel');
console.log('2. Login to Vercel: vercel login');
console.log('3. Deploy: vercel --prod');

console.log('\n✨ Setup complete! Ready for Vercel deployment.');