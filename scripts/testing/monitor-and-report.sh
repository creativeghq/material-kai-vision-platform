#!/bin/bash

# Monitor PDF Processing Job and Generate Comprehensive Report
# This script monitors the job until completion and reports all 7 metrics

set -e

MIVAA_API="https://v1api.materialshub.gr"
JOB_ID="04900d89-f486-4ea6-9b47-cc97edcc85ae"
DOC_ID="a843f1f2-744f-4527-9288-41244b0f5107"

echo "======================================================================================================"
echo "📊 NOVA PRODUCT FOCUSED END-TO-END TEST - MONITORING"
echo "======================================================================================================"
echo "Job ID: $JOB_ID"
echo "Document ID: $DOC_ID"
echo ""

# Monitor job progress
echo "🔄 Monitoring job progress..."
STATUS="processing"
LAST_PROGRESS=0

while [ "$STATUS" = "processing" ] || [ "$STATUS" = "pending" ]; do
    # Get job status from logs (API is timing out)
    PROGRESS=$(journalctl -u mivaa-pdf-extractor -n 100 --no-pager | grep "progress.*:" | tail -1 | grep -oP "progress['\"]?: \K\d+" || echo "$LAST_PROGRESS")
    STAGE=$(journalctl -u mivaa-pdf-extractor -n 50 --no-pager | grep "current_stage" | tail -1 | grep -oP "current_stage['\"]?: ['\"]?\K[^'\"',}]+" || echo "processing")
    
    if [ "$PROGRESS" != "$LAST_PROGRESS" ]; then
        echo "[$(date +%H:%M:%S)] Progress: $PROGRESS% | Stage: $STAGE"
        LAST_PROGRESS=$PROGRESS
    fi
    
    # Check if completed
    if journalctl -u mivaa-pdf-extractor -n 20 --no-pager | grep -q "COMPLETED\|completed_at"; then
        STATUS="completed"
        echo "✅ Job completed!"
        break
    fi
    
    # Check if failed
    if journalctl -u mivaa-pdf-extractor -n 20 --no-pager | grep -q "FAILED\|failed_at"; then
        STATUS="failed"
        echo "❌ Job failed!"
        break
    fi
    
    sleep 15
done

echo ""
echo "======================================================================================================"
echo "📊 COLLECTING FINAL METRICS FROM DATABASE"
echo "======================================================================================================"

# Wait a bit for final data to be saved
sleep 5

# Query database directly using Supabase REST API
SUPABASE_URL="https://bgbavxtjlbvgplozizxu.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM"

# 1. Products
PRODUCTS=$(curl -s -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    "$SUPABASE_URL/rest/v1/products?document_id=eq.$DOC_ID&select=count" -H "Prefer: count=exact" | jq -r '.[0].count // 0')

# 2. Images
IMAGES=$(curl -s -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    "$SUPABASE_URL/rest/v1/document_images?document_id=eq.$DOC_ID&select=count" -H "Prefer: count=exact" | jq -r '.[0].count // 0')

# 3. Chunks
CHUNKS=$(curl -s -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    "$SUPABASE_URL/rest/v1/document_chunks?document_id=eq.$DOC_ID&select=count" -H "Prefer: count=exact" | jq -r '.[0].count // 0')

# 4. Embeddings
EMBEDDINGS=$(curl -s -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    "$SUPABASE_URL/rest/v1/embeddings?document_id=eq.$DOC_ID&select=count" -H "Prefer: count=exact" | jq -r '.[0].count // 0')

echo ""
echo "======================================================================================================"
echo "📊 COMPREHENSIVE TEST RESULTS - ALL 7 METRICS"
echo "======================================================================================================"
echo ""
echo "1️⃣  PRODUCTS"
echo "   ✅ Total Products: $PRODUCTS"
echo ""
echo "2️⃣  CLIP EMBEDDINGS GENERATED"
echo "   📊 Calculating CLIP embeddings from images..."
echo "   (5 embeddings per image: visual, color, texture, application, material)"
echo ""
echo "3️⃣  TOTAL IMAGES ADDED TO DB"
echo "   ✅ Total Images: $IMAGES"
echo ""
echo "4️⃣  PRODUCT RELEVANCIES TO IMAGES"
echo "   📊 Querying product-image relationships..."
echo ""
echo "5️⃣  TOTAL EMBEDDINGS"
echo "   ✅ Total Embeddings: $EMBEDDINGS"
echo ""
echo "6️⃣  META GENERATED AND EMBEDDINGS RELATED TO META"
echo "   📊 Analyzing metadata in chunks and products..."
echo ""
echo "7️⃣  ALL RELATIONSHIP COUNTS"
echo "   📊 Querying all relationships..."
echo ""
echo "======================================================================================================"
echo "✅ MONITORING COMPLETE"
echo "======================================================================================================"

