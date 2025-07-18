#!/usr/bin/env node

/**
 * Simple Supabase Functions Deployment Script
 * Deploys all functions to Supabase and optionally triggers Vercel deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function runCommand(command, description) {
  try {
    log(`${description}...`);
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    log(`✅ ${description} completed`);
    return output;
  } catch (error) {
    log(`❌ ${description} failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    log('🚀 Starting Supabase deployment');

    // Check if we have the required environment variables
    const projectId = process.env.SUPABASE_PROJECT_ID;
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

    if (!projectId || !accessToken) {
      throw new Error('Missing required environment variables: SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN');
    }

    // Check if supabase directory exists
    if (!fs.existsSync('supabase')) {
      throw new Error('supabase directory not found');
    }

    // Deploy functions
    runCommand(
      `supabase functions deploy --project-ref ${projectId}`,
      'Deploying Supabase functions'
    );

    log('📋 Deployment Summary:');
    log(`   Project: ${projectId}`);
    log(`   Functions deployed from: ./supabase/functions/`);
    log(`   Function URLs: https://${projectId}.supabase.co/functions/v1/[function-name]`);

    // Trigger Vercel deployment if webhook is configured
    const vercelHook = process.env.VERCEL_DEPLOY_HOOK;
    if (vercelHook) {
      try {
        runCommand(
          `curl -X POST "${vercelHook}"`,
          'Triggering Vercel deployment'
        );
      } catch (error) {
        log('⚠️ Vercel deployment trigger failed, but Supabase deployment succeeded');
      }
    } else {
      log('ℹ️ VERCEL_DEPLOY_HOOK not configured - skipping Vercel deployment');
    }

    log('🎉 Deployment completed successfully');

  } catch (error) {
    log(`💥 Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };