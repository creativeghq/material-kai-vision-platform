#!/bin/bash

# Deploy MIVAA Python API to Server
# This script deploys the MIVAA PDF extractor service to the production server

set -e  # Exit on error

echo "🚀 MIVAA Deployment Script"
echo "=========================="
echo ""

# Configuration
SERVER_USER="root"
SERVER_HOST="your-server-ip"  # Update this
MIVAA_DIR="/root/mivaa-pdf-extractor"
REPO_DIR="/root"

echo "📋 Deployment Configuration:"
echo "  Server: $SERVER_USER@$SERVER_HOST"
echo "  MIVAA Directory: $MIVAA_DIR"
echo ""

# Step 1: Pull latest code on server
echo "📥 Step 1: Pulling latest code from GitHub..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
cd /root
git pull origin main
echo "✅ Code updated"
EOF

# Step 2: Install Python dependencies
echo "📦 Step 2: Installing Python dependencies..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
cd /root/mivaa-pdf-extractor

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found!"
    exit 1
fi

# Install dependencies
pip install -r requirements.txt
echo "✅ Dependencies installed"
EOF

# Step 3: Set environment variables
echo "🔐 Step 3: Setting environment variables..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
# Create .env file if it doesn't exist
cat > /root/mivaa-pdf-extractor/.env << 'ENVEOF'
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
MIVAA_API_KEY=${MIVAA_API_KEY}
PORT=8000
HOST=0.0.0.0
ENVEOF
echo "✅ Environment variables set"
EOF

# Step 4: Stop existing MIVAA process (if running)
echo "🛑 Step 4: Stopping existing MIVAA process..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
# Kill any existing uvicorn processes
pkill -f "uvicorn.*mivaa" || true
sleep 2
echo "✅ Existing processes stopped"
EOF

# Step 5: Start MIVAA service
echo "🚀 Step 5: Starting MIVAA service..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
cd /root/mivaa-pdf-extractor

# Start uvicorn in background
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /var/log/mivaa.log 2>&1 &

# Wait for service to start
sleep 5

# Check if service is running
if curl -s http://localhost:8000/api/health > /dev/null; then
    echo "✅ MIVAA service started successfully"
else
    echo "❌ MIVAA service failed to start"
    echo "Check logs: tail -f /var/log/mivaa.log"
    exit 1
fi
EOF

# Step 6: Verify deployment
echo "✅ Step 6: Verifying deployment..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
echo "Testing MIVAA health endpoint..."
curl -s http://localhost:8000/api/health | jq .

echo ""
echo "Testing MIVAA docs endpoint..."
curl -s http://localhost:8000/docs > /dev/null && echo "✅ Docs accessible"

echo ""
echo "MIVAA process:"
ps aux | grep uvicorn | grep -v grep
EOF

echo ""
echo "🎉 MIVAA Deployment Complete!"
echo ""
echo "Next steps:"
echo "1. Test MIVAA: curl http://localhost:8000/api/health"
echo "2. View logs: ssh $SERVER_USER@$SERVER_HOST 'tail -f /var/log/mivaa.log'"
echo "3. Run E2E test: node scripts/testing/harmony-pdf-complete-e2e-test.js"
echo ""

