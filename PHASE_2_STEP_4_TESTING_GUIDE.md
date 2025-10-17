# 🧪 PHASE 2 STEP 4: TESTING - COMPREHENSIVE GUIDE

**Date**: 2025-10-16  
**Status**: READY TO TEST  
**Objective**: Test retrieval endpoints before deployment

---

## 📋 TESTING WORKFLOW

### Step 1: Deploy retrieval-api Function
The retrieval-api function needs to be deployed to Supabase before testing.

**Option A: Automatic Deployment (Recommended)**
```bash
# Push to main branch - GitHub Actions will deploy automatically
git push origin main
# Wait ~8 minutes for deployment to complete
```

**Option B: Manual Deployment**
```bash
# Deploy only Supabase functions
supabase functions deploy --project-ref bgbavxtjlbvgplozizxu
```

### Step 2: Verify Deployment
```bash
# Check if retrieval-api is deployed
curl -X GET "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/list" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Expected response:
```json
{
  "success": true,
  "data": [],
  "pagination": { "total": 0, "limit": 20, "offset": 0, "has_more": false },
  "metadata": { "timestamp": "...", "processing_time_ms": 45 }
}
```

### Step 3: Run Test Suite
```bash
# Run comprehensive tests
node scripts/test-retrieval-api.js
```

Expected output:
```
🧪 RETRIEVAL API TEST SUITE
================================================================================
✅ PASS: GET single result
✅ PASS: LIST results with pagination
✅ PASS: SEARCH results with filters
✅ PASS: DELETE result
✅ PASS: Reject invalid table name
✅ PASS: Reject missing ID
✅ PASS: Verify user ownership

📊 TEST SUMMARY
================================================================================
✅ Passed: 7
❌ Failed: 0
📈 Total: 7
================================================================================

🎉 ALL TESTS PASSED!
```

---

## 🧪 MANUAL TESTING (If Automated Tests Fail)

### Test 1: GET Single Result

**Create test data**:
```bash
curl -X POST "https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/style_analysis_results" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-123",
    "input_data": { "image_url": "test.jpg" },
    "result_data": { "style": "modern", "confidence": 0.95 },
    "confidence_score": 0.95,
    "processing_time_ms": 1234,
    "created_at": "2025-10-16T10:00:00Z",
    "updated_at": "2025-10-16T10:00:00Z"
  }'
```

**Fetch result**:
```bash
curl -X GET "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/get/{ID}?user_id=test-user-123" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected**: HTTP 200, success: true, data contains the record

---

### Test 2: LIST Results

```bash
curl -X GET "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/list?user_id=test-user-123&limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected**: HTTP 200, success: true, data is array, pagination info present

---

### Test 3: SEARCH Results

```bash
curl -X POST "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/search" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-123",
    "confidence_min": 0.9,
    "limit": 10
  }'
```

**Expected**: HTTP 200, success: true, data contains matching results

---

### Test 4: DELETE Result

```bash
curl -X DELETE "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/delete/{ID}?user_id=test-user-123" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected**: HTTP 200, success: true, message indicates deletion

---

### Test 5: Error Cases

**Invalid table**:
```bash
curl -X GET "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/invalid_table/list" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected**: HTTP 403, success: false, error_code: INVALID_TABLE

**Missing ID**:
```bash
curl -X GET "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/retrieval-api/style_analysis_results/get/" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected**: HTTP 400, success: false, error_code: MISSING_ID

---

## 🔍 TROUBLESHOOTING

### Issue: Function not found (404)
**Cause**: retrieval-api not deployed yet  
**Solution**: 
1. Push to main: `git push origin main`
2. Wait for GitHub Actions to deploy (~8 minutes)
3. Verify deployment: Check Supabase dashboard

### Issue: Unauthorized (401)
**Cause**: Invalid or missing API key  
**Solution**:
1. Get your anon key from Supabase dashboard
2. Include in Authorization header: `Bearer YOUR_ANON_KEY`

### Issue: Table not found (404)
**Cause**: Table doesn't exist in database  
**Solution**:
1. Verify table exists: Check Supabase dashboard
2. Check table name spelling
3. Ensure table is in whitelist (15 allowed tables)

### Issue: User ownership verification fails
**Cause**: Trying to access other user's data  
**Solution**:
1. Always include `user_id` parameter
2. Use the same user_id that created the record
3. System will return 404 if user doesn't own record

---

## 📊 TESTING CHECKLIST

### Pre-Testing
- [ ] retrieval-api function created locally
- [ ] Test script created (scripts/test-retrieval-api.js)
- [ ] Test plan documented
- [ ] Code committed to git

### Deployment
- [ ] Push to main branch
- [ ] Wait for GitHub Actions deployment
- [ ] Verify function deployed in Supabase dashboard
- [ ] Verify function is ACTIVE status

### Testing
- [ ] Run automated test suite
- [ ] All 7 tests pass
- [ ] No errors in logs
- [ ] Response times acceptable

### Verification
- [ ] GET single result works
- [ ] LIST with pagination works
- [ ] SEARCH with filters works
- [ ] DELETE operation works
- [ ] Invalid table rejected
- [ ] Missing ID rejected
- [ ] User ownership verified

### Post-Testing
- [ ] All tests passing
- [ ] No errors in logs
- [ ] Ready for Step 5: Verify & Retrieve
- [ ] Document any issues found

---

## 🚀 NEXT STEPS

### If All Tests Pass ✅
1. Proceed to Step 5: Verify & Retrieve
2. Test end-to-end workflows
3. Verify data integrity
4. Test with real processing functions

### If Tests Fail ❌
1. Check error messages in test output
2. Review troubleshooting section
3. Debug the specific failing test
4. Fix the issue
5. Re-run tests
6. Repeat until all pass

---

## 📝 ENVIRONMENT VARIABLES

For testing, you'll need:
- `SUPABASE_URL`: https://bgbavxtjlbvgplozizxu.supabase.co
- `SUPABASE_ANON_KEY`: Your anon key from Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (for admin operations)

Get these from Supabase dashboard:
1. Go to Project Settings
2. Click "API" in left sidebar
3. Copy the keys

---

## ✅ SUCCESS CRITERIA

- ✅ retrieval-api function deployed
- ✅ All 7 tests pass
- ✅ No errors in logs
- ✅ Response times < 500ms
- ✅ User ownership properly verified
- ✅ Invalid requests properly rejected
- ✅ Pagination works correctly
- ✅ Search filters work correctly

---

**Status**: Ready to deploy and test


