+++
id = "ROO-CMD-KB-AI-CODING-STANDARDS-V1"
title = "AI Coding Standards & Prevention Guide"
context_type = "knowledge_base"
scope = "Comprehensive coding standards and anti-patterns for AI-generated code"
target_audience = ["roo-commander", "all-dev-modes"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-28"
tags = ["coding-standards", "ai-prevention", "typescript", "react", "nodejs", "patterns", "anti-patterns", "quality-gates"]
related_context = [
    ".ruru/context/stack_profile.json",
    ".roo/rules/01-standard-toml-md-format.md",
    ".roo/rules/04-mdtm-workflow-initiation.md"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Must be consulted before any code generation or development task"
+++

# Complete AI Coding Standards & Prevention Guide

**MANDATORY CONSULTATION:** This document MUST be referenced before any code generation, development task delegation, or architectural decision. All specialist modes MUST adhere to these standards.

## Table of Contents

1. [Prevention-First Approach](#prevention-first-approach)
2. [Core Development Rules](#core-development-rules)
3. [Architecture Standards](#architecture-standards)
4. [Quality Gates & Validation](#quality-gates--validation)
5. [Modern Tools Integration](#modern-tools-integration)
6. [Session Management](#session-management)
7. [Context Templates](#context-templates)
8. [Anti-Patterns Reference](#anti-patterns-reference)

---

## Prevention-First Approach

### The Golden Rule
**Never assume AI knows your patterns. Always provide complete context upfront.**

### Core Prevention Strategy

1. **Context First:** Load all patterns before any code generation
2. **Constraints Over Corrections:** Define what NOT to do before defining what to do
3. **Template-Driven:** Use proven patterns as templates
4. **Incremental Validation:** Validate each piece before building on it
5. **Documentation-Driven:** Maintain living documentation of all patterns

---

## Core Development Rules

### Promise & Async Operations (CRITICAL)

```typescript
// ✅ ALWAYS DO
const service = await getService();
const result = service.getData();

const data = await asyncOperation();
if (data.success) {
  processData(data.value);
}

// ❌ NEVER DO
const result = getService().getData(); // Accessing Promise property
const data = asyncOperation().value;   // Missing await
```

**AI Generation Rule:**
> "CRITICAL: Every async operation must be properly awaited. Never access properties on Promise objects. Always use try-catch for async operations."

### Constructor & Dependency Injection

```typescript
// ✅ CORRECT PATTERN
class UserService extends BaseService {
  constructor(
    private config: IConfig,
    private repository: IUserRepository,
    private logger: ILogger
  ) {
    super(config);
  }
}

// ❌ INCORRECT PATTERN
class UserService extends BaseService {
  constructor() { // Missing dependencies
    super(); // Missing config
  }
}
```

**AI Generation Rule:**
> "MANDATORY: All services must receive dependencies through constructor. Never create services without required parameters. Always inject dependencies, never instantiate them internally."

### Singleton Pattern Implementation

```typescript
// ✅ CORRECT SINGLETON
class CacheService {
  private static instance: CacheService;
  
  private constructor(private config: ICacheConfig) {}
  
  static getInstance(config: ICacheConfig): CacheService {
    if (!this.instance) {
      this.instance = new CacheService(config);
    }
    return this.instance;
  }
}

// ❌ INCORRECT SINGLETON
const cache = new CacheService(); // Accessing protected constructor
```

**AI Generation Rule:**
> "SINGLETON RULE: Use static getInstance() method with required parameters. Constructor must be private/protected. Never use 'new' on singleton classes."

### Error Handling Standards

```typescript
// ✅ PROPER ERROR HANDLING
type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

async function processUser(id: string): Promise<Result<User, string>> {
  try {
    const user = await userRepository.findById(id);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, data: user };
  } catch (error) {
    logger.error('Failed to process user', { id, error });
    return { success: false, error: 'Processing failed' };
  }
}

// ❌ POOR ERROR HANDLING
async function processUser(id: string): Promise<User> {
  const user = await userRepository.findById(id); // No error handling
  return user; // Could throw
}
```

**AI Generation Rule:**
> "ERROR HANDLING: All functions that can fail must return Result<T, E> type. Use try-catch for all async operations. Never throw exceptions in business logic. Always log errors with context."

### Type Safety Requirements

```typescript
// ✅ STRICT TYPING
interface CreateUserRequest {
  name: string;
  email: string;
  age: number;
}

function createUser(request: CreateUserRequest): Promise<Result<User, ValidationError>> {
  // Implementation with proper types
}

// ❌ LOOSE TYPING
function createUser(request: any): Promise<any> { // Never use 'any'
  // Implementation
}
```

**AI Generation Rule:**
> "TYPE SAFETY: Use strict TypeScript configuration. Define interfaces before implementation. Never use 'any' type. Use union types and type guards for runtime validation."

---

## Architecture Standards

### Layered Architecture Pattern

```typescript
// Controller Layer
class UserController {
  constructor(private userService: IUserService) {}
  
  async createUser(req: Request): Promise<Response> {
    const result = await this.userService.create(req.body);
    if (result.success) {
      return { status: 201, data: result.data };
    }
    return { status: 400, error: result.error };
  }
}

// Service Layer (Business Logic)
class UserService implements IUserService {
  constructor(
    private repository: IUserRepository,
    private validator: IValidator,
    private emailService: IEmailService
  ) {}
  
  async create(userData: CreateUserRequest): Promise<Result<User, string>> {
    const validation = await this.validator.validate(userData);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    
    const user = await this.repository.save(new User(userData));
    await this.emailService.sendWelcomeEmail(user.email);
    
    return { success: true, data: user };
  }
}

// Repository Layer (Data Access)
class UserRepository implements IUserRepository {
  constructor(private database: IDatabase) {}
  
  async save(user: User): Promise<User> {
    return await this.database.users.create(user);
  }
}
```

**AI Generation Rule:**
> "ARCHITECTURE: Follow Controller -> Service -> Repository pattern. Controllers handle HTTP, Services contain business logic, Repositories handle data. Never mix concerns between layers."

### Command/Query Separation

```typescript
// Commands (Modify State)
interface ICreateUserCommand {
  execute(userData: CreateUserData): Promise<Result<User, Error>>;
}

// Queries (Read State)
interface IGetUserQuery {
  byId(id: string): Promise<Result<User, Error>>;
  byEmail(email: string): Promise<Result<User, Error>>;
}

class UserService {
  constructor(
    private createCommand: ICreateUserCommand,
    private getUserQuery: IGetUserQuery
  ) {}
  
  async createUser(data: CreateUserData): Promise<Result<User, Error>> {
    return await this.createCommand.execute(data);
  }
  
  async getUserById(id: string): Promise<Result<User, Error>> {
    return await this.getUserQuery.byId(id);
  }
}
```

### Domain-Driven Design Patterns

```typescript
// Value Objects
class Email {
  private constructor(private value: string) {}
  
  static create(email: string): Result<Email, string> {
    if (!email.includes('@')) {
      return { success: false, error: 'Invalid email format' };
    }
    return { success: true, data: new Email(email) };
  }
  
  toString(): string {
    return this.value;
  }
}

// Entities
class User {
  private constructor(
    private id: UserId,
    private email: Email,
    private name: string,
    private createdAt: Date
  ) {}
  
  static create(userData: CreateUserData): Result<User, string> {
    const emailResult = Email.create(userData.email);
    if (!emailResult.success) {
      return emailResult;
    }
    
    return {
      success: true,
      data: new User(
        UserId.generate(),
        emailResult.data,
        userData.name,
        new Date()
      )
    };
  }
}
```

---

## Quality Gates & Validation

### Pre-Generation Validation

```bash
#!/bin/bash
# validate-before-generation.sh
echo "🔍 Pre-generation validation..."

# Check if context files exist
if [ ! -f ".ruru/context/stack_profile.json" ]; then
  echo "❌ Missing stack profile"
  exit 1
fi

if [ ! -f ".ruru/modes/roo-commander/kb/ai-coding-standards.md" ]; then
  echo "❌ Missing coding standards"
  exit 1
fi

echo "✅ Context files ready for AI generation"
```

### Post-Generation Validation

```typescript
// post-generation-validator.ts
interface ValidationRule {
  name: string;
  check: (code: string) => boolean;
  message: string;
}

const validationRules: ValidationRule[] = [
  {
    name: 'Promise Property Access',
    check: (code) => !code.includes('Promise.') && !code.match(/\w+\(\)\.property/),
    message: 'Found Promise property access without await'
  },
  {
    name: 'Constructor Parameters',
    check: (code) => !code.match(/constructor\(\s*\)/),
    message: 'Found constructor without required parameters'
  },
  {
    name: 'Error Handling',
    check: (code) => code.includes('try') || code.includes('Result<'),
    message: 'Missing error handling patterns'
  },
  {
    name: 'Type Safety',
    check: (code) => !code.includes(': any'),
    message: 'Found usage of any type'
  }
];

function validateGeneratedCode(code: string): ValidationResult {
  const failures = validationRules
    .filter(rule => !rule.check(code))
    .map(rule => rule.message);
    
  return {
    valid: failures.length === 0,
    errors: failures
  };
}
```

### ESLint Configuration for AI Code

```javascript
// .eslintrc.js - AI-specific rules
module.exports = {
  extends: [
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking'
  ],
  rules: {
    // Promise handling
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    
    // Type safety
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    
    // Constructor patterns
    '@typescript-eslint/no-empty-constructor': 'error',
    
    // Error handling
    'no-throw-literal': 'error',
    '@typescript-eslint/no-throw-literal': 'error',
    
    // Architecture
    'no-console': 'warn', // Use proper logging
    'prefer-const': 'error',
    'no-var': 'error'
  }
};
```

---

## Modern Tools Integration

### Model Context Protocol (MCP) Setup

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path/to/your/project"]
    },
    "git": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-git", "/path/to/your/project"]
    },
    "database": {
      "command": "mcp-database-server",
      "args": ["--connection-string", "${DATABASE_URL}"]
    }
  }
}
```

### Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged && npm run validate-ai-patterns"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "npm run type-check",
      "npm run test -- --passWithNoTests",
      "git add"
    ]
  },
  "scripts": {
    "validate-ai-patterns": "./scripts/validate-ai-code.sh"
  }
}
```

### GitHub Actions for AI Code Quality

```yaml
# .github/workflows/ai-code-quality.yml
name: AI Code Quality Check
on: 
  pull_request:
    paths: ['src/**/*.ts', 'src/**/*.tsx']

jobs:
  validate-ai-code:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check for AI coding anti-patterns
        run: |
          echo "🔍 Checking for Promise property access..."
          if grep -r "\.then(" src/ | grep -v "\.then("; then
            echo "❌ Found Promise property access without proper await"
            exit 1
          fi
          
          echo "🔍 Checking for missing constructor parameters..."
          if grep -r "constructor()" src/; then
            echo "❌ Found constructors without required parameters"
            exit 1
          fi
          
          echo "🔍 Checking for any type usage..."
          if grep -r ": any" src/; then
            echo "❌ Found usage of 'any' type"
            exit 1
          fi
          
          echo "✅ All AI coding patterns validated"
      
      - name: TypeScript Check
        run: npm run type-check
      
      - name: Lint Check
        run: npm run lint
      
      - name: Test Coverage
        run: npm run test -- --coverage --passWithNoTests
```

---

## Session Management

### Context Loading Protocol

**Start Every AI Session With:**

1. **Load Base Context**
   ```
   "Load the complete context from .ruru/modes/roo-commander/kb/ai-coding-standards.md, including:
   - All base classes and interfaces
   - Architecture patterns and constraints
   - Error handling standards
   - Type safety requirements
   - Anti-patterns to avoid"
   ```

2. **Confirm Understanding**
   ```
   "Before generating any code, confirm you understand:
   - Our singleton pattern using getInstance()
   - Promise handling with proper await
   - Constructor dependency injection pattern
   - Result<T, E> error handling approach
   - Layered architecture requirements"
   ```

3. **Set Generation Constraints**
   ```
   "Generate code following these constraints:
   - Never access Promise properties without await
   - Always include required constructor parameters
   - Use Result<T, E> for error handling
   - Follow established interface patterns exactly
   - Include comprehensive error handling"
   ```

### Incremental Development Workflow

**Development Session Structure:**

#### Phase 1: Interface Definition
1. Define interfaces first
2. Validate against existing patterns
3. Get approval before implementation

#### Phase 2: Base Implementation
1. Generate core class structure
2. Implement constructor with DI
3. Add basic methods with proper types

#### Phase 3: Business Logic
1. Add business logic methods
2. Include comprehensive error handling
3. Follow established patterns exactly

#### Phase 4: Integration
1. Add integration with existing services
2. Ensure proper async handling
3. Add logging and monitoring

#### Phase 5: Testing
1. Generate unit tests
2. Include integration tests
3. Test error scenarios

### Context Accumulation Strategy

**Building Context Throughout Session:**

1. **Start with Base Context**
   - Load project patterns
   - Reference architecture decisions

2. **Add Generated Components to Context**
   ```
   "Add this successfully generated UserService to our session context.
   Use it as a reference for generating similar services."
   ```

3. **Update Patterns as Needed**
   ```
   "Update our context with this new pattern:
   [new pattern definition]
   Use this pattern for all future similar components."
   ```

4. **Maintain Pattern Consistency**
   ```
   "Ensure all new code follows the patterns established in:
   - UserService (for service layer)
   - UserRepository (for data access)
   - UserController (for API layer)"
   ```

---

## Context Templates

### Pre-Development Context Template

```markdown
## Development Context Checklist

Before any code generation, ensure:

- [ ] Stack Profile loaded (`.ruru/context/stack_profile.json`)
- [ ] AI Coding Standards reviewed (this document)
- [ ] Project architecture patterns understood
- [ ] Error handling approach confirmed
- [ ] Type safety requirements clear
- [ ] Dependency injection patterns established
- [ ] Testing strategy defined

## Code Generation Constraints

MUST follow:
- Result<T, E> error handling
- Constructor dependency injection
- Proper async/await usage
- Strict TypeScript typing
- Layered architecture separation

MUST NOT:
- Access Promise properties without await
- Use empty constructors in services
- Use 'any' type
- Mix architectural concerns
- Throw exceptions in business logic
```

### Post-Development Validation Template

```markdown
## Code Review Checklist

Validate generated code for:

- [ ] No Promise property access without await
- [ ] All constructors have required parameters
- [ ] Error handling uses Result<T, E> pattern
- [ ] No usage of 'any' type
- [ ] Proper dependency injection
- [ ] Architectural layer separation
- [ ] Comprehensive error logging
- [ ] Type safety throughout
```

---

## Anti-Patterns Reference

### Critical Anti-Patterns to Avoid

1. **Promise Property Access**
   ```typescript
   // ❌ NEVER
   const result = asyncFunction().property;
   
   // ✅ ALWAYS
   const data = await asyncFunction();
   const result = data.property;
   ```

2. **Empty Constructors**
   ```typescript
   // ❌ NEVER
   class Service {
     constructor() {}
   }
   
   // ✅ ALWAYS
   class Service {
     constructor(private config: Config, private logger: Logger) {}
   }
   ```

3. **Any Type Usage**
   ```typescript
   // ❌ NEVER
   function process(data: any): any {}
   
   // ✅ ALWAYS
   function process(data: ProcessRequest): Result<ProcessResponse, Error> {}
   ```

4. **Exception Throwing in Business Logic**
   ```typescript
   // ❌ NEVER
   function validateUser(user: User): User {
     if (!user.email) throw new Error('Invalid email');
     return user;
   }
   
   // ✅ ALWAYS
   function validateUser(user: User): Result<User, string> {
     if (!user.email) return { success: false, error: 'Invalid email' };
     return { success: true, data: user };
   }
   ```

5. **Mixed Architectural Concerns**
   ```typescript
   // ❌ NEVER - Controller doing business logic
   class UserController {
     async create(req: Request) {
       const user = new User(req.body);
       await database.save(user); // Direct DB access
       await emailService.send(user.email); // Business logic
     }
   }
   
   // ✅ ALWAYS - Proper separation
   class UserController {
     constructor(private userService: UserService) {}
     
     async create(req: Request) {
       const result = await this.userService.create(req.body);
       return result.success ? { status: 201, data: result.data } : { status: 400, error: result.error };
     }
   }
   ```

---

## Enforcement Rules for RooCommander

### Mandatory Consultation Points

RooCommander MUST consult this document:

1. **Before any development task delegation**
2. **When creating MDTM tasks for code-related work**
3. **During architecture decision discussions**
4. **When reviewing specialist mode outputs**
5. **Before approving any code generation**

### Delegation Requirements

When delegating to development specialists, RooCommander MUST:

1. **Reference this KB article explicitly**
2. **Include relevant coding standards in task context**
3. **Specify validation requirements**
4. **Ensure error handling patterns are followed**
5. **Validate outputs against these standards**

### Quality Gate Integration

All code-related tasks MUST:

1. **Pass pre-generation validation**
2. **Follow established patterns exactly**
3. **Include comprehensive error handling**
4. **Maintain type safety throughout**
5. **Pass post-generation validation**

---

**END OF DOCUMENT**

*This document serves as the authoritative source for all AI coding standards within the RooCommander ecosystem. All development work must adhere to these guidelines without exception.*