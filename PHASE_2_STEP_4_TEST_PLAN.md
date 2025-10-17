# 📋 PHASE 2 STEP 4: TESTING - TEST PLAN

**Date**: 2025-10-16  
**Status**: IN PROGRESS  
**Objective**: Comprehensive testing of retrieval endpoints

---

## 🎯 TEST OBJECTIVES

### Primary Goals
1. ✅ Verify GET single result works correctly
2. ✅ Verify LIST with pagination works correctly
3. ✅ Verify SEARCH with filters works correctly
4. ✅ Verify DELETE operation works correctly
5. ✅ Verify error handling for invalid inputs
6. ✅ Verify user ownership verification
7. ✅ Verify table whitelist enforcement

### Success Criteria
- All 7 test categories pass
- No errors in retrieval endpoints
- User ownership properly verified
- Invalid requests properly rejected
- Pagination works correctly
- Search filters work correctly

---

## 🧪 TEST CASES

### Test 1: GET Single Result
**Purpose**: Verify fetching a single result by ID works

**Steps**:
1. Create test data in a storage table
2. Call GET /retrieval-api/{table}/get/{id}
3. Verify response contains correct data
4. Verify response has success=true
5. Verify metadata includes timestamp and processing_time_ms

**Expected Result**: ✅ PASS
- HTTP 200
- success: true
- data contains the correct record
- metadata present

**Failure Scenarios**:
- ❌ HTTP 404 if ID doesn't exist
- ❌ HTTP 400 if ID is missing
- ❌ HTTP 403 if user doesn't own the record

---

### Test 2: LIST Results with Pagination
**Purpose**: Verify listing results with pagination works

**Steps**:
1. Create 3+ test records in a storage table
2. Call GET /retrieval-api/{table}/list?limit=10&offset=0
3. Verify response contains array of results
4. Verify pagination info is present
5. Verify total count is correct
6. Verify has_more flag is correct

**Expected Result**: ✅ PASS
- HTTP 200
- success: true
- data is an array
- pagination.total >= 3
- pagination.limit = 10
- pagination.offset = 0
- pagination.has_more is boolean

**Failure Scenarios**:
- ❌ Missing pagination info
- ❌ Incorrect total count
- ❌ Wrong limit/offset values

---

### Test 3: SEARCH Results with Filters
**Purpose**: Verify searching with filters works

**Steps**:
1. Create test record with confidence_score = 0.95
2. Call POST /retrieval-api/{table}/search with confidence_min=0.9
3. Verify response contains matching results
4. Verify results have confidence >= 0.9
5. Verify response is array

**Expected Result**: ✅ PASS
- HTTP 200
- success: true
- data is an array
- All results have confidence_score >= 0.9
- Results match search criteria

**Failure Scenarios**:
- ❌ Returns results below confidence threshold
- ❌ Missing search results
- ❌ Invalid filter handling

---

### Test 4: DELETE Result
**Purpose**: Verify deleting a result works

**Steps**:
1. Create test record
2. Call DELETE /retrieval-api/{table}/delete/{id}
3. Verify response indicates success
4. Verify record is actually deleted
5. Verify subsequent GET returns 404

**Expected Result**: ✅ PASS
- HTTP 200
- success: true
- message indicates deletion
- Record no longer exists in database

**Failure Scenarios**:
- ❌ Record still exists after delete
- ❌ Wrong record deleted
- ❌ Unauthorized deletion

---

### Test 5: Reject Invalid Table Name
**Purpose**: Verify table whitelist is enforced

**Steps**:
1. Call GET /retrieval-api/invalid_table/list
2. Verify request is rejected
3. Verify error code is INVALID_TABLE
4. Verify HTTP status is 403

**Expected Result**: ✅ PASS
- HTTP 403
- success: false
- error_code: INVALID_TABLE
- error message explains table not allowed

**Failure Scenarios**:
- ❌ Invalid table is accepted
- ❌ Wrong HTTP status
- ❌ Wrong error code

---

### Test 6: Reject Missing ID
**Purpose**: Verify required parameters are validated

**Steps**:
1. Call GET /retrieval-api/{table}/get/ (no ID)
2. Verify request is rejected
3. Verify error code is MISSING_ID
4. Verify HTTP status is 400

**Expected Result**: ✅ PASS
- HTTP 400
- success: false
- error_code: MISSING_ID
- error message explains ID is required

**Failure Scenarios**:
- ❌ Request is accepted without ID
- ❌ Wrong HTTP status
- ❌ Wrong error code

---

### Test 7: Verify User Ownership
**Purpose**: Verify users can only access their own data

**Steps**:
1. Create test record with user_id = "user123"
2. Call GET /retrieval-api/{table}/get/{id}?user_id=user123
3. Verify request succeeds
4. Call GET /retrieval-api/{table}/get/{id}?user_id=different_user
5. Verify request is rejected (404)

**Expected Result**: ✅ PASS
- First request: HTTP 200, success: true
- Second request: HTTP 404, success: false
- User can only see their own data

**Failure Scenarios**:
- ❌ User can see other users' data
- ❌ Wrong HTTP status for unauthorized access
- ❌ No user ownership verification

---

## 📊 TEST EXECUTION PLAN

### Phase 1: Unit Tests (30 min)
- Test each operation independently
- Test with valid inputs
- Verify correct responses

### Phase 2: Error Handling Tests (30 min)
- Test with invalid table names
- Test with missing parameters
- Test with invalid operations
- Verify proper error codes

### Phase 3: Security Tests (30 min)
- Test user ownership verification
- Test table whitelist enforcement
- Test unauthorized access attempts
- Verify security headers

### Phase 4: Integration Tests (30 min)
- Test complete workflows
- Test pagination across multiple pages
- Test search with various filters
- Test delete and verify deletion

---

## 🛠️ TEST TOOLS

### Test Script
**File**: `scripts/test-retrieval-api.js`

**Features**:
- Automated test execution
- Creates test data
- Verifies responses
- Reports results
- Cleans up test data

**Usage**:
```bash
node scripts/test-retrieval-api.js
```

**Output**:
```
🧪 RETRIEVAL API TEST SUITE
================================================================================
Test User ID: test-user-1697450400000
Base URL: https://your-domain.com

🧪 Testing: GET single result
✅ PASS: GET single result

🧪 Testing: LIST results with pagination
✅ PASS: LIST results with pagination

... (more tests)

📊 TEST SUMMARY
================================================================================
✅ Passed: 7
❌ Failed: 0
📈 Total: 7
================================================================================

🎉 ALL TESTS PASSED!
```

---

## 📈 SUCCESS METRICS

### Quantitative Metrics
- ✅ 7/7 tests pass (100%)
- ✅ 0 errors in retrieval endpoints
- ✅ All HTTP status codes correct
- ✅ All error codes correct
- ✅ Response times < 500ms

### Qualitative Metrics
- ✅ User ownership properly verified
- ✅ Invalid requests properly rejected
- ✅ Pagination works correctly
- ✅ Search filters work correctly
- ✅ Error messages are clear

---

## 🚀 NEXT STEPS AFTER TESTING

### If All Tests Pass ✅
1. Proceed to Step 5: Verify & Retrieve
2. Test end-to-end workflows
3. Verify data integrity
4. Test with real processing functions

### If Tests Fail ❌
1. Identify failing test
2. Debug the issue
3. Fix the code
4. Re-run tests
5. Repeat until all pass

---

## 📝 TEST DOCUMENTATION

### Test Results Template
```
Test: [Test Name]
Status: [PASS/FAIL]
Duration: [X ms]
Details: [Any relevant details]
```

### Error Documentation Template
```
Error: [Error message]
Test: [Which test failed]
Cause: [Root cause]
Fix: [How to fix]
```

---

## ✅ CHECKLIST

- [ ] Test script created
- [ ] Test plan documented
- [ ] All 7 test cases defined
- [ ] Test data creation working
- [ ] GET single result test passing
- [ ] LIST pagination test passing
- [ ] SEARCH filter test passing
- [ ] DELETE operation test passing
- [ ] Invalid table rejection test passing
- [ ] Missing ID rejection test passing
- [ ] User ownership verification test passing
- [ ] All tests passing (7/7)
- [ ] No errors in logs
- [ ] Response times acceptable
- [ ] Ready for Step 5

---

**Status**: Ready to execute tests


