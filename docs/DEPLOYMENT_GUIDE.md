# Supabase Functions Deployment Guide

Simple deployment setup for Supabase Edge Functions with Vercel integration.

## Quick Setup

### 1. GitHub Secrets Configuration

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

```
SUPABASE_PROJECT_ID=your-project-id
SUPABASE_ACCESS_TOKEN=your-access-token
VERCEL_DEPLOY_HOOK=https://api.vercel.com/v1/integrations/deploy/... (optional)
```

### 2. Get Your Supabase Credentials

**Project ID:**
- Go to [Supabase Dashboard](https://supabase.com/dashboard)
- Select your project
- Go to Settings > General
- Copy your "Reference ID"

**Access Token:**
- Go to [Supabase Dashboard](https://supabase.com/dashboard)
- Click your profile (top right) > Access Tokens
- Create a new token with appropriate permissions

**Vercel Deploy Hook (Optional):**
- Go to your Vercel project settings
- Navigate to Git > Deploy Hooks
- Create a new hook and copy the URL

## Usage

### Automatic Deployment

The deployment runs automatically when you:
- Push to `main` branch
- Modify any files in the `supabase/` directory (functions, migrations, config, etc.)

### Manual Deployment

**Via GitHub Actions:**
1. Go to your repository's Actions tab
2. Select "Deploy Supabase Functions"
3. Click "Run workflow"

**Via Local Script:**
```bash
# Set environment variables
export SUPABASE_PROJECT_ID=your-project-id
export SUPABASE_ACCESS_TOKEN=your-access-token
export VERCEL_DEPLOY_HOOK=your-vercel-hook  # optional

# Run deployment
node scripts/deploy.js
```

## What Gets Deployed

- All functions in `supabase/functions/` directory
- Functions are deployed to: `https://your-project-id.supabase.co/functions/v1/function-name`

## Current Functions

Based on your `supabase/config.toml`, these functions will be deployed:

**AI & ML Services:**
- `ai-chat` - AI chat functionality
- `ai-material-analysis` - Material analysis
- `huggingface-model-trainer` - Model training
- `spaceformer-analysis` - 3D analysis

**Search & RAG:**
- `enhanced-rag-search` - Enhanced search
- `rag-knowledge-search` - Knowledge search

**Processing:**
- `convertapi-pdf-processor` - PDF processing
- `ocr-processing` - OCR functionality
- `nerf-processor` - NeRF processing
- `svbrdf-extractor` - Material extraction

**Core Services:**
- `api-gateway` - Main API gateway
- `material-scraper` - Web scraping
- `scrape-session-manager` - Session management
- `scrape-single-page` - Single page scraping
- `parse-sitemap` - Sitemap parsing
- `enhanced-crewai` - Enhanced AI crew
- `crewai-3d-generation` - 3D generation

## Troubleshooting

**Deployment fails with "Missing environment variables":**
- Check that `SUPABASE_PROJECT_ID` and `SUPABASE_ACCESS_TOKEN` are set in GitHub secrets

**Functions not accessible:**
- Verify your project ID is correct
- Check that functions exist in `supabase/functions/` directory
- Ensure Supabase CLI is properly configured

**Vercel deployment not triggered:**
- Verify `VERCEL_DEPLOY_HOOK` is correctly set
- Check Vercel project settings for the deploy hook URL

## Logs and Monitoring

**GitHub Actions Logs:**
- Go to Actions tab in your repository
- Click on the latest deployment run
- Expand the "Deploy functions" step

**Supabase Function Logs:**
- Go to Supabase Dashboard > Functions
- Click on a function to view its logs
- Use the real-time logs for debugging

**Local Deployment Logs:**
- The `scripts/deploy.js` script provides timestamped logs
- Check console output for deployment status and function URLs

## File Structure

```
.github/workflows/deploy.yml    # GitHub Actions workflow
scripts/deploy.js              # Simple deployment script
supabase/
  functions/                   # Your edge functions
  config.toml                 # Supabase configuration
docs/DEPLOYMENT_GUIDE.md      # This guide
```

## Next Steps

1. **Test a deployment** - Push a small change to trigger the workflow
2. **Verify function URLs** - Check that your functions are accessible
3. **Set up monitoring** - Consider adding health checks for critical functions
4. **Configure environments** - Set up staging/production environments if needed

For more advanced configuration, see the [Supabase Functions documentation](https://supabase.com/docs/guides/functions).