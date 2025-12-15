# Interior Design Generation - Verification Checklist

## ✅ Pre-Flight Checks

### 1. Database Schema Verification
```sql
-- Verify generation_3d table has correct columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'generation_3d';

-- Expected columns:
-- id (uuid)
-- user_id (uuid)
-- workspace_id (uuid)
-- generation_name (text)
-- generation_type (text)
-- generation_status (text)
-- progress_percentage (integer)
-- input_data (jsonb) ← CRITICAL
-- metadata (jsonb) ← CRITICAL
-- created_at (timestamp)
-- updated_at (timestamp)
-- completed_at (timestamp)
-- error_message (text)
```

### 2. MIVAA API Configuration
```bash
# Check environment variables
echo $REPLICATE_API_TOKEN  # Must be set
echo $SUPABASE_URL         # Must be set
echo $SUPABASE_SERVICE_KEY # Must be set

# Verify MIVAA is running
curl http://localhost:8000/health
```

### 3. Model List Verification
```python
# In mivaa-pdf-extractor/app/api/interior_design_routes.py
len(TEXT_TO_IMAGE_MODELS)    # Should be 7
len(IMAGE_TO_IMAGE_MODELS)   # Should be 7
len(ALL_MODELS)              # Should be 14
```

---

## 🧪 Test Scenarios

### Test 1: Text-to-Image Generation
**Input:**
```json
{
  "prompt": "Modern minimalist bedroom with oak flooring",
  "room_type": "bedroom",
  "style": "modern minimalist",
  "user_id": "test-user-id",
  "workspace_id": "test-workspace-id"
}
```

**Expected Behavior:**
1. ✅ MIVAA creates job in database
2. ✅ Uses 7 text-to-image models
3. ✅ Returns job_id immediately
4. ✅ Background task processes all 7 models
5. ✅ Database updates with 7 image URLs
6. ✅ Frontend displays 7 images

**Verification Queries:**
```sql
-- Check job created
SELECT id, generation_status, progress_percentage 
FROM generation_3d 
WHERE id = 'job-id';

-- Check input_data
SELECT input_data->>'prompt' as prompt,
       input_data->>'room_type' as room_type,
       input_data->>'style' as style
FROM generation_3d 
WHERE id = 'job-id';

-- Check metadata
SELECT 
  jsonb_array_length(metadata->'models_queue') as queue_count,
  jsonb_array_length(metadata->'models_results') as results_count
FROM generation_3d 
WHERE id = 'job-id';

-- Check individual model results
SELECT 
  jsonb_array_elements(metadata->'models_results')->>'model_name' as model,
  jsonb_array_elements(metadata->'models_results')->>'status' as status,
  jsonb_array_length(jsonb_array_elements(metadata->'models_results')->'image_urls') as image_count
FROM generation_3d 
WHERE id = 'job-id';
```

---

### Test 2: Image-to-Image Generation
**Input:**
```json
{
  "prompt": "Transform into modern minimalist style",
  "image": "https://example.com/bedroom.jpg",
  "room_type": "bedroom",
  "style": "modern minimalist",
  "user_id": "test-user-id",
  "workspace_id": "test-workspace-id"
}
```

**Expected Behavior:**
1. ✅ MIVAA creates job in database
2. ✅ Uses 3 working image-to-image models
3. ✅ Returns job_id immediately
4. ✅ Background task processes all 3 models
5. ✅ Database updates with 3 image URLs
6. ✅ Frontend displays 3 images

**Verification:**
Same queries as Test 1, but expect 3 models instead of 7

---

### Test 3: Custom Model Selection
**Input:**
```json
{
  "prompt": "Modern bedroom",
  "models": ["flux-dev", "sdxl"],
  "user_id": "test-user-id",
  "workspace_id": "test-workspace-id"
}
```

**Expected Behavior:**
1. ✅ Uses only specified models (2)
2. ✅ Returns 2 images

---

## 🔍 Debugging Commands

### Check MIVAA Logs
```bash
# If running with Docker
docker logs mivaa-api -f

# If running directly
tail -f mivaa-pdf-extractor/logs/app.log
```

### Check Database State
```sql
-- Get latest job
SELECT * FROM generation_3d 
ORDER BY created_at DESC 
LIMIT 1;

-- Get job with full metadata
SELECT 
  id,
  generation_status,
  progress_percentage,
  input_data,
  metadata,
  error_message
FROM generation_3d 
WHERE id = 'job-id';

-- Pretty print metadata
SELECT jsonb_pretty(metadata) 
FROM generation_3d 
WHERE id = 'job-id';
```

### Check Frontend State
```javascript
// In browser console
// Check if job info is extracted
console.log(asyncJobInfo);

// Check polling
// Open Network tab, filter by "generation_3d"
// Should see requests every 3 seconds
```

---

## ❌ Common Issues & Solutions

### Issue: "Column 'models_results' does not exist"
**Solution:** Database schema mismatch. Data should be in `metadata` JSONB field.

### Issue: Frontend shows no images
**Solution:** Check if frontend is reading from `metadata.models_results` instead of `models_results`

### Issue: Background task not updating
**Solution:** Check REPLICATE_API_TOKEN is set and valid

### Issue: Only 7 models instead of 14
**Solution:** Check if IMAGE_TO_IMAGE_MODELS are defined in interior_design_routes.py

---

## ✅ Success Criteria

- [ ] Database INSERT uses `input_data` and `metadata` JSONB fields
- [ ] Background task updates `metadata.models_results`
- [ ] Frontend reads from `metadata.models_results`
- [ ] Text-to-image uses 7 models
- [ ] Image-to-image uses 3 working models
- [ ] Progress bar updates correctly
- [ ] Images display in grid as they complete
- [ ] No database errors in logs
- [ ] No frontend errors in console

## 🎉 Ready for Production!

