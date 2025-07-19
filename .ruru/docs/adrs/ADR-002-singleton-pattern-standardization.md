+++
# --- Basic Metadata ---
id = "ADR-002-SINGLETON-PATTERN"
title = "ADR-002: Singleton Pattern Standardization"
context_type = "adr"
scope = "Standardizes singleton pattern implementation across all services"
target_audience = ["all", "dev-*", "lead-*"]
granularity = "detailed"
status = "accepted"
last_updated = "2025-07-19"
tags = ["adr", "architecture", "singleton", "design-pattern", "memory-management"]
related_context = [
    "src/config/apiConfig.ts",
    "src/services/ml/huggingFaceService.ts",
    "src/services/networkAccessControl.ts",
    ".ruru/docs/adrs/ADR-001-api-configuration-architecture.md"
]
template_schema_doc = ".ruru/templates/toml-md/07_adr.md"
relevance = "High: Ensures consistent service instantiation patterns"

# --- ADR Specific Fields ---
decision_date = "2025-07-19"
decision_status = "accepted"
decision_makers = ["roo-commander", "infra-specialist"]
supersedes = []
superseded_by = []
+++

# ADR-002: Singleton Pattern Standardization

## Status
**Accepted** - 2025-07-19

## Context

Analysis of the codebase revealed inconsistent singleton pattern implementations across services:

1. **Inconsistent Implementation**: Some services use proper singleton patterns while others don't
2. **Memory Management**: Multiple instances of the same service causing memory waste
3. **State Consistency**: Risk of state inconsistencies across service instances
4. **Naming Conventions**: Mixed approaches to getInstance() methods

Current inconsistencies:
- `ApiRegistry`: Proper singleton with `getInstance()`
- `HuggingFaceService`: Proper singleton implementation
- `NetworkAccessControl`: Proper singleton pattern
- `ApiClientFactory`: Uses singleton but inconsistent class naming
- Many services: Missing singleton pattern entirely

## Decision

We will standardize singleton pattern implementation across all stateful services:

### 1. Abstract Singleton Base Class
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
  
  // Prevent direct instantiation
  protected constructor() {}
}
```

### 2. Service Classification
**Singleton Required:**
- Configuration registries (ApiRegistry)
- Network access controls
- Cost optimizers
- Cache managers
- Connection pools

**Singleton Optional:**
- Stateless utility services
- Pure computation services
- One-time use services

### 3. Implementation Standards
```typescript
export class ExampleService extends SingletonService {
  private static _instance: ExampleService;
  
  public static getInstance(): ExampleService {
    return super.getInstance.call(this);
  }
  
  private constructor() {
    super();
    // Initialization logic
  }
}

// Export singleton instance
export const exampleService = ExampleService.getInstance();
```

### 4. Naming Conventions
- Class names: PascalCase (e.g., `ApiRegistry`)
- getInstance method: Always `getInstance()`
- Exported instance: camelCase (e.g., `apiRegistry`)

## Consequences

### Positive
- **Memory Efficiency**: Single instance per service type
- **State Consistency**: Guaranteed single source of truth
- **Predictable Behavior**: Consistent instantiation patterns
- **Testing**: Easier to mock and test singleton services
- **Performance**: Reduced object creation overhead

### Negative
- **Testing Complexity**: Singleton state can persist between tests
- **Tight Coupling**: Services become globally accessible
- **Concurrency**: Potential thread safety issues (mitigated by Node.js single-threaded nature)

### Risks
- **Memory Leaks**: Singleton instances persist for application lifetime
- **Hidden Dependencies**: Services may become implicitly dependent on singletons

## Implementation Plan

1. **Phase 1**: Create abstract `SingletonService` base class
2. **Phase 2**: Refactor existing singleton services to use standard pattern
3. **Phase 3**: Identify and convert services that should be singletons
4. **Phase 4**: Update all service exports to use consistent naming
5. **Phase 5**: Add ESLint rules to enforce singleton patterns

## Compliance

All singleton services MUST:
- Extend `SingletonService` base class
- Implement private constructor
- Provide static `getInstance()` method
- Export singleton instance with camelCase naming
- Include proper TypeScript typing

## Testing Strategy

- Use dependency injection for testing
- Implement singleton reset methods for test isolation
- Mock singleton instances at module level
- Test singleton behavior explicitly

## References

- [Singleton Pattern Documentation](https://refactoring.guru/design-patterns/singleton)
- [TypeScript Singleton Implementation](https://typescript-eslint.io/rules/no-misused-new/)