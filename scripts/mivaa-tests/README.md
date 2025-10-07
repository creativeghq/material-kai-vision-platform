# MIVAA Tests

Scripts for testing MIVAA (Material Kai Vision Platform) service integration.

## Files

### Core MIVAA Testing
- `fetch-mivaa-openapi.js` - Fetches and analyzes MIVAA OpenAPI specification
- `test-mivaa-config.js` - Tests MIVAA service configuration
- `test-mivaa-no-auth.js` - Tests MIVAA endpoints without authentication
- `test-mivaa-integration-complete.js` - Comprehensive MIVAA integration test
- `analyze-mivaa-error.js` - Analyzes MIVAA API errors and responses

### Authentication Testing
- `test-mivaa-auth.js` - Tests MIVAA authentication methods
- `test-mivaa-auth-fix.js` - Tests authentication fixes
- `test-mivaa-coordination.js` - Tests MIVAA coordination functionality

### Gateway Testing
- `test-mivaa-gateway-integration.js` - Tests MIVAA gateway integration

### API Key Testing
- `test-new-mivaa-key-real.js` - Tests new MIVAA API keys
- `test-updated-mivaa-key.js` - Tests updated MIVAA API keys
- `test-new-updated-key.js` - Tests newly updated keys

### Resources
- `mivaa-openapi-spec.json` - Complete MIVAA OpenAPI specification

## Usage

```bash
# Run individual tests
node scripts/mivaa-tests/test-mivaa-config.js
node scripts/mivaa-tests/test-mivaa-integration-complete.js

# Fetch latest OpenAPI spec
node scripts/mivaa-tests/fetch-mivaa-openapi.js
```

## Purpose

These scripts were created to:
1. Debug MIVAA API contract mismatches
2. Test authentication and authorization
3. Validate endpoint functionality
4. Analyze API responses and errors
5. Ensure proper integration with the frontend
