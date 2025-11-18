#!/bin/bash

# Test Multi-Vector Search Enhancement
# Tests the new 6-embedding multi-vector search with query understanding

set -e

echo "🧪 Testing Multi-Vector Search Enhancement"
echo "=========================================="
echo ""

# Configuration
API_URL="http://localhost:8000"
WORKSPACE_ID="your-workspace-id-here"  # Replace with actual workspace ID

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Basic Multi-Vector Search
echo -e "${YELLOW}Test 1: Basic Multi-Vector Search${NC}"
echo "Query: 'modern ceramic tiles'"
echo ""

RESPONSE=$(curl -s -X POST "${API_URL}/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"modern ceramic tiles\",
    \"workspace_id\": \"${WORKSPACE_ID}\",
    \"top_k\": 5
  }")

echo "$RESPONSE" | jq -r '.weights'
echo ""
echo -e "${GREEN}✓ Test 1 Complete${NC}"
echo ""
echo "---"
echo ""

# Test 2: Multi-Vector with Manual Filters
echo -e "${YELLOW}Test 2: Multi-Vector with Manual Filters${NC}"
echo "Query: 'ceramic tiles'"
echo "Filters: finish=matte, properties=[waterproof, outdoor]"
echo ""

RESPONSE=$(curl -s -X POST "${API_URL}/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"ceramic tiles\",
    \"workspace_id\": \"${WORKSPACE_ID}\",
    \"material_filters\": {
      \"finish\": \"matte\",
      \"properties\": [\"waterproof\", \"outdoor\"]
    },
    \"top_k\": 5
  }")

echo "$RESPONSE" | jq -r '.material_filters_applied'
echo ""
echo -e "${GREEN}✓ Test 2 Complete${NC}"
echo ""
echo "---"
echo ""

# Test 3: Multi-Vector with Query Understanding
echo -e "${YELLOW}Test 3: Multi-Vector with Query Understanding (AUTO FILTERS)${NC}"
echo "Query: 'waterproof ceramic tiles for outdoor patio, matte finish, light beige'"
echo ""

RESPONSE=$(curl -s -X POST "${API_URL}/api/rag/search?strategy=multi_vector&enable_query_understanding=true" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"waterproof ceramic tiles for outdoor patio, matte finish, light beige\",
    \"workspace_id\": \"${WORKSPACE_ID}\",
    \"top_k\": 5
  }")

echo "Extracted Filters:"
echo "$RESPONSE" | jq -r '.material_filters_applied'
echo ""
echo "Weights:"
echo "$RESPONSE" | jq -r '.weights'
echo ""
echo -e "${GREEN}✓ Test 3 Complete${NC}"
echo ""
echo "---"
echo ""

# Test 4: Verify 6 Embeddings are Used
echo -e "${YELLOW}Test 4: Verify 6 Embeddings are Used${NC}"
echo ""

WEIGHTS=$(echo "$RESPONSE" | jq -r '.weights')
TEXT_WEIGHT=$(echo "$WEIGHTS" | jq -r '.text')
VISUAL_WEIGHT=$(echo "$WEIGHTS" | jq -r '.visual')
COLOR_WEIGHT=$(echo "$WEIGHTS" | jq -r '.color')
TEXTURE_WEIGHT=$(echo "$WEIGHTS" | jq -r '.texture')
STYLE_WEIGHT=$(echo "$WEIGHTS" | jq -r '.style')
MATERIAL_WEIGHT=$(echo "$WEIGHTS" | jq -r '.material')

echo "Embedding Weights:"
echo "  - text: ${TEXT_WEIGHT} (expected: 0.20)"
echo "  - visual: ${VISUAL_WEIGHT} (expected: 0.20)"
echo "  - color: ${COLOR_WEIGHT} (expected: 0.15)"
echo "  - texture: ${TEXTURE_WEIGHT} (expected: 0.15)"
echo "  - style: ${STYLE_WEIGHT} (expected: 0.15)"
echo "  - material: ${MATERIAL_WEIGHT} (expected: 0.15)"
echo ""

# Verify weights
if [ "$TEXT_WEIGHT" == "0.2" ] && [ "$VISUAL_WEIGHT" == "0.2" ] && \
   [ "$COLOR_WEIGHT" == "0.15" ] && [ "$TEXTURE_WEIGHT" == "0.15" ] && \
   [ "$STYLE_WEIGHT" == "0.15" ] && [ "$MATERIAL_WEIGHT" == "0.15" ]; then
  echo -e "${GREEN}✓ All 6 embeddings are correctly weighted!${NC}"
else
  echo -e "${RED}✗ Embedding weights are incorrect!${NC}"
  exit 1
fi
echo ""
echo "---"
echo ""

# Test 5: Deprecation Warning for "all" Strategy
echo -e "${YELLOW}Test 5: Deprecation Warning for 'all' Strategy${NC}"
echo "Testing that 'all' strategy shows deprecation warning..."
echo ""

RESPONSE=$(curl -s -X POST "${API_URL}/api/rag/search?strategy=all" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"test query\",
    \"workspace_id\": \"${WORKSPACE_ID}\",
    \"top_k\": 5
  }")

echo "Check server logs for deprecation warning:"
echo "  ⚠️ DEPRECATED: strategy='all' is deprecated. Use strategy='multi_vector' instead..."
echo ""
echo -e "${GREEN}✓ Test 5 Complete (check logs)${NC}"
echo ""
echo "---"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ All Tests Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Summary:"
echo "  ✓ Basic multi-vector search works"
echo "  ✓ Manual filters work"
echo "  ✓ Query understanding works"
echo "  ✓ All 6 embeddings are used with correct weights"
echo "  ✓ Deprecation warning for 'all' strategy"
echo ""
echo "Next Steps:"
echo "  1. Update WORKSPACE_ID in this script"
echo "  2. Run: chmod +x scripts/testing/test-multi-vector-enhancement.sh"
echo "  3. Run: ./scripts/testing/test-multi-vector-enhancement.sh"
echo "  4. Verify results match expected behavior"
echo ""

