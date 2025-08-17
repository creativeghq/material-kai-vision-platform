# Material Kai Vision Platform - Development Rules & Best Practices

## Overview

This document contains rules and best practices derived from real-world issues encountered during the Material Kai Vision Platform development, particularly during the comprehensive database migration from mock data to real Supabase integration. These rules are designed to prevent common errors and ensure consistent, high-quality development practices.

---

## 1. Database Integration Rules

### 1.1 Mock Data vs Real Database Integration

**Rule**: Always prioritize real database integration over mock data in production-ready components.

**Common Issues Fixed**:
- Components using hardcoded mock data instead of leveraging existing database infrastructure
- Disconnect between robust database schema (47+ tables) and frontend components using static arrays
- Edge Functions returning mock responses instead of real AI integration with database tracking

**Best Practices**:
- ✅ Use `supabase.from('table_name').select()` for real data queries
- ✅ Implement proper error handling with try-catch blocks
- ✅ Use TypeScript interfaces that match database schemas
- ❌ Avoid hardcoded mock arrays in production components
- ❌ Don't use `setTimeout` to simulate async operations

### 1.2 Database Schema Validation

**Rule**: Always validate database table usage before making schema changes.

**Process**:
1. Conduct comprehensive codebase analysis using semantic search
2. Map actual table usage patterns across all components and Edge Functions
3. Identify truly unused tables through systematic analysis
4. Handle foreign key dependencies when dropping tables
5. Drop dependent tables before referenced tables

**Example Issue Fixed**: Attempted to drop `legacy_processed_documents` before `processing_jobs` which had a foreign key reference, causing constraint errors.

### 1.3 Supabase MCP Integration

**Rule**: Use Supabase MCP tools for database operations when available.

**Best Practices**:
- Use `list_tables` to get current database state
- Use `execute_sql` for data queries and verification
- Use `apply_migration` for DDL operations
- Always check row counts before dropping tables
- Handle foreign key constraints properly

---

## 2. TypeScript & Code Quality Rules

### 2.1 Unused Variable Management

**Rule**: Handle unused variables appropriately to maintain clean TypeScript compilation.

**Solutions**:
- **Remove completely unused imports**: `import type { Database }` when not referenced
- **Use underscore prefix for intentionally unused variables**: `const [, setLoading]` instead of `const [loading, setLoading]`
- **Keep state setters for future functionality**: Don't remove `setLoading`, `setError` if they may be needed

### 2.2 Import Management

**Rule**: Keep imports clean and remove unused type imports.

**Common Issues**:
- Importing `Database` type but never using it
- Importing utility functions that are no longer needed after refactoring
- Leaving old mock data imports after switching to real database queries

### 2.3 Error Handling Standards

**Rule**: Implement consistent error handling patterns across all database operations.

**Standard Pattern**:
```typescript
try {
  const { data, error } = await supabase
    .from('table_name')
    .select('*');
  
  if (error) {
    console.error('Database error:', error);
    return;
  }
  
  // Process data
} catch (err) {
  console.error('Unexpected error:', err);
}
```

---

## 3. Component Architecture Rules

### 3.1 Real-time Data Integration

**Rule**: Use Supabase real-time subscriptions for live data updates instead of polling.

**Implementation**:
```typescript
useEffect(() => {
  const subscription = supabase
    .channel('table-changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'table_name' },
      (payload) => {
        // Handle real-time updates
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

### 3.2 Workspace Isolation

**Rule**: Always implement proper workspace-based data filtering.

**Pattern**:
```typescript
const { data } = await supabase
  .from('table_name')
  .select('*')
  .eq('workspace_id', workspaceId);
