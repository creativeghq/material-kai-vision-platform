# Deploy MIVAA Python API - IMMEDIATE ACTION REQUIRED

## Current Situation
- ❌ MIVAA Python API is NOT running on the server
- ✅ MIVAA code exists in local repository (`mivaa-pdf-extractor/`)
- ✅ Supabase Edge Functions are deployed
- ✅ Frontend is deployed
- ❌ **PDF processing will FAIL without MIVAA**

## Quick Deployment Steps

### Step 1: Pull Latest Code on Server
```bash
cd /root
git pull origin main
```

### Step 2: Navigate to MIVAA Directory
```bash
cd /root/mivaa-pdf-extractor
ls -la  # Verify files exist
```

### Step 3: Install Dependencies
```bash
# Check if uv is installed (faster)
which uv

# If uv exists, use it:
uv pip install -r requirements.txt

# Otherwise use pip:
pip install -r requirements.txt
```

### Step 4: Set Environment Variables
```bash
# Create .env file
cat > .env << 'EOF'
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_SERVICE_KEY=<get-from-supabase-dashboard>
OPENAI_API_KEY=<get-from-openai>
ANTHROPIC_API_KEY=<get-from-anthropic>
MIVAA_API_KEY=<generate-random-key>
PORT=8000
HOST=0.0.0.0
EOF
```

### Step 5: Start MIVAA Service
```bash
# Start in background
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /var/log/mivaa.log 2>&1 &

# Check if running
ps aux | grep uvicorn

# Test health endpoint
curl http://localhost:8000/api/health
```

### Step 6: Verify Deployment
```bash
# Check logs
tail -f /var/log/mivaa.log

# Test endpoints
curl http://localhost:8000/docs  # Should return HTML
curl http://localhost:8000/api/health  # Should return JSON
```

## Alternative: Use Screen/Tmux
```bash
# Start in screen session
screen -S mivaa
cd /root/mivaa-pdf-extractor
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Detach: Ctrl+A, then D
# Reattach: screen -r mivaa
```

## Verify MIVAA is Working

### Test 1: Health Check
```bash
curl http://localhost:8000/api/health
# Expected: {"status": "healthy", ...}
```

### Test 2: OpenAPI Docs
```bash
curl http://localhost:8000/openapi.json | jq .
# Expected: JSON with API spec
```

### Test 3: From mivaa-gateway
```bash
# Test that Supabase Edge Function can reach MIVAA
curl -X POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"action": "health_check", "payload": {}}'
```

## Make MIVAA Persistent (Production)

### Option 1: Systemd Service
```bash
# Create service file
cat > /etc/systemd/system/mivaa.service << 'EOF'
[Unit]
Description=MIVAA PDF Extractor Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/mivaa-pdf-extractor
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/local/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
systemctl daemon-reload
systemctl enable mivaa
systemctl start mivaa
systemctl status mivaa
```

### Option 2: PM2 (if Node.js PM2 is installed)
```bash
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000" --name mivaa
pm2 save
pm2 startup
```

## Troubleshooting

### MIVAA Won't Start
```bash
# Check Python version
python --version  # Should be 3.10+

# Check if port 8000 is in use
lsof -i :8000
netstat -tulpn | grep 8000

# Check dependencies
pip list | grep -E "(fastapi|uvicorn|pydantic)"

# Check logs
tail -100 /var/log/mivaa.log
```

### Missing Dependencies
```bash
# Install specific packages
pip install fastapi uvicorn pydantic python-multipart

# Or reinstall all
pip install -r requirements.txt --force-reinstall
```

### Permission Issues
```bash
# Ensure correct permissions
chmod +x /root/mivaa-pdf-extractor/app/main.py
chown -R root:root /root/mivaa-pdf-extractor
```

## After MIVAA is Running

### Update Test Script
The test script needs to be updated to use the correct flow:
1. Check MIVAA health first
2. Use `/functions/v1/pdf-processor` endpoint
3. Handle async job-based processing

### Run E2E Test
```bash
# On local machine
cd scripts/testing
node harmony-pdf-complete-e2e-test.js
```

## Environment Variables Reference

Required environment variables for MIVAA:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (for database access)
- `OPENAI_API_KEY` - OpenAI API key (for embeddings)
- `ANTHROPIC_API_KEY` - Anthropic API key (for Claude)
- `MIVAA_API_KEY` - API key for MIVAA gateway authentication
- `PORT` - Port to run on (default: 8000)
- `HOST` - Host to bind to (default: 0.0.0.0)

## Success Criteria

- [ ] MIVAA service running on port 8000
- [ ] Health endpoint responds: `curl http://localhost:8000/api/health`
- [ ] Docs accessible: `curl http://localhost:8000/docs`
- [ ] mivaa-gateway can reach MIVAA
- [ ] PDF processing test succeeds
- [ ] Service persists after server reboot

## Next Steps After Deployment

1. Run comprehensive E2E test
2. Monitor MIVAA logs for errors
3. Test with Harmony PDF
4. Validate all 14+ products are extracted
5. Ensure no fake/mock data in results

