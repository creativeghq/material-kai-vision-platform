# Utilities

General utility scripts for the Material Kai Vision Platform.

## Files

### Key Generation
- `generate-keys.ps1` - PowerShell script to generate API keys, workspace IDs, and secrets

### Debugging Tools
- `investigate-docs-regression.js` - Investigates documentation regression issues
- `error-handling-diagnostic.cjs` - Diagnostic tool for error handling

## Usage

```powershell
# Generate platform keys (PowerShell)
.\scripts\utilities\generate-keys.ps1
```

```bash
# Investigate documentation issues
node scripts/utilities/investigate-docs-regression.js

# Run error diagnostics
node scripts/utilities/error-handling-diagnostic.cjs
```

## Purpose

These utilities were created to:
1. Generate secure API keys and secrets for the platform
2. Debug documentation and deployment issues
3. Provide diagnostic tools for error analysis
4. Support platform maintenance and troubleshooting

## Key Generation Script

The `generate-keys.ps1` script generates:
- Material Kai API keys
- Workspace IDs
- Client credentials
- Webhook secrets
- Encryption keys

All generated keys follow the platform's security standards and naming conventions.