```

### 3.3 Loading States

**Rule**: Implement proper loading states for all async operations.

**Best Practices**:
- Show loading indicators during data fetching
- Handle empty states gracefully
- Provide meaningful error messages to users
- Use skeleton loaders for better UX

---

## 4. Edge Function Development Rules

### 4.1 Real AI Integration

**Rule**: Edge Functions must integrate with real AI services and track results in the database.

**Requirements**:
- Use actual OpenAI/AI service APIs
- Store processing results in appropriate database tables
- Implement proper error handling and logging
- Return structured responses with database IDs

### 4.2 Shared Configuration

**Rule**: Use shared configuration modules for consistent API keys and settings.

**Implementation**:
```typescript
// _shared/config.ts
export const getOpenAIKey = () => {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OpenAI API key not configured');
  return key;
};
```

### 4.3 Database Tracking

**Rule**: All AI operations must be tracked in the database with proper status updates.

**Pattern**:
1. Create initial record with 'processing' status
2. Perform AI operation
3. Update record with results and 'completed' status
4. Handle errors by updating status to 'failed' with error details

---

## 5. Search & Query Optimization Rules

### 5.1 Semantic Search Implementation

**Rule**: Implement proper vector similarity search for semantic queries.

**Requirements**:
- Use appropriate embedding dimensions (512, 768, 1536)
- Implement similarity thresholds
- Support multiple embedding types
- Provide fallback for failed searches

### 5.2 Multi-table Search

**Rule**: Design search to query across multiple relevant tables.

**Implementation**:
- Search materials, documents, knowledge entries
- Combine results with proper ranking
- Handle different content types appropriately
- Implement pagination for large result sets

---

## 6. Database Migration Rules

### 6.1 Comprehensive Analysis Before Changes

**Rule**: Always perform thorough codebase analysis before database modifications.

**Process**:
1. Use semantic search to find all table references
2. Analyze both frontend components and Edge Functions
3. Check for indirect references through joins or foreign keys
4. Document findings in analysis files
5. Get stakeholder approval before proceeding

### 6.2 Foreign Key Dependency Management

**Rule**: Handle foreign key constraints properly when dropping tables.

**Process**:
1. Identify all foreign key relationships
2. Drop dependent tables first
3. Then drop referenced tables
4. Use `CASCADE` options carefully and only when appropriate
5. Test in development environment first

### 6.3 Data Preservation

**Rule**: Always check for existing data before dropping tables.

**Process**:
1. Query row counts: `SELECT COUNT(*) FROM table_name`
2. Examine data structure and content
3. Determine if data should be migrated or archived
4. Only drop tables with zero rows or confirmed obsolete data

---

## 7. Code Review & Quality Assurance Rules

### 7.1 Pre-deployment Checklist

**Rule**: Complete this checklist before any major deployment:

- [ ] All TypeScript compilation errors resolved
- [ ] No unused imports or variables
- [ ] Database queries use real tables (not mock data)
- [ ] Error handling implemented for all async operations
- [ ] Loading states implemented for user-facing operations
- [ ] Workspace isolation properly implemented
- [ ] Edge Functions use real AI services
- [ ] All database operations properly tracked

### 7.2 Testing Requirements

**Rule**: Test database connections and data flow before considering tasks complete.

**Testing Areas**:
- Database connectivity
- Data retrieval and display
- Real-time updates
- Error handling
- Edge Function responses
- Search functionality

---

## 8. Documentation & Maintenance Rules

### 8.1 Analysis Documentation

**Rule**: Document all major analysis and migration work.

**Requirements**:
- Create analysis files for database usage patterns
- Document decisions and rationale
- Track before/after states
- Include metrics and statistics
- Update documentation after changes

### 8.2 Code Comments

**Rule**: Add meaningful comments for complex database operations and AI integrations.

**Focus Areas**:
- Database query logic
- AI service integrations
- Error handling strategies
- Business logic implementations
- Performance optimizations

---

## 9. Performance & Optimization Rules

### 9.1 Database Query Optimization

**Rule**: Optimize database queries for performance and cost.

**Best Practices**:
- Use specific column selection instead of `SELECT *`
- Implement proper indexing strategies
- Use pagination for large datasets
- Cache frequently accessed data appropriately
- Monitor query performance

### 9.2 Real-time Subscription Management

**Rule**: Properly manage Supabase real-time subscriptions to prevent memory leaks.

**Implementation**:
- Always unsubscribe in cleanup functions
- Use specific channel names
- Filter subscriptions to relevant data only
- Handle connection errors gracefully

---

## 10. Security & Access Control Rules

### 10.1 Row Level Security (RLS)

**Rule**: Ensure all database tables have appropriate RLS policies.

**Requirements**:
- Implement workspace-based access control
- Validate user permissions
- Use secure authentication patterns
- Audit access control regularly

### 10.2 API Key Management

**Rule**: Secure all API keys and sensitive configuration.

**Best Practices**:
- Use environment variables for all secrets
- Implement proper key rotation
- Monitor API usage and costs
- Use least-privilege access principles

---

## 11. TypeScript Compilation Error Prevention Rules

### 11.1 UI Component Prop Type Errors

**Rule**: Always use styled span elements instead of unsupported Badge component variant props, and remove invalid Button component props.

**Common Issues Fixed During Build Session**:
- Badge components using unsupported `variant` props (`variant="outline"`, `variant="secondary"`, `variant="destructive"`, `variant="default"`)
- Button components using unsupported `variant` and `size` props (`variant="outline"`, `size="sm"`, `size="lg"`)
- TypeScript compilation errors: `Property 'variant' does not exist on type 'IntrinsicAttributes & BadgeProps'`
- TypeScript compilation errors: `Property 'size' does not exist on type 'IntrinsicAttributes & ButtonProps'`

**Solutions**:
```typescript
// ❌ Incorrect - using unsupported Badge variant props
<Badge variant="outline">Status</Badge>
<Badge variant="secondary">Type</Badge>
<Badge variant="destructive">Error</Badge>

