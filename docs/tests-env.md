# Test Environment Configuration

This document describes how to configure and use test authentication in the Material Kai Vision Platform, specifically for the MIVAA PDF Extractor service.

## Overview

The platform implements a secure test authentication system that allows developers to test functionality without requiring full production authentication setup. This system is designed with multiple security layers to prevent accidental use in production environments.

## Security Model

### Multi-Layer Security Validation

A user is considered a test user ONLY if ALL of these conditions are met:

1. **Environment Check**: Environment must be one of: `development`, `testing`, `dev`, `test`
2. **Explicit Enable Flag**: `ENABLE_TEST_AUTHENTICATION=true` must be set
3. **Test User Flag**: JWT claims must include `is_test_user: true`
4. **UUID Validation**: User ID must match the specific test UUID: `00000000-0000-0000-0000-000000000001`
5. **API Key Validation**: API key must be in the configured test keys list

### Production Safety Features

- **Defaults to production mode** - test auth is disabled by default
- **Explicit opt-in required** - must set `ENABLE_TEST_AUTHENTICATION=true`
- **Environment validation** - rejects test users in production environments
- **Comprehensive logging** - all test user access is logged with environment info

## Environment Variables

### Required for Test Authentication

```bash
# Environment type (must be development/testing/dev/test for test auth)
ENVIRONMENT=development

# Explicitly enable test authentication (required)
ENABLE_TEST_AUTHENTICATION=true

# Custom test API keys (optional, comma-separated)
TEST_API_KEYS=my-dev-key,another-test-key,team-test-key
```

### Default Test API Keys

If `TEST_API_KEYS` is not configured, these default keys are available:
- `test-key`
- `test-api-key` 
- `development-key`

## Configuration Examples

### Development Environment

```bash
# .env.development
ENVIRONMENT=development
ENABLE_TEST_AUTHENTICATION=true
TEST_API_KEYS=dev-team-key,local-test-key

# Optional: Custom test workspace
TEST_WORKSPACE_ID=00000000-0000-0000-0000-000000000002
```

### Testing/CI Environment

```bash
# .env.testing
ENVIRONMENT=testing
ENABLE_TEST_AUTHENTICATION=true
TEST_API_KEYS=ci-test-key,automated-test-key

# Disable external services for testing
MATERIAL_KAI_PLATFORM_URL=
MATERIAL_KAI_SYNC_ENABLED=false
```

### Production Environment (Test Auth Disabled)

```bash
# .env.production
ENVIRONMENT=production
ENABLE_TEST_AUTHENTICATION=false
# TEST_API_KEYS not set - test auth completely disabled
```

## Usage

### API Authentication

Use test API keys in the Authorization header:

```bash
# Using default test key
curl -H "Authorization: Bearer test-key" \
     http://localhost:8000/api/v1/documents/health

# Using custom test key
curl -H "Authorization: Bearer dev-team-key" \
     http://localhost:8000/api/v1/documents/process
```

### Test User Properties

When authenticated with a test API key, the user receives these properties:

```json
{
  "sub": "00000000-0000-0000-0000-000000000001",
  "user_id": "00000000-0000-0000-0000-000000000001",
  "workspace_id": "00000000-0000-0000-0000-000000000002",
  "role": "admin",
  "permissions": [
    "admin:all", "pdf:read", "pdf:write", 
    "document:read", "document:write", 
    "search:read", "image:read", "image:write"
  ],
  "is_test_user": true,
  "environment": "development"
}
```

## Security Features

### Workspace Validation Bypass

Test users bypass workspace validation in development environments:

```python
# Workspace access is automatically granted for test users
# No database lookup required
# Logged for security monitoring
```

### Comprehensive Logging

All test authentication events are logged:

```
INFO - Valid test API key authenticated: dev-team-key (environment: development)
INFO - Bypassing workspace validation for test user in development environment
```

## Troubleshooting

### Test Authentication Not Working

1. **Check Environment**: Ensure `ENVIRONMENT` is set to development/testing
2. **Verify Enable Flag**: Confirm `ENABLE_TEST_AUTHENTICATION=true`
3. **Check API Key**: Verify key is in `TEST_API_KEYS` or using default keys
4. **Review Logs**: Check application logs for authentication errors

### Common Error Messages

```bash
# Test auth disabled in production
"Test API key rejected in production environment"

# Test auth not enabled
"Invalid authentication token" (when ENABLE_TEST_AUTHENTICATION=false)

# Wrong environment
"Test API key rejected in staging environment"
```

### Debugging Commands

```bash
# Check current environment configuration
curl -H "Authorization: Bearer test-key" \
     http://localhost:8000/api/v1/health

# View authentication logs
journalctl -u mivaa-pdf-extractor -f | grep "test"
```

## Best Practices

### Development Teams

1. **Use custom test keys** for each developer/team
2. **Set unique TEST_API_KEYS** per environment
3. **Never commit test keys** to version control
4. **Rotate test keys** regularly

### CI/CD Pipelines

1. **Use dedicated CI test keys**
2. **Set ENVIRONMENT=testing** in CI
3. **Enable test auth only for test stages**
4. **Disable external service connections**

### Security Guidelines

1. **Never enable test auth in production**
2. **Monitor test auth usage** in logs
3. **Use environment-specific configurations**
4. **Regularly audit test key usage**

## Integration with MIVAA Advanced Processing

The test authentication system resolves the "MIVAA Advanced Processing" 411ms failure by:

1. **Bypassing Material Kai platform connection** (disabled by default)
2. **Providing valid authentication** for PDF processing endpoints
3. **Skipping workspace validation** for test users
4. **Enabling full API access** for development/testing

This allows developers to test the complete PDF processing pipeline without requiring production authentication infrastructure.
