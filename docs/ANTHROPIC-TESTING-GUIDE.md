# Anthropic Integration Testing Guide

## Quick Start

### 1. Verify Environment Variables
```bash
# Check that ANTHROPIC_API_KEY is set in:
# - Vercel Environment Variables
# - Supabase Edge Function Secrets
# - MIVAA Backend .env

echo $ANTHROPIC_API_KEY  # Should show sk-ant-...
```

### 2. Test Image Validation Endpoint

```bash
# Direct MIVAA endpoint test
curl -X POST https://v1api.materialshub.gr/api/v1/anthropic/images/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MIVAA_API_KEY" \
  -d '{
    "image_id": "test_img_123",
    "image_url": "https://example.com/image.jpg",
    "product_groups": ["electronics", "furniture"],
    "workspace_id": "test_workspace"
  }'
```

### 3. Test Product Enrichment Endpoint

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/anthropic/products/enrich \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MIVAA_API_KEY" \
  -d '{
    "chunk_id": "chunk_123",
    "chunk_content": "High-quality stainless steel kitchen knife with ergonomic handle. Features sharp blade, comfortable grip, and dishwasher safe.",
    "workspace_id": "test_workspace"
  }'
```

### 4. End-to-End PDF Processing Test

1. **Upload a PDF** via the admin panel
2. **Monitor the workflow** in real-time:
   - Watch Step 9: Anthropic Image Validation
   - Watch Step 10: Anthropic Product Enrichment
3. **Check the results**:
   - Go to Admin → Knowledge Base → Images tab
   - Verify images have validation_status and quality_score
   - Go to Admin → Knowledge Base → Products tab
   - Verify products have enrichment_status and confidence_score

### 5. Database Verification

```sql
-- Check image validations
SELECT id, image_id, validation_status, quality_score, created_at
FROM image_validations
ORDER BY created_at DESC
LIMIT 10;

-- Check product enrichments
SELECT id, chunk_id, enrichment_status, product_name, confidence_score, created_at
FROM product_enrichments
ORDER BY created_at DESC
LIMIT 10;

-- Check workflow jobs
SELECT id, name, status, created_at
FROM workflow_jobs
WHERE name LIKE '%MIVAA%'
ORDER BY created_at DESC
LIMIT 5;
```

## Expected Results

### Image Validation
- ✅ quality_score between 0 and 1
- ✅ validation_status: "valid", "needs_review", or "invalid"
- ✅ product_associations array with confidence scores
- ✅ issues and recommendations arrays
- ✅ processing_time_ms recorded

### Product Enrichment
- ✅ product_name extracted
- ✅ product_category identified
- ✅ product_description generated
- ✅ specifications extracted as JSON
- ✅ related_products array populated
- ✅ confidence_score between 0 and 1
- ✅ enrichment_status: "enriched", "partial", or "failed"

## Troubleshooting

### Issue: "ANTHROPIC_API_KEY not configured"
**Solution**: 
- Verify key is set in Vercel Environment Variables
- Verify key is set in Supabase Edge Function Secrets
- Verify key is set in MIVAA backend .env
- Restart services after setting

### Issue: "Image validation failed: 401"
**Solution**:
- Check MIVAA_API_KEY is correct
- Verify MIVAA service is running
- Check network connectivity to MIVAA

### Issue: "Claude API error: 429"
**Solution**:
- Rate limit exceeded
- Wait a few minutes before retrying
- Check Anthropic API usage dashboard

### Issue: "Processing timeout"
**Solution**:
- PDF is too large
- Try with smaller PDF
- Disable image extraction in options
- Increase timeout in consolidatedPDFWorkflowService

### Issue: "Fallback to basic validation"
**Solution**:
- Anthropic API is unavailable
- Check API key and network
- Check MIVAA service logs
- System will continue with basic validation

## Performance Monitoring

### Check Processing Times
```typescript
// In browser console after PDF upload
const job = window.workflowJobs.get('job-id');
job.steps.forEach(step => {
  console.log(`${step.name}: ${step.duration}ms`);
});
```

### Expected Timings
- Image Validation: 2-3 seconds per image
- Product Enrichment: 3-4 seconds per chunk
- Total for 10 images + 50 chunks: ~3-5 minutes

## Logging

### Check MIVAA Logs
```bash
# View MIVAA service logs
docker logs mivaa-service

# Search for Anthropic calls
docker logs mivaa-service | grep -i anthropic
```

### Check Supabase Edge Function Logs
```bash
# View in Supabase dashboard
# Functions → validate-images → Logs
# Functions → enrich-products → Logs
```

### Check Frontend Logs
```typescript
// In browser console
console.log('Workflow jobs:', window.workflowJobs);
console.log('Current job:', window.workflowJobs.get('job-id'));
```

## Success Criteria

✅ All tests pass when:
1. Images are validated with Claude Vision
2. Products are enriched with Claude Sonnet
3. Results are stored in database
4. Workflow steps complete successfully
5. No errors in logs
6. Processing times are reasonable
7. Fallback works when API unavailable

## Next Steps After Testing

1. **Monitor API Usage**: Check Anthropic dashboard for costs
2. **Optimize Prompts**: Fine-tune based on results
3. **Scale Testing**: Test with larger PDFs and batches
4. **User Documentation**: Update guides with new features
5. **Performance Tuning**: Optimize timeouts and batch sizes