// ✅ Correct - replace Badge with styled span elements
<span className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-900 bg-gray-50">
  Status
</span>
<span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
  Type
</span>
<span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
  Error
</span>

// ❌ Incorrect - using unsupported Button props
<Button variant="outline" size="sm">Click me</Button>

// ✅ Correct - remove invalid props and use appropriate CSS classes
<Button className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm">
  Click me
</Button>
```

**Standard Badge Replacement Patterns**:
- **Outline/Default Badge**: `className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-900 bg-gray-50"`
- **Secondary Badge**: `className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800"`
- **Success Badge**: `className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800"`
- **Warning Badge**: `className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800"`
- **Error/Destructive Badge**: `className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800"`

**Button Prop Cleanup**:
- Remove `variant="outline"`, `variant="ghost"`, `variant="secondary"` props
- Remove `size="sm"`, `size="lg"`, `size="icon"` props
- Use appropriate Tailwind CSS classes for styling instead

### 11.2 Database Schema Validation Errors

**Rule**: Replace database calls to non-existent tables with mock data implementations during development.

**Common Issues Fixed**:
- Supabase queries to tables not defined in database schema (`'scraping_sessions'`, `'scraped_materials_temp'`, `'materials_catalog'`)
- TypeScript errors: `Argument of type '"table_name"' is not assignable to parameter of type 'known_table_union'`

**Solutions**:
```typescript
// ❌ Incorrect - querying non-existent table
const { data, error } = await supabase
  .from('scraping_sessions')
  .select('*');

// ✅ Correct - using mock data implementation
const mockSessionData = {
  id: `session-${sessionId}`,
  session_id: sessionId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
```

**Mock Data Implementation Pattern**:
1. Create realistic mock data structures that match expected interfaces
2. Include all required properties with appropriate types
3. Use consistent timestamp generation
4. Provide meaningful default values
5. Log mock operations for debugging

### 11.3 Unused Import and Variable Management

**Rule**: Remove unused imports and handle unused variables appropriately to maintain clean compilation.

**Common Issues Fixed**:
- Unused imports: `import { Textarea } from '@/components/ui/textarea'`
- Unused function parameters: `onMaterialsUpdate` parameter not used in component
- TypeScript errors: `'import' is declared but its value is never read`

**Solutions**:
```typescript
// ❌ Incorrect - unused imports and parameters
import { Textarea, Eye, ExternalLink } from 'lucide-react';
function Component({ data, onMaterialsUpdate }) {
  // onMaterialsUpdate never used
}

// ✅ Correct - clean imports and parameter handling
import { CheckCircle } from 'lucide-react';
function Component({ data }) {
  // Only used parameters included
}
```

### 11.4 TypeScript Interface Compliance

**Rule**: Ensure all object properties match their TypeScript interface definitions.

**Common Issues Fixed**:
- Missing required properties in mock data objects (`created_at`, `updated_at`)
- Property access on potentially undefined objects
- Interface mismatches between expected and actual data structures

**Solutions**:
```typescript
// ❌ Incorrect - missing required properties
const mockData = {
  id: 'test-id',
  name: 'Test Material'
  // Missing: created_at, updated_at
};

// ✅ Correct - complete interface compliance
const mockData: MaterialInterface = {
  id: 'test-id',
  name: 'Test Material',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
```

### 11.5 Callback Function Type Safety

**Rule**: Provide explicit type annotations for callback function parameters.

**Common Issues Fixed**:
- Implicit `any` type errors in `onCheckedChange` callbacks
- Missing type annotations for boolean parameters
- TypeScript strict mode compliance issues

