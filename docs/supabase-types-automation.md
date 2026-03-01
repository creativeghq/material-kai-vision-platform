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

Run `npm run types:generate` to generate TypeScript types from the production Supabase database.

**Requirements:**
- `SUPABASE_ACCESS_TOKEN` environment variable set
- Supabase CLI installed (`npm install`)

### Generate Types from Local Database

Run `npm run types:generate:local` to generate TypeScript types from local Supabase instance.

**Requirements:**
- Local Supabase running (`supabase start`)
- Supabase CLI installed

### Check Types Status

Run `npm run types:check` to verify that Supabase types file exists and contains expected type definitions.

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

The Supabase CLI is included as a dev dependency. Run `npm install`.

### 2. Configure Environment Variables

#### Local Development

Create `.env.local` file with `SUPABASE_ACCESS_TOKEN=your-access-token-here`.

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

Run `npm run types:generate` to generate from remote database, `npm run types:generate:local` for local, and `npm run types:check` to verify they are up-to-date.

### Verify Types After Generation

Run `npm run types:check`. Expected output shows: file path and size, file age (recent), presence of Database/Tables/TablesInsert/TablesUpdate/Json types, and total tables count.

### Trigger GitHub Actions Workflow

1. Go to **Actions** tab in GitHub
2. Select **Update Supabase Types** workflow
3. Click **Run workflow**
4. Select branch (usually `main`)
5. Click **Run workflow** button

---

## 🔄 Workflow Integration

### Pre-commit Hook (Optional)

Add to `.husky/pre-commit` to run `npm run types:check` before each commit.

### CI/CD Integration

Add a step to `.github/workflows/deploy.yml` that runs `npm run types:check`.

---

## 📊 Type File Structure

The generated `src/integrations/supabase/types.ts` file contains a `Database` type with a `public` schema holding `Tables` (each with `Row`, `Insert`, `Update` subtypes), `Views`, `Functions`, and `Enums`. Helper types `Tables<T>`, `TablesInsert<T>`, and `TablesUpdate<T>` are also exported for convenient usage.

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

1. **Always regenerate types after schema changes** — run `npm run types:generate`

2. **Check types before committing** — run `npm run types:check`

3. **Review automated PRs carefully**
   - Check for breaking changes
   - Verify table/column additions/removals
   - Test locally if needed

4. **Keep types in sync**
   - Run weekly automated updates
   - Regenerate after migrations
   - Monitor GitHub Actions workflow

5. **Use generated types in code** — import `Tables` and `TablesInsert` from `@/integrations/supabase/types` for type-safe queries

---

## 🔗 Related Documentation

- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli)
- [Supabase TypeScript Support](https://supabase.com/docs/guides/api/rest/generating-types)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

