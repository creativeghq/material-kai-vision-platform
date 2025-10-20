# MIVAA Service Configuration - REQUIRED

## 🔴 CRITICAL ISSUE IDENTIFIED

The MIVAA service is **responding and accepting PDF processing requests**, but **NOT storing results in Supabase database**.

### Test Results
✅ MIVAA Health Check: PASS
✅ MIVAA OpenAPI Docs: PASS  
✅ MIVAA Bulk Process: PASS (job accepted)
❌ Database Storage: FAIL (no data written to Supabase)

---

## 🔍 Root Cause

The MIVAA service needs the following environment variables to be set in its deployment:

### Required Supabase Credentials
```
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Required API Keys
```
OPENAI_API_KEY=<your-openai-key>
ANTHROPIC_API_KEY=<your-anthropic-key>
```

### Optional but Recommended
```
MIVAA_API_KEY=<your-mivaa-jwt-token>
```

---

## 📋 Configuration Checklist

### MIVAA Deployment Environment Variables

- [ ] **SUPABASE_URL** - Set to: `https://bgbavxtjlbvgplozizxu.supabase.co`
- [ ] **SUPABASE_ANON_KEY** - Set to the anon key from Supabase
- [ ] **SUPABASE_SERVICE_ROLE_KEY** - Set to the service role key (for write access)
- [ ] **OPENAI_API_KEY** - Set to your OpenAI API key (for embeddings)
- [ ] **ANTHROPIC_API_KEY** - Set to your Anthropic API key (for Claude models)

### Verification Steps

1. **SSH into MIVAA deployment**
   ```bash
   ssh user@mivaa-server
   ```

2. **Check current environment variables**
   ```bash
   env | grep SUPABASE
   env | grep OPENAI
   env | grep ANTHROPIC
   ```

3. **Update .env file** (if using Docker/systemd)
   ```bash
   sudo nano /path/to/mivaa/.env
   # Add the required variables above
   ```

4. **Restart MIVAA service**
   ```bash
   sudo systemctl restart mivaa
   # OR
   docker restart mivaa-container
   ```

5. **Verify configuration**
   ```bash
   curl -X GET https://v1api.materialshub.gr/api/health
   # Should return: {"success":true,"message":"..."}
   ```

---

## 🧪 Testing After Configuration

Once environment variables are set, run:

```bash
node scripts/testing/full-pdf-processing-pipeline.js
```

Expected output:
```
✅ STEP 1: PDF verified
✅ STEP 2: MIVAA processing triggered
✅ STEP 3: Chunks detected: 8365
✅ STEP 4: Embeddings generated: 8365
✅ STEP 5: Images extracted: X
✅ STEP 6: Products generated: 8365+
```

---

## 📊 Current Status

| Component | Status | Issue |
|-----------|--------|-------|
| MIVAA Service | ✅ Running | None |
| MIVAA Health Check | ✅ Responding | None |
| PDF Processing | ✅ Accepted | None |
| Database Storage | ❌ Not Working | Missing Supabase credentials in MIVAA |
| Embeddings | ❌ Not Generated | Missing OPENAI_API_KEY in MIVAA |
| Images | ❌ Not Extracted | Depends on database storage |

---

## 🚀 Next Steps

1. **Get the required credentials** from:
   - Supabase: Project Settings → API
   - OpenAI: API Keys page
   - Anthropic: API Keys page

2. **Update MIVAA deployment** with environment variables

3. **Restart MIVAA service**

4. **Run test script** to verify everything works

5. **Access monitoring dashboard** at `/admin/pdf-processing-monitor`

---

## 📞 Support

If you need help:
1. Check MIVAA service logs: `docker logs mivaa-container`
2. Verify Supabase connectivity: `curl https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/documents?limit=1`
3. Test OpenAI API: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`