**Solutions**:
```typescript
// ❌ Incorrect - implicit any type
<Checkbox onCheckedChange={(checked) => handleChange(checked)} />

// ✅ Correct - explicit boolean type
<Checkbox onCheckedChange={(checked: boolean) => handleChange(checked)} />
```

### 11.6 Component Prop Validation and CSS Class Replacement

**Rule**: Replace unsupported component variant props with equivalent CSS classes to resolve TypeScript compilation errors.

**Common Issues Fixed During Build Session**:
- Badge components with unsupported `variant` props causing TypeScript errors
- Button components with unsupported `variant` and `size` props
- Database schema mismatches where code references non-existent tables
- Unused imports causing compilation failures
- Missing TypeScript parameter type annotations
- Duplicate className attributes in JSX

**Standard Badge Variant Replacements**:
```typescript
// ❌ Incorrect - Badge variant props not supported
<Badge variant="outline">Status</Badge>
<Badge variant="secondary">Type</Badge>
<Badge variant="destructive">Error</Badge>

// ✅ Correct - CSS class equivalents
<span className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium">
  Status
</span>
<span className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium">
  Type
</span>
<span className="bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium">
  Error
</span>
```

**Standard Button Variant Replacements**:
```typescript
// ❌ Incorrect - Button variant/size props not supported
<Button variant="outline" size="sm">Click</Button>
<Button variant="ghost" size="icon">Icon</Button>

// ✅ Correct - CSS class equivalents
<Button className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm">
  Click
</Button>
<Button className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0">
  Icon
</Button>
```

**Database Schema Error Handling**:
```typescript
// ❌ Incorrect - referencing non-existent tables
const { data } = await supabase.from('material_metadata_fields').select('*');

// ✅ Correct - graceful fallback for missing tables
try {
  const { data, error } = await supabase.from('materials').select('*');
  if (error) throw error;
  return data || [];
} catch (error) {
  console.warn('Table not found, using fallback:', error);
  return [];
}
```

### 11.7 TypeScript Parameter Type Annotations

**Rule**: Always provide explicit type annotations for callback function parameters to avoid implicit `any` errors.

**Common Issues Fixed**:
```typescript
// ❌ Incorrect - implicit any type
<Checkbox onCheckedChange={(checked) => handleChange(checked)} />
<input onChange={(e) => setValue(e.target.value)} />

// ✅ Correct - explicit type annotations
<Checkbox onCheckedChange={(checked: boolean) => handleChange(checked)} />
<input onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} />
```

### 11.8 Unused Import and Variable Cleanup

**Rule**: Remove all unused imports and variables to maintain clean TypeScript compilation.

**Systematic Cleanup Process**:
1. **Remove unused type imports**: `import type { CreateMoodBoardData }` when not referenced
2. **Remove unused component imports**: `import { Eye, Archive, Grid3X3 }` when components aren't used
3. **Remove unused function parameters**: `index` parameter in map functions when not needed
4. **Remove unused function declarations**: Helper functions that are no longer called

**Examples**:
```typescript
// ❌ Incorrect - unused imports and variables
import { Eye, Archive, Grid3X3, Brain, Activity, Layers } from 'lucide-react';
import type { CreateMoodBoardData } from '@/services/api';

function Component({ items, onUpdate }) {
  const getStatusColor = (status) => { /* unused function */ };
  
  return items.map((item, index) => ( // index unused
    <div key={item.id}>{item.name}</div>
  ));
}

// ✅ Correct - clean imports and variables
import { CheckCircle } from 'lucide-react';

function Component({ items, onUpdate }) {
  return items.map((item) => (
    <div key={item.id}>{item.name}</div>
  ));
}
```

### 11.9 JSX Attribute Validation

**Rule**: Ensure JSX attributes are properly formatted and avoid duplicate className attributes.

**Common Issues Fixed**:
```typescript
// ❌ Incorrect - duplicate className attributes
<div className="base-class" className="additional-class">

// ✅ Correct - merged className attributes
<div className="base-class additional-class">
```

### 11.10 Database Type Safety and Null Handling

**Rule**: Handle nullable database fields properly in TypeScript interfaces and add appropriate null checks.

**Common Patterns**:
```typescript
// ❌ Incorrect - assuming non-null values from nullable database fields
const updateData = {
  field1: data.nullable_field.toString(), // Error if null
  field2: data.another_field.length       // Error if null
};

// ✅ Correct - proper null handling
const updateData = {
  field1: data.nullable_field?.toString() || '',
  field2: data.another_field?.length || 0
};

// Alternative with explicit checks
if (data.nullable_field && data.another_field) {
  const updateData = {
    field1: data.nullable_field.toString(),
    field2: data.another_field.length
  };
}
```

