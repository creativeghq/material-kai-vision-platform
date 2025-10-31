# Edge Functions to Delete - Phase 1 Migration

**Date**: 2025-10-31  
**Total to Delete**: 55 functions

---

## Category 1: Proxy Functions (40 functions)

1. `analyze-knowledge-content` - Proxies to MIVAA
2. `document-vector-search` - Proxies to MIVAA
3. `extract-material-knowledge` - Proxies to MIVAA
4. `hybrid-material-analysis` - Proxies to MIVAA
5. `material-agent-orchestrator` - Proxies to MIVAA
6. `material-images-api` - Proxies to MIVAA
7. `ocr-processing` - Proxies to MIVAA
8. `rag-knowledge-search` - Proxies to MIVAA
9. `spaceformer-analysis` - Proxies to MIVAA
10. `svbrdf-extractor` - Proxies to MIVAA
11. `unified-material-search` - Proxies to MIVAA
12. `visual-search-analyze` - Proxies to MIVAA
13. `voice-to-material` - Proxies to MIVAA
14. `auto-analyze-image` - Proxies to MIVAA
15. `enhanced-clip-integration` - Proxies to MIVAA
16. `validate-images` - Proxies to MIVAA
17. `enrich-products` - Proxies to MIVAA
18. `material-recognition` - Proxies to MIVAA
19. `analyze-embedding-stability` - Proxies to MIVAA
20. `apply-quality-scoring` - Proxies to MIVAA
21. `canonical-metadata-extraction` - Proxies to MIVAA
22. `chunk-aware-search` - Proxies to MIVAA
23. `chunk-type-classification` - Proxies to MIVAA
24. `classify-content` - Proxies to MIVAA
25. `detect-boundaries` - Proxies to MIVAA
26. `enhanced-product-processing` - Proxies to MIVAA
27. `quality-control-operations` - Proxies to MIVAA
28. `multi-vector-operations` - Proxies to MIVAA
29. `extract-categories` - Proxies to MIVAA
30. `get-material-categories` - Proxies to MIVAA
31. `process-ai-analysis-queue` - Proxies to MIVAA
32. `process-image-queue` - Proxies to MIVAA
33. `process-image-semantic-linking` - Proxies to MIVAA
34. `visual-search-batch` - Proxies to MIVAA
35. `visual-search-query` - Proxies to MIVAA
36. `visual-search-status` - Proxies to MIVAA
37. `retrieval-api` - Proxies to MIVAA
38. `material-scraper` - Proxies to MIVAA
39. `pdf-extract` - Proxies to MIVAA (replaced by mivaa-gateway)
40. `mivaa-jwt-generator` - Not needed (JWT handled by middleware)

## Category 2: Mock/Simulated Data (2 functions)

41. `style-analysis` - Returns MOCK data
42. `huggingface-model-trainer` - Mock training

## Category 3: Replaced/Duplicate (3 functions)

43. `pdf-processor` - Replaced by mivaa-gateway
44. `advanced-search-recommendation` - Not used
45. `pdf-integration-health` - Not used

## Category 4: Test/Legacy (10 functions)

46. `mivaa-gateway-test` - Test function
47. `admin-kb-quality-dashboard` - Admin KB function (verify if needed)
48. `admin-kb-quality-scores` - Admin KB function (verify if needed)
49. `admin-kb-detections` - Admin KB function (verify if needed)
50. `admin-kb-embeddings-stats` - Admin KB function (verify if needed)
51. `admin-kb-metadata` - Admin KB function (verify if needed)
52. `admin-kb-patterns` - Admin KB function (verify if needed)

## Category 5: CRM/Shopping (Not in KEEP list - verify)

53. `proposals-api` - Verify if this is same as crm-proposals-api
54. `quote-request-api` - Verify if this is same as crm-quotes-api
55. `shopping-cart-api` - Verify if needed
56. `moodboard-products-api` - Verify if needed
57. `moodboard-quote-api` - Verify if needed

---

## KEEP These (12 functions)

