# MIVAA Authentication Investigation Results

**Date**: October 6, 2025  
**Status**: Authentication Issue Identified - JWT Secret Mismatch

## 🔍 Investigation Summary

### ✅ What We Discovered

1. **MIVAA Service is Running**: 
   - Health endpoint accessible at `https://v1api.materialshub.gr/health`
   - Service: "PDF Processing Service" v1.0.0
   - Status: healthy

2. **Authentication Method**: 
   - Uses JWT Bearer token authentication
   - Format: `Authorization: Bearer <jwt-token>`
   - Bearer Format: JWT (confirmed in OpenAPI spec)

3. **JWT Requirements**:
   - Algorithm: HS256
   - Required claims: `sub`, `exp`, `iat`
   - Expected audience: `"mivaa-pdf-extractor"` (not `"mivaa-service"`)
   - Expected issuer: `"material-kai-platform"`

4. **All Endpoints Require Auth**: 
   - Despite OpenAPI spec showing some as "Security: None"
   - All material recognition endpoints return 401 without auth
   - Error message: "Missing authentication token" or "Invalid authentication token"

### ❌ Root Cause Identified

**JWT Secret Key Mismatch**: The JWT tokens we generate are valid locally but rejected by MIVAA service because:

1. **Different JWT Secret**: MIVAA service uses `JWT_SECRET_KEY` environment variable
2. **Our Generator**: Uses hardcoded secret in `generate-jwt-local.js`
3. **Result**: Tokens are cryptographically invalid for MIVAA service

## 🔧 Technical Details

### JWT Token Structure (Correct Format)
```json
{
  "iss": "material-kai-vision-platform",
  "aud": "mivaa-pdf-extractor",
  "iat": 1759781648,
  "exp": 1759868048,
  "jti": "unique-id",
  "sub": "material-kai-platform",
  "api_key": "mk_api_2024_...",
  "service": "mivaa",
  "permissions": ["material_recognition", "semantic_search", "pdf_processing"],
  "organization": "material-kai-vision-platform"
}
```

### MIVAA Service Configuration
```python
# mivaa-pdf-extractor/app/config.py
jwt_secret_key: str = Field(default="", env="JWT_SECRET_KEY")
jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM") 
jwt_issuer: str = Field(default="material-kai-platform", env="JWT_ISSUER")
jwt_audience: str = Field(default="mivaa-pdf-extractor", env="JWT_AUDIENCE")
```

## 🎯 Solutions

### Option 1: Use Supabase JWT Generator Function (Recommended)
```bash
# Call the existing Supabase function
curl -X POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-jwt-generator \
  -H "Authorization: Bearer <supabase-anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"action": "mivaa_token", "payload": {}}'
```

### Option 2: Configure Matching JWT Secret
1. Get the JWT secret used by MIVAA service
2. Update our JWT generator to use the same secret
3. Generate new tokens with correct secret

### Option 3: Bypass Authentication (Development Only)
- Modify MIVAA service to allow certain endpoints without auth
- Not recommended for production

## 📋 Next Steps

1. **Immediate**: Use Supabase JWT generator function to create valid token
2. **Set Environment Variable**: Update `MIVAA_API_KEY` in Supabase with valid JWT
3. **Test Integration**: Verify material recognition works with proper JWT
4. **Document Process**: Create procedure for JWT token renewal

## 🔗 Related Files

- `supabase/functions/mivaa-jwt-generator/index.ts` - JWT generator function
- `generate-jwt-local.js` - Local JWT generator (needs secret update)
- `mivaa-pdf-extractor/app/middleware/jwt_auth.py` - MIVAA auth middleware
- `mivaa-openapi-spec.json` - Complete API specification

## 🚨 Security Note

The JWT secret key must be kept secure and synchronized between:
- MIVAA service (`JWT_SECRET_KEY` environment variable)
- JWT generator functions
- Any other services that need to create MIVAA tokens

**Status**: Ready for implementation with Supabase JWT generator function.