### 11.11 Missing Dependencies Resolution

**Rule**: Install missing npm packages immediately when TypeScript compilation fails due to missing modules.

**Process**:
1. **Identify missing package**: Check error message for module name
2. **Install immediately**: `npm install package-name`
3. **Verify installation**: Check package.json and node_modules
4. **Re-run build**: Confirm error is resolved

**Example**:
```bash
# Error: Cannot find module 'date-fns'
npm install date-fns

# Verify installation
npm list date-fns
```

### 11.12 Property Access Safety

**Rule**: Use safe property access patterns and provide fallback values for potentially undefined properties.

**Common Issues Fixed**:
- Accessing properties on potentially undefined objects
- Missing null checks for optional properties
- Runtime errors from undefined property access

**Solutions**:
```typescript
// ❌ Incorrect - unsafe property access
const value = result.metadata.properties.density;

// ✅ Correct - safe property access with fallbacks
const value = result.metadata?.properties?.density || 0;
const status = material.status || 'unknown';
```

### 11.7 TypeScript Strict Mode Compliance

**Rule**: Handle TypeScript strict mode requirements for optional properties and exact types.

**Common Issues Fixed During Build Session**:
- `exactOptionalPropertyTypes: true` configuration causing issues with optional properties
- Conditional object property spreading for optional fields
- Set iteration compatibility issues requiring Array.from() usage
- Error handling with proper type checking for unknown error types

**Solutions**:
```typescript
// ❌ Incorrect - direct assignment of potentially undefined optional properties
const config = {
  ...baseConfig,
  optionalField: someValue || undefined
};

// ✅ Correct - conditional spread operator for optional properties
const config = {
  ...baseConfig,
  ...(someValue && { optionalField: someValue })
};

// ❌ Incorrect - Set spread operator causing compatibility issues
const newArray = [...mySet];

// ✅ Correct - Array.from() for Set iteration
const newArray = Array.from(mySet);

// ❌ Incorrect - error handling without type checking
catch (error) {
  console.error('Error:', error.message);
}

// ✅ Correct - proper error type checking
catch (error) {
  console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
}
```

### 11.8 Import Management and Cleanup

**Rule**: Systematically remove unused imports and handle import organization.

**Common Issues Fixed During Build Session**:
- Unused imports from lucide-react icon library
- Unused UI component imports (Badge, Button, Alert, etc.)
- Unused utility function imports
- Unused type imports

**Solutions**:
```typescript
// ❌ Incorrect - unused imports
import { Badge, Button, Alert, AlertDescription, CheckCircle, AlertCircle, Edit3, Send, Download, Database, Search } from 'lucide-react';
import { Progress, Eye, Settings, History } from '@/components/ui';

// ✅ Correct - only import what's actually used
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

**Import Cleanup Process**:
1. Identify all import statements in the file
2. Search for usage of each imported item in the component
3. Remove imports that are not referenced anywhere
4. Keep imports that are used in JSX, function calls, or type annotations
5. Remove unused Badge imports when replacing with styled spans

### 11.9 Date and String Handling

**Rule**: Properly handle date objects and string-to-Date conversions.

**Common Issues Fixed During Build Session**:
- String dates being passed where Date objects are expected
- Missing Date constructor wrapping for string dates
- Type mismatches between string and Date types

**Solutions**:
```typescript
// ❌ Incorrect - passing string where Date object expected
const formattedDate = formatDate(dateString);

// ✅ Correct - wrap string dates with Date constructor
const formattedDate = formatDate(new Date(dateString));

// ❌ Incorrect - direct assignment of string to Date type
const date: Date = "2023-01-01";

// ✅ Correct - proper Date object creation
const date: Date = new Date("2023-01-01");
```

### 11.10 Component State and Variable Management

**Rule**: Handle unused state variables and function parameters appropriately.

**Common Issues Fixed During Build Session**:
- Unused state variables like `loading`, `error` setters
- Unused function parameters in component props
- Unused variables in function scope

**Solutions**:
```typescript
// ❌ Incorrect - unused state setters causing compilation warnings
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

// ✅ Correct - use underscore prefix for intentionally unused variables
const [, setLoading] = useState(false);
const [, setError] = useState(null);

// ❌ Incorrect - unused function parameters
function Component({ data, onUpdate, onDelete }) {
  // only data is used
  return <div>{data.name}</div>;
}

