#!/bin/bash

# Monitor job until it reaches image extraction stage
JOB_ID="ef824752-375a-4b3d-8c39-e7ef9b853f1e"
API="http://localhost:8000"

echo "🔍 Monitoring job $JOB_ID until image extraction..."
echo ""

while true; do
  # Get job status
  RESPONSE=$(curl -s "$API/api/rag/documents/job/$JOB_ID")
  
  STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; j = json.load(sys.stdin); print(j.get('status', 'unknown'))")
  STAGE=$(echo "$RESPONSE" | python3 -c "import sys, json; j = json.load(sys.stdin); print(j.get('metadata', {}).get('current_stage', 'unknown'))")
  PROGRESS=$(echo "$RESPONSE" | python3 -c "import sys, json; j = json.load(sys.stdin); print(j.get('progress', 0))")
  IMAGES=$(echo "$RESPONSE" | python3 -c "import sys, json; j = json.load(sys.stdin); print(j.get('metadata', {}).get('images_extracted', 0))")
  
  echo "[$(date +%H:%M:%S)] Status: $STATUS | Stage: $STAGE | Progress: $PROGRESS% | Images: $IMAGES"
  
  # Check if we've reached image extraction or beyond
  if [[ "$STAGE" == *"extracting_images"* ]] || [[ "$STAGE" == *"image"* ]] || [[ "$IMAGES" -gt 0 ]]; then
    echo ""
    echo "✅ Reached image extraction stage! Checking logs..."
    echo ""
    journalctl -u mivaa-pdf-extractor --since "10 minutes ago" | grep -E "Upload result|📤|storage_url:|public_url:|CRITICAL" | tail -50
    break
  fi
  
  # Check if job completed or failed
  if [[ "$STATUS" == "completed" ]] || [[ "$STATUS" == "failed" ]]; then
    echo ""
    echo "⚠️  Job $STATUS before reaching image extraction"
    break
  fi
  
  sleep 15
done