1. `mivaa-gateway` - File upload handling
2. `pdf-batch-process` - Batch processing
3. `crm-contacts-api` - CRM contacts
4. `crm-users-api` - CRM users
5. `crm-stripe-api` - Stripe integration
6. `crewai-3d-generation` - 3D generation
7. `parse-sitemap` - Sitemap parsing
8. `scrape-session-manager` - Scraping sessions
9. `scrape-single-page` - Page scraping

**NOTE**: Missing from filesystem:
- `crm-proposals-api` (mentioned in audit but not in filesystem)
- `crm-quotes-api` (mentioned in audit but not in filesystem)
- `crm-invoices-api` (mentioned in audit but not in filesystem)

These might be named differently or combined with other functions.

---

## Deletion Commands

```bash
# Delete proxy functions (40)
rm -rf supabase/functions/analyze-knowledge-content
rm -rf supabase/functions/document-vector-search
rm -rf supabase/functions/extract-material-knowledge
rm -rf supabase/functions/hybrid-material-analysis
rm -rf supabase/functions/material-agent-orchestrator
rm -rf supabase/functions/material-images-api
rm -rf supabase/functions/ocr-processing
rm -rf supabase/functions/rag-knowledge-search
rm -rf supabase/functions/spaceformer-analysis
rm -rf supabase/functions/svbrdf-extractor
rm -rf supabase/functions/unified-material-search
rm -rf supabase/functions/visual-search-analyze
rm -rf supabase/functions/voice-to-material
rm -rf supabase/functions/auto-analyze-image
rm -rf supabase/functions/enhanced-clip-integration
rm -rf supabase/functions/validate-images
rm -rf supabase/functions/enrich-products
rm -rf supabase/functions/material-recognition
rm -rf supabase/functions/analyze-embedding-stability
rm -rf supabase/functions/apply-quality-scoring
rm -rf supabase/functions/canonical-metadata-extraction
rm -rf supabase/functions/chunk-aware-search
rm -rf supabase/functions/chunk-type-classification
rm -rf supabase/functions/classify-content
rm -rf supabase/functions/detect-boundaries
rm -rf supabase/functions/enhanced-product-processing
rm -rf supabase/functions/quality-control-operations
rm -rf supabase/functions/multi-vector-operations
rm -rf supabase/functions/extract-categories
rm -rf supabase/functions/get-material-categories
rm -rf supabase/functions/process-ai-analysis-queue
rm -rf supabase/functions/process-image-queue
rm -rf supabase/functions/process-image-semantic-linking
rm -rf supabase/functions/visual-search-batch
rm -rf supabase/functions/visual-search-query
rm -rf supabase/functions/visual-search-status
rm -rf supabase/functions/retrieval-api
rm -rf supabase/functions/material-scraper
rm -rf supabase/functions/pdf-extract
rm -rf supabase/functions/mivaa-jwt-generator

# Delete mock functions (2)
rm -rf supabase/functions/style-analysis
rm -rf supabase/functions/huggingface-model-trainer

# Delete replaced/duplicate (3)
rm -rf supabase/functions/pdf-processor
rm -rf supabase/functions/advanced-search-recommendation
rm -rf supabase/functions/pdf-integration-health

# Delete test/legacy (6)
rm -rf supabase/functions/mivaa-gateway-test
rm -rf supabase/functions/admin-kb-quality-dashboard
rm -rf supabase/functions/admin-kb-quality-scores
rm -rf supabase/functions/admin-kb-detections
rm -rf supabase/functions/admin-kb-embeddings-stats
rm -rf supabase/functions/admin-kb-metadata
rm -rf supabase/functions/admin-kb-patterns

# Delete CRM/Shopping (verify first - 5)
rm -rf supabase/functions/proposals-api
rm -rf supabase/functions/quote-request-api
rm -rf supabase/functions/shopping-cart-api
rm -rf supabase/functions/moodboard-products-api
rm -rf supabase/functions/moodboard-quote-api
```