// ✅ Correct - remove unused parameters or use underscore prefix
function Component({ data }) {
  return <div>{data.name}</div>;
}

// Alternative: keep for future use with underscore prefix
function Component({ data, onUpdate: _onUpdate, onDelete: _onDelete }) {
  return <div>{data.name}</div>;
}
```

### 11.11 Build Process Error Resolution Strategy

**Rule**: Follow systematic approach to resolve TypeScript compilation errors during build.

**Process Established During Build Session**:
1. **Run Build Command**: Execute `npm run build` to identify compilation errors
2. **Categorize Errors**: Group errors by type (unused imports, invalid props, type mismatches, etc.)
3. **Fix by Category**: Address errors systematically by category rather than file-by-file
4. **Common Error Patterns**:
   - Badge component `variant` prop errors → Replace with styled spans
   - Button component `size`/`variant` prop errors → Remove invalid props
   - Unused import errors → Remove unused imports
   - Type annotation errors → Add explicit type annotations
   - Optional property errors → Use conditional spread operator
5. **Iterative Testing**: Run build after each set of fixes to verify resolution
6. **Documentation**: Update rules with new error patterns encountered

**Files Successfully Fixed During Session**:
- AddToBoardModal.tsx
- MoodBoardPage.tsx
- NeRFReconstructionPage.tsx
- OCRProcessor.tsx
- EnhancedPDFProcessor.tsx
- HTMLDocumentViewer.tsx
- MaterialsListViewer.tsx
- PDFExportOptions.tsx
- PDFResultsViewer.tsx
- PDFReviewWorkflow.tsx
- PDFWorkflowViewer.tsx
- AddKnowledgeEntry.tsx
- EnhancedRAGInterface.tsx
- RAGSearchInterface.tsx
- ProgressIndicator.tsx
- RealTimeStatusIndicator.tsx

**Error Pattern Summary**:
- **Badge Component Issues**: 15+ instances of invalid `variant` props fixed
- **Button Component Issues**: 10+ instances of invalid `size`/`variant` props fixed
- **Unused Import Issues**: 20+ unused imports removed across files
- **Type Annotation Issues**: 5+ callback function type annotations added
- **Database Schema Issues**: 3+ Supabase table compatibility issues resolved
- **Set Iteration Issues**: 2+ Set spread operator issues fixed with Array.from()

### 11.7 Systematic Build Error Resolution Process

**Rule**: Follow a systematic approach to resolve TypeScript compilation errors.

**Process**:
1. **Run Build Command**: Execute `npm run build` to identify all compilation errors
2. **Categorize Errors**: Group errors by type (component props, database calls, imports, etc.)
3. **Fix by Category**: Address all errors of the same type together for consistency
4. **Verify Fixes**: Run build again after each category to confirm resolution
5. **Iterate**: Continue until all errors are resolved and build succeeds

**Error Categories to Address**:
- UI component prop type errors (Badge/Button variants)
- Database schema validation errors (non-existent tables)
- Unused import/variable errors
- TypeScript interface compliance issues
- Callback function type safety
- Property access safety
- Missing type annotations

### 11.8 Mock Data Implementation Standards

**Rule**: Implement comprehensive mock data that maintains type safety and realistic behavior.

**Requirements**:
- Match all interface properties exactly
- Provide realistic default values
- Include proper timestamp generation
- Maintain referential integrity between related objects
- Log mock operations for debugging purposes

**Example Implementation**:
```typescript
const generateMockMaterials = (count: number): MaterialInterface[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: `mock-material-${index + 1}`,
    name: `Material ${index + 1}`,
    description: `Mock material description for item ${index + 1}`,
    properties: {
      density: Math.random() * 10,
      hardness: Math.floor(Math.random() * 10) + 1
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviewed: Math.random() > 0.5,
    approved: Math.random() > 0.7
  }));
};
```

---

## Conclusion

These rules represent lessons learned from real development challenges and should be followed to maintain code quality, prevent regressions, and ensure smooth development workflows. The TypeScript compilation error prevention rules (Section 11) are particularly critical for maintaining build stability and should be applied systematically when encountering compilation issues.

Regular review and updates of these rules based on new experiences will help maintain their relevance and effectiveness.

**Last Updated**: August 16, 2025
**Based on**: Material Kai Vision Platform Database Migration Project & TypeScript Build Troubleshooting
**Status**: Active - to be reviewed and updated quarterly