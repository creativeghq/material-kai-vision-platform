# Immediate Action Plan

## 🎯 What Was Fixed

Two critical bugs were found and fixed:

1. **Database Query Error** - Table name typo `documentsinner` → `documents`
   - Affected: MaterialKnowledgeBase.tsx and pdfImageService.ts
   - Impact: 400 errors when loading document chunks
   - Status: ✅ FIXED

2. **Environment Variables** - Inconsistent naming and missing keys
   - Affected: vite.config.ts and Vercel configuration
   - Impact: MIVAA gateway 500 errors, OpenAI warnings
   - Status: ✅ PARTIALLY FIXED (code fixed, Vercel config needs update)

---

## 🚀 What You Need to Do NOW

### Step 1: Deploy the Fixed Code (5 minutes)
```bash
git add .
git commit -m "fix: correct database table names and environment variables"
git push origin main
```

**Or** manually trigger Vercel redeploy:
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Deployments"
4. Find latest deployment
5. Click "..." → "Redeploy"

### Step 2: Update Vercel Environment Variables (5 minutes)
Go to **Vercel Dashboard → Project Settings → Environment Variables**

Add/Update these variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
STRIPE_PUBLISHABLE_KEY=pk_live_<your-key>
NEXT_PUBLIC_MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
MIVAA_API_KEY=<your-mivaa-jwt-token>
VITE_OPENAI_API_KEY=<your-openai-key>  (optional)
NEXT_PUBLIC_WS_URL=<your-websocket-url>  (optional)
```

### Step 3: Verify Deployment (5 minutes)
1. Wait for Vercel deployment to complete
2. Open your app in browser
3. Press F12 to open Developer Console
4. Refresh the page
5. Check for these messages:
   - ✅ Should see: "🔧 CORS Debug utility loaded"
   - ✅ Should NOT see: "mivaa-gateway 500 error"
   - ✅ Should NOT see: "documentsinner" error

### Step 4: Test Knowledge Base (5 minutes)
1. Go to Admin Panel → Knowledge Base
2. Try loading documents
3. Should see chunks loading without 400 errors
4. Should see document information displayed

---

## 🔍 Troubleshooting

### If you still see "mivaa-gateway 500 error"
1. Check MIVAA service is online: https://v1api.materialshub.gr/health
2. Verify MIVAA_API_KEY is correct in Supabase secrets
3. Check Supabase Edge Functions logs for detailed error

### If you still see "documentsinner" error
1. Make sure you deployed the latest code
2. Clear browser cache (Ctrl+Shift+Delete)
3. Refresh the page

### If you see OpenAI warning
1. Add `VITE_OPENAI_API_KEY` to Vercel (optional)
2. Redeploy
3. Clear cache and refresh

---

## ✅ Expected Results After Fix

### Console Messages (Good Signs)
```
🔧 CORS Debug utility loaded. Call debugCORS() to test.
📡 WebSocket disabled - NEXT_PUBLIC_WS_URL not configured
⚠️ OpenAI API key not found - fallback embedding generation will not work
```

### Console Messages (Bad Signs - Still Need Fixing)
```
❌ mivaa-gateway 500 error
❌ documentsinner relationship not found
❌ 400 Bad Request from document_chunks
```

---

## 📊 Summary of Changes

| Issue | Before | After | Status |
|-------|--------|-------|--------|
| Table name typo | `documentsinner` | `documents` | ✅ Fixed |
| MIVAA variable naming | Inconsistent | `NEXT_PUBLIC_MIVAA_GATEWAY_URL` | ✅ Fixed |
| Build errors | Multiple | Zero | ✅ Fixed |
| Database 400 errors | Yes | Should be fixed | ⏳ Pending deploy |
| MIVAA 500 errors | Yes | Needs investigation | ⏳ Pending |

---

## ⏱️ Estimated Time

- Deploy code: 5 minutes
- Update Vercel env vars: 5 minutes
- Wait for deployment: 5-10 minutes
- Test and verify: 5 minutes
- **Total: ~20-25 minutes**

---

## 📞 If Issues Persist

After deploying and testing, if you still see errors:

1. **Check Supabase Edge Functions logs**:
   - Go to Supabase Dashboard → Edge Functions
   - Click "mivaa-gateway"
   - Check recent logs for error details

2. **Check MIVAA service**:
   - Visit https://v1api.materialshub.gr/health
   - Should return 200 OK

3. **Verify database relationships**:
   - Go to Supabase Dashboard → SQL Editor
   - Run: `SELECT * FROM information_schema.table_constraints WHERE table_name = 'document_chunks';`
   - Should show foreign key to `documents` table

---

## 🎉 Success Criteria

You'll know everything is working when:
- ✅ No 400 errors from document_chunks query
- ✅ No 500 errors from mivaa-gateway
- ✅ Knowledge Base loads documents successfully
- ✅ Document chunks display with metadata
- ✅ No "documentsinner" errors in console

