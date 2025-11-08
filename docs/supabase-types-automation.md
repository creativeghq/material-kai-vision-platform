# Supabase Types Automation

## Overview

Automated TypeScript type generation from Supabase database schema to ensure type safety across the platform.

## 🎯 Features

- **Automated Type Generation**: Generate TypeScript types from Supabase database schema
- **GitHub Actions Integration**: Automatic updates on database migrations
- **Scheduled Updates**: Weekly type regeneration to catch manual schema changes
- **Type Validation**: Script to verify types are up-to-date
- **Manual Triggers**: Generate types on-demand when needed

---

## 📋 Available Commands

### Generate Types from Remote Database

```bash
npm run types:generate
```

Generates TypeScript types from the production Supabase database.

**Requirements:**
- `SUPABASE_ACCESS_TOKEN` environment variable set
- Supabase CLI installed (`npm install`)

### Generate Types from Local Database

```bash
npm run types:generate:local
```

Generates TypeScript types from local Supabase instance.

**Requirements:**
- Local Supabase running (`supabase start`)
- Supabase CLI installed

### Check Types Status

```bash
npm run types:check
```

Verifies that Supabase types file exists and contains expected type definitions.

**Checks:**
- File exists and is readable
- File age (warns if >7 days old)
- Required type definitions present
- Table count statistics

---

## 🤖 Automated Updates

### GitHub Actions Workflow

The `.github/workflows/update-supabase-types.yml` workflow automatically updates types:

#### Triggers

1. **Manual Trigger**: Run workflow manually from GitHub Actions tab
2. **Database Migrations**: Automatically runs when migrations are pushed
3. **Weekly Schedule**: Runs every Monday at 9 AM UTC

#### Workflow Steps

1. Checkout repository
2. Install dependencies
3. Setup Supabase CLI
4. Generate types from remote database
5. Check for changes
6. Commit and push if changed
7. Create PR (for scheduled runs)

#### Required Secrets

Configure these in GitHub repository settings:

- `SUPABASE_PROJECT_ID`: Your Supabase project ID (e.g., `bgbavxtjlbvgplozizxu`)
- `SUPABASE_ACCESS_TOKEN`: Supabase access token with read permissions

---

## 🔧 Setup Instructions

### 1. Install Supabase CLI

The Supabase CLI is included as a dev dependency:

```bash
npm install
```

### 2. Configure Environment Variables

#### Local Development

Create `.env.local` file:

```bash
SUPABASE_ACCESS_TOKEN=your-access-token-here
```

#### GitHub Actions

Add secrets to repository:

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Add `SUPABASE_PROJECT_ID`
3. Add `SUPABASE_ACCESS_TOKEN`

### 3. Generate Access Token

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Settings** → **API**
3. Copy **Project API keys** → **service_role** key
4. Or create a new access token in **Account** → **Access Tokens**

---

## 📝 Usage Examples

### Manual Type Generation

```bash
# Generate from remote database
npm run types:generate

# Generate from local database (if running locally)
npm run types:generate:local

# Check if types are up-to-date
npm run types:check
```

### Verify Types After Generation

```bash
npm run types:check
```

Expected output:

```
================================================================================
🔍 Checking Supabase Types
================================================================================

✅ Types file exists
   Path: /path/to/src/integrations/supabase/types.ts
   Size: 45.23 KB
   Last modified: 2025-11-08T12:00:00.000Z

✅ Types file is recent (0 days old)

📋 Type Definitions Check:
   ✅ Database type found
   ✅ Tables type found
   ✅ TablesInsert type found
   ✅ TablesUpdate type found
   ✅ Json type found

📊 Database Statistics:
   Tables defined: 52

================================================================================
✅ TYPES CHECK PASSED
================================================================================
```

### Trigger GitHub Actions Workflow

1. Go to **Actions** tab in GitHub
2. Select **Update Supabase Types** workflow
3. Click **Run workflow**
4. Select branch (usually `main`)
5. Click **Run workflow** button

---

## 🔄 Workflow Integration

### Pre-commit Hook (Optional)

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Check if types are up-to-date
npm run types:check
```

### CI/CD Integration

Add to `.github/workflows/deploy.yml`:

```yaml
- name: Check Supabase types
  run: npm run types:check
```

---

## 📊 Type File Structure

The generated `src/integrations/supabase/types.ts` file contains:

```typescript
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      // All database tables with Row, Insert, Update types
      documents: {
        Row: { id: string; title: string; ... }
        Insert: { id?: string; title: string; ... }
        Update: { id?: string; title?: string; ... }
      }
      // ... more tables
    }
    Views: {
      // Database views
    }
    Functions: {
      // Database functions
    }
    Enums: {
      // Database enums
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
```

---

## 🛠️ Troubleshooting

### Types Not Generating

**Problem**: `npm run types:generate` fails

**Solutions:**
1. Check `SUPABASE_ACCESS_TOKEN` is set
2. Verify Supabase CLI is installed: `npx supabase --version`
3. Check project ID is correct: `bgbavxtjlbvgplozizxu`
4. Verify network connection to Supabase

### Types Out of Date

**Problem**: Types don't match database schema

**Solutions:**
1. Run `npm run types:generate` manually
2. Check GitHub Actions workflow ran successfully
3. Verify database migrations were applied
4. Check for manual schema changes in Supabase dashboard

### GitHub Actions Failing

**Problem**: Workflow fails to update types

**Solutions:**
1. Check secrets are configured correctly
2. Verify `SUPABASE_ACCESS_TOKEN` has read permissions
3. Check workflow logs for specific errors
4. Ensure repository has write permissions for GitHub Actions

---

## 📚 Best Practices

1. **Always regenerate types after schema changes**
   ```bash
   npm run types:generate
   ```

2. **Check types before committing**
   ```bash
   npm run types:check
   ```

3. **Review automated PRs carefully**
   - Check for breaking changes
   - Verify table/column additions/removals
   - Test locally if needed

4. **Keep types in sync**
   - Run weekly automated updates
   - Regenerate after migrations
   - Monitor GitHub Actions workflow

5. **Use generated types in code**
   ```typescript
   import { Tables, TablesInsert } from '@/integrations/supabase/types'
   
   type Document = Tables<'documents'>
   type DocumentInsert = TablesInsert<'documents'>
   ```

---

## 🔗 Related Documentation

- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli)
- [Supabase TypeScript Support](https://supabase.com/docs/guides/api/rest/generating-types)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## ✅ Checklist

- [x] Supabase CLI installed as dev dependency
- [x] npm scripts configured (`types:generate`, `types:check`)
- [x] GitHub Actions workflow created
- [x] Type check script implemented
- [x] Documentation complete
- [ ] GitHub secrets configured (manual step)
- [ ] Test type generation locally
- [ ] Test GitHub Actions workflow

