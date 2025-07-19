+++
# --- Basic Metadata ---
id = "ADR-001-API-CONFIG-ARCH"
title = "ADR-001: API Configuration Architecture Standardization"
context_type = "adr"
scope = "Defines the standard architecture for API configuration management across the platform"
target_audience = ["all", "dev-*", "lead-*", "architect"]
granularity = "detailed"
status = "accepted"
last_updated = "2025-07-19"
tags = ["adr", "architecture", "api", "configuration", "singleton", "registry"]
related_context = [
    "src/config/apiConfig.ts",
    "src/services/apiGateway/apiClientFactory.ts",
    ".roo/rules/01-standard-toml-md-format.md"
]
template_schema_doc = ".ruru/templates/toml-md/07_adr.md"
relevance = "Critical: Establishes foundation for all API configuration management"

# --- ADR Specific Fields ---
decision_date = "2025-07-19"
decision_status = "accepted"
decision_makers = ["roo-commander", "infra-specialist"]
supersedes = []
superseded_by = []
+++

# ADR-001: API Configuration Architecture Standardization

## Status
**Accepted** - 2025-07-19

## Context

The material vision platform experienced a critical runtime error: `"Uncaught Error: API configuration not found for type: huggingface"`. Investigation revealed fundamental architectural inconsistencies in the API configuration system:

1. **Lookup Mechanism Mismatch**: ApiRegistry used `name` as primary key while ApiClientFactory expected `type` as lookup key
2. **Inconsistent Singleton Patterns**: Mixed implementation approaches across services
3. **Configuration Schema Duplication**: Multiple definitions of similar configuration types
4. **Factory Pattern Inconsistencies**: Different factory implementations with varying patterns

## Decision

We will standardize the API configuration architecture with the following principles:

### 1. Centralized Configuration Registry
- **Single Source of Truth**: `ApiRegistry` singleton manages all API configurations
- **Dual Lookup Support**: Support both name-based and type-based lookups
- **Type Safety**: Enforce TypeScript interfaces for all configurations

### 2. Standardized Singleton Pattern
```typescript
abstract class SingletonService {
  private static instances: Map<string, any> = new Map();
  
  protected static getInstance<T>(this: new() => T): T {
    const className = this.name;
    if (!SingletonService.instances.has(className)) {
      SingletonService.instances.set(className, new this());
    }
    return SingletonService.instances.get(className);
  }
}
```

### 3. Unified Configuration Interface
```typescript
interface BaseApiConfig {
  name: string;
  type: string;
  environment: 'development' | 'production' | 'test';
  enabled: boolean;
}
```

### 4. Factory Pattern Standardization
- Use consistent factory pattern for all API client creation
- Centralize client management through `ApiClientFactory`
- Implement proper error handling and validation

## Consequences

### Positive
- **Eliminates Runtime Errors**: Consistent lookup mechanisms prevent configuration not found errors
- **Improved Maintainability**: Single pattern for all API configurations
- **Type Safety**: Compile-time validation of configuration schemas
- **Testability**: Standardized patterns enable better unit testing
- **Developer Experience**: Clear, consistent APIs for configuration management

### Negative
- **Migration Effort**: Existing services need refactoring to follow new patterns
- **Initial Complexity**: More upfront design work required
- **Breaking Changes**: Some existing APIs may need modification

### Risks
- **Performance Impact**: Centralized registry could become bottleneck (mitigated by singleton pattern)
- **Memory Usage**: Singleton instances persist for application lifetime (acceptable trade-off)

## Implementation Plan

1. **Phase 1**: Implement standardized `ApiRegistry` with dual lookup support ✅
2. **Phase 2**: Refactor `ApiClientFactory` to use centralized registry ✅
3. **Phase 3**: Standardize singleton patterns across all services
4. **Phase 4**: Consolidate duplicate configuration interfaces
5. **Phase 5**: Implement comprehensive integration tests

## Compliance

All new API services MUST:
- Extend `BaseApiConfig` interface
- Register configurations through `ApiRegistry`
- Use standardized singleton pattern
- Support both name and type-based lookups
- Include comprehensive TypeScript types

## References

- [API Configuration Implementation](src/config/apiConfig.ts)
- [API Client Factory](src/services/apiGateway/apiClientFactory.ts)
- [TOML+MD Format Standard](.roo/rules/01-standard-toml-md-format.md)