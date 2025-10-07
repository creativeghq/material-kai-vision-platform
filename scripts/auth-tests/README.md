# Authentication Tests

Scripts for testing JWT authentication and token management.

## Files

### JWT Generation
- `generate-jwt-local.js` - Generates JWT tokens locally for testing
- `test-jwt-generator.js` - Tests JWT generation functionality
- `test-deployed-jwt-generator.js` - Tests deployed JWT generator function

### JWT Debugging
- `debug-jwt-requests.js` - Debugs JWT request/response cycles
- `debug-mivaa-token-validation.js` - Debugs MIVAA token validation

### Supabase Integration
- `test-supabase-jwt-generator.js` - Tests Supabase JWT generator function

## Usage

```bash
# Generate a test JWT token
node scripts/auth-tests/generate-jwt-local.js

# Test JWT generator function
node scripts/auth-tests/test-jwt-generator.js

# Debug JWT validation
node scripts/auth-tests/debug-mivaa-token-validation.js
```

## Purpose

These scripts were created to:
1. Debug JWT authentication issues between frontend and MIVAA service
2. Test JWT token generation and validation
3. Identify JWT secret key mismatches
4. Validate Supabase JWT generator function
5. Ensure proper authentication flow

## Key Findings

- MIVAA service requires JWT tokens, not API keys
- JWT secret key must match between token generation and MIVAA service
- Audience should be "mivaa-pdf-extractor" not "mivaa-service"
- Issuer should be "material-kai-platform"
