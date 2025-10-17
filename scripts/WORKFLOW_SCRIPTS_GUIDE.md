# 📚 WORKFLOW SCRIPTS GUIDE

**Last Updated**: 2025-10-16  
**Purpose**: Guide to using workflow testing scripts

---

## 🎯 MAIN WORKFLOW SCRIPT

### `end-to-end-workflow.js` ⭐ **START HERE**

**Purpose**: Complete end-to-end workflow test that mimics frontend flow

**What it does**:
1. ✅ Uploads PDF to Supabase storage
2. ✅ Triggers PDF processing via MIVAA gateway
3. ✅ Monitors job progress
4. ✅ Verifies chunks extraction
5. ✅ Verifies images extraction
6. ✅ Verifies embeddings generation
7. ✅ Performs search on embeddings
8. ✅ Displays all results

**Usage**:
```bash
node scripts/end-to-end-workflow.js
```

**Output**:
- Console logs showing each step
- JSON results file with complete workflow data
- Summary of all operations

**Expected Output**:
```
🚀 END-TO-END WORKFLOW TEST
================================================================================

📋 [timestamp] STEP 1: Uploading PDF to Supabase storage
✅ [timestamp] STEP 1: PDF uploaded successfully
🔄 [timestamp] STEP 2: Triggering PDF processing via MIVAA gateway
✅ [timestamp] STEP 2: Processing triggered successfully
... (more steps)

✅ WORKFLOW COMPLETED SUCCESSFULLY
================================================================================

📊 SUMMARY:
  ✓ PDF Uploaded: test-1697450400000.pdf
  ✓ Job ID: job-123456
  ✓ Chunks Extracted: 45
  ✓ Images Extracted: 12
  ✓ Embeddings Generated: 45
  ✓ Search Results: 10
```

---

## 🔧 SPECIALIZED TESTING SCRIPTS

### For Specific Components

#### `test-retrieval-api.js`
Tests the retrieval API endpoints
```bash
node scripts/test-retrieval-api.js
```

#### `verify-storage-and-retrieval.js`
Verifies storage tables and retrieval functionality
```bash
node scripts/verify-storage-and-retrieval.js
```

#### `test-phase3-integration-complete.js`
Tests Phase 3 integration (quality metrics)
```bash
node scripts/test-phase3-integration-complete.js
```

---

## 📊 LEGACY SCRIPTS (For Reference)

These scripts are kept for reference but should not be used for new testing:

### PDF Processing Tests
- `test-wifi-momo-complete-workflow.js` - Old WIFI MOMO test
- `test-complete-workflow.js` - Old complete workflow
- `test-pdf-flow-complete.js` - Old PDF flow test

### Job Monitoring
- `monitor-wifi-momo-job.js` - Old job monitoring
- `check-wifi-momo-job-final.js` - Old job checking

### Debugging Scripts
- `debug-mivaa-processing.js` - Old MIVAA debugging
- `debug-chunks.js` - Old chunk debugging
- `debug-search-500-error.js` - Old search debugging

---

## 🚀 RECOMMENDED WORKFLOW

### For Complete Testing
```bash
# 1. Run end-to-end workflow
node scripts/end-to-end-workflow.js

# 2. Verify retrieval API
node scripts/verify-storage-and-retrieval.js

# 3. Test Phase 3 integration
node scripts/test-phase3-integration-complete.js
```

### For Quick Health Check
```bash
# Just run the main workflow
node scripts/end-to-end-workflow.js
```

### For Specific Component Testing
```bash
# Test retrieval API only
node scripts/test-retrieval-api.js

# Test storage and retrieval
node scripts/verify-storage-and-retrieval.js
```

---

## 📁 SCRIPT ORGANIZATION

### Main Workflow
- `end-to-end-workflow.js` - Complete workflow test

### Testing Infrastructure
- `test-retrieval-api.js` - Retrieval API tests
- `verify-storage-and-retrieval.js` - Storage verification
- `test-phase3-integration-complete.js` - Integration tests

### Utilities
- `utilities/` - Helper scripts and utilities
- `auth-tests/` - Authentication testing
- `integration-tests/` - Integration testing
- `mivaa-tests/` - MIVAA service testing

### Legacy (Archive)
- `database-analysis/` - Old database analysis
- `comprehensive-api-validation/` - Old API validation
- `frontend-tests/` - Old frontend tests

---

## ✅ WHAT TO TEST

### Complete Flow
1. ✅ PDF Upload
2. ✅ Processing Trigger
3. ✅ Job Monitoring
4. ✅ Chunk Extraction
5. ✅ Image Extraction
6. ✅ Embedding Generation
7. ✅ Search Functionality

### Data Integrity
1. ✅ Data stored correctly
2. ✅ Data retrieved correctly
3. ✅ User ownership enforced
4. ✅ Pagination works
5. ✅ Filtering works

### Performance
1. ✅ Response times acceptable
2. ✅ No timeouts
3. ✅ Efficient pagination
4. ✅ Fast search

---

## 🔍 TROUBLESHOOTING

### If workflow fails at Step 1 (Upload)
- Check Supabase storage bucket exists
- Verify API key is valid
- Check network connectivity

### If workflow fails at Step 2 (Processing)
- Check MIVAA gateway is deployed
- Verify MIVAA service is running
- Check API key for MIVAA

### If workflow fails at Step 3 (Monitoring)
- Check job ID is valid
- Verify job status endpoint works
- Check timeout settings

### If workflow fails at Step 4-5 (Extraction)
- Check document_chunks table exists
- Check document_images table exists
- Verify data was actually extracted

### If workflow fails at Step 6 (Search)
- Check embeddings were generated
- Verify search endpoint is deployed
- Check search query is valid

---

## 📊 EXPECTED RESULTS

### Successful Workflow
```
✅ PDF Uploaded
✅ Processing Triggered
✅ Job Completed
✅ Chunks Extracted: 40+
✅ Images Extracted: 10+
✅ Embeddings Generated: 40+
✅ Search Results: 10+
```

### Data Integrity
```
✅ All chunks have content
✅ All images have URLs
✅ All embeddings have vectors
✅ Search results have scores
```

### Performance
```
✅ Upload: < 5 seconds
✅ Processing: < 5 minutes
✅ Search: < 1 second
✅ Total: < 10 minutes
```

---

## 🎯 NEXT STEPS

### After Successful Workflow
1. Review results file
2. Check data in database
3. Verify search quality
4. Test with different PDFs
5. Monitor performance

### If Issues Found
1. Check error messages
2. Review logs
3. Debug specific step
4. Fix issue
5. Re-run workflow

---

## 📝 NOTES

- All scripts use Supabase credentials from environment
- Results are saved to JSON files for analysis
- Timestamps are included for performance tracking
- Errors are logged for debugging

---

**Status**: ✅ Ready for testing


