# Vercel Deployment Guide
## Material Kai Vision Platform

This guide provides step-by-step instructions for deploying the Material Kai Vision Platform to Vercel, following the architectural decisions documented in [ADR-001](../.ruru/decisions/ADR-001_deployment_platform_selection.md).

## Prerequisites

- Node.js 18+ installed
- Vercel account created
- Supabase project configured
- Project built and tested locally

## Quick Start

### Option 1: Automated CI/CD (Recommended)
1. **Push to GitHub** - Deployments happen automatically via GitHub Actions
2. **Set up secrets** in GitHub repository settings:
   - `VERCEL_TOKEN`: Your Vercel API token
   - `VERCEL_ORG_ID`: Your Vercel organization ID
   - `VERCEL_PROJECT_ID`: Your Vercel project ID
3. **Configure environment variables** in Vercel dashboard

### Option 2: Manual CLI Deployment
1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Run Setup Script**
   ```bash
   node scripts/deploy-setup.js
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

## Detailed Setup

### 1. Environment Configuration

#### Vercel Environment Variables (Recommended)
**Best Practice**: Configure environment variables directly in Vercel's dashboard instead of using local `.env` files for production deployments.

**How to Set Variables:**
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with appropriate values
4. Select target environments (Production, Preview, Development)

**Required Variables:**
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

**Optional Variables:**
- `VITE_APP_TITLE`: Custom app title
- `VITE_DEBUG_MODE`: Enable debug mode (false for production)

#### Local Development (Optional)
For local development only, you can use the environment template:
```bash
cp .env.example .env.local
# Fill in your Supabase credentials in .env.local
```

**Note**: The `.env.example` file serves as a reference template. Production deployments should use Vercel's dashboard for environment variable management.

### 2. Build Configuration

The project uses the following build settings (configured in `vercel.json`):

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18.x

### 3. Bundle Optimization

#### AI/ML Libraries
Large AI/ML dependencies require optimization:

```typescript
// Use dynamic imports for heavy libraries
const loadTransformers = async () => {
  const { pipeline } = await import('@xenova/transformers');
  return pipeline;
};

// Implement code splitting for Three.js
const ThreeScene = lazy(() => import('./components/ThreeScene'));
```

#### Recommended Optimizations
1. **Code Splitting**: Split large components and libraries
2. **Dynamic Imports**: Load AI models on-demand
3. **Asset Optimization**: Compress textures and models
4. **CDN Usage**: Leverage Vercel's edge network

### 4. CI/CD Automation Setup

#### GitHub Actions Workflow
The project includes a complete CI/CD pipeline via GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):

**Features:**
- **Automated Testing**: Runs tests before deployment
- **Environment-Specific Deployments**: Production for `main`, preview for other branches
- **PR Comments**: Automatic preview URL comments on pull requests
- **Performance Monitoring**: Lighthouse CI integration for production deployments

**Required GitHub Secrets:**
```bash
VERCEL_TOKEN=your-vercel-api-token
VERCEL_ORG_ID=your-vercel-org-id
VERCEL_PROJECT_ID=your-vercel-project-id
```

**Setup Steps:**
1. **Get Vercel Token**: Visit [Vercel Account Settings](https://vercel.com/account/tokens)
2. **Get Project IDs**: Run `vercel link` locally to get org and project IDs
3. **Add Secrets**: Go to GitHub repo → Settings → Secrets and variables → Actions
4. **Push to GitHub**: Deployments will trigger automatically

#### Deployment Triggers
- **Production**: Push to `main` branch
- **Preview**: Push to `develop` branch or any pull request
- **Manual**: Use GitHub Actions "Run workflow" button

### 5. Manual CLI Deployment

#### First-Time Setup

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Initialize Project**
   ```bash
   vercel
   ```
   - Choose your team/account
   - Confirm project settings
   - Link to existing project or create new

3. **Deploy to Production**
   ```bash
   vercel --prod
   ```

#### Subsequent Deployments

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### 5. Performance Monitoring

#### Bundle Analysis
Monitor bundle size after each deployment:

```bash
npm run build
npx vite-bundle-analyzer dist
```

#### Key Metrics to Track
- **Bundle Size**: Keep under 25MB for optimal performance
- **Load Time**: Monitor First Contentful Paint (FCP)
- **Core Web Vitals**: Track LCP, FID, and CLS
- **Edge Function Performance**: Monitor Supabase edge function latency

### 6. Dependency Management

#### Deprecation Warnings
The project may show deprecation warnings during installation:

```bash
npm warn deprecated boolean@3.2.0: Package no longer supported
npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility
```

**Resolution Strategy:**
- **Non-Critical Warnings**: These warnings don't affect functionality but should be addressed in future updates
- **Three.js Compatibility**: Update `three-mesh-bvh` to v0.8.0+ when upgrading Three.js dependencies
- **Boolean Package**: This is likely a transitive dependency that will be resolved when other packages update

#### Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update non-breaking changes
npm update


# Run automated dependency fix script
node scripts/fix-dependencies.js
# For major version updates, review breaking changes first
npm install three-mesh-bvh@latest
```

### 6. Troubleshooting

#### Common Issues

**Build Failures**
- Check Node.js version compatibility
- Verify all dependencies are installed
- Review build logs for specific errors

**Environment Variable Issues**
- Ensure all required variables are set in Vercel dashboard
- Verify variable names match exactly (case-sensitive)
- Check for typos in Supabase URLs/keys

**Bundle Size Warnings**
- Implement code splitting for large dependencies
- Use dynamic imports for AI/ML libraries
- Consider lazy loading for non-critical components

**Performance Issues**
- Enable Vercel Analytics for detailed metrics
- Optimize images and assets
- Review and optimize database queries

#### Debug Commands

```bash
# Local build test
npm run build
npm run preview

# Check bundle size
npm run build -- --analyze

# Verify environment variables
vercel env ls
```

### 7. Hybrid Architecture Benefits

This deployment leverages a hybrid architecture:

- **Frontend**: Vercel (optimized for React/TypeScript)
- **Backend**: Supabase (edge functions, database, auth)
- **CDN**: Vercel Edge Network
- **AI/ML**: Client-side processing with Transformers.js

#### Key Advantages
- **Performance**: Global edge distribution
- **Scalability**: Automatic scaling on both platforms
- **Cost Efficiency**: Pay-per-use model
- **Developer Experience**: Seamless integration and deployment

### 8. Security Considerations

- Environment variables are encrypted at rest
- HTTPS enforced by default
- Supabase handles authentication and authorization
- Row Level Security (RLS) policies recommended

### 9. Monitoring and Maintenance

#### Recommended Tools
- **Vercel Analytics**: Built-in performance monitoring
- **Supabase Dashboard**: Database and API monitoring
- **Sentry**: Error tracking and performance monitoring
- **Lighthouse CI**: Automated performance audits

#### Regular Maintenance
- Monitor bundle size growth
- Update dependencies regularly
- Review and optimize database queries
- Monitor edge function performance

## Support

For deployment issues:
1. Check Vercel deployment logs
2. Review Supabase function logs
3. Consult the [ADR-001](../.ruru/decisions/ADR-001_deployment_platform_selection.md) for architectural context
4. Contact team leads for escalation

---

**Last Updated**: July 2025  
**Architecture Decision**: [ADR-001](../.ruru/decisions/ADR-001_deployment_platform_selection.md)