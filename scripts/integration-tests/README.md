# Integration Tests

End-to-end integration test scripts for the Material Kai Vision Platform.

## Files

### Comprehensive Testing
- `test-all-fixes-comprehensive.js` - Tests all fixes comprehensively
- `test-frontend-backend-integration.js` - Tests frontend-backend integration
- `test-with-proper-auth.js` - Tests with proper authentication

### API Testing
- `test-api-contracts-real.js` - Tests real API contracts
- `test-api-gateway-direct.js` - Tests API gateway directly

### Function Testing
- `test-fixed-functions-proper.js` - Tests fixed functions properly
- `test-fixed-integration.js` - Tests fixed integration
- `test-simple-working-functions.js` - Tests simple working functions

### Scraper Testing
- `test-scraper-correct-payload.js` - Tests scraper with correct payload
- `test-scraper-functions-debug.js` - Debugs scraper functions
- `test-scraper-service-fix.js` - Tests scraper service fixes
- `test-scraper.sh` - Shell script for scraper testing

### Platform Status
- `test-real-platform-status.js` - Tests real platform status
- `test-after-mivaa-redeploy.js` - Tests after MIVAA redeployment

### Authentication Integration
- `test-mivaa-auth-methods-new-key.js` - Tests MIVAA auth methods with new key
- `test-supabase-mivaa-auth.js` - Tests Supabase-MIVAA authentication

### Material Recognition
- `test-direct-material-recognition.js` - Tests direct material recognition

## Usage

```bash
# Run comprehensive tests
node scripts/integration-tests/test-all-fixes-comprehensive.js

# Test frontend-backend integration
node scripts/integration-tests/test-frontend-backend-integration.js

# Test API contracts
node scripts/integration-tests/test-api-contracts-real.js

# Test platform status
node scripts/integration-tests/test-real-platform-status.js
```

## Purpose

These scripts were created to:
1. Validate end-to-end functionality after fixes
2. Test API contract compliance
3. Ensure proper integration between services
4. Validate authentication flows
5. Test material recognition capabilities
6. Debug scraper functionality
