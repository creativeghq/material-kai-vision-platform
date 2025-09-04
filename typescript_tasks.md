# TypeScript Improvements Task List

## Phase 1: Type Safety Improvements
- [ ] Replace `any` types in MaterialAgentTaskRequest.input_data → `src/services/integratedAIService.ts`, `supabase/functions/material-agent-orchestrator/index.ts`
- [ ] Replace `any` types in service interfaces → `src/services/integratedAIService.ts`, `src/services/materialRecognitionAPI.ts`, `src/services/ml/serverMLService.ts`
- [ ] Replace `any` types in API controllers → `src/api/controllers/documentWorkflowController.ts`, `src/api/controllers/consolidatedPDFController.ts`
- [ ] Add proper typing for dynamic object properties → `src/types/materials.ts`, `src/services/integratedAIService.ts`
- [ ] Implement discriminated unions where applicable → `src/types/materials.ts`, `src/services/materialRecognitionAPI.ts`

## Phase 2: Type Guards and Narrowing
- [ ] Add type guard for RecognitionResult material consistency → `src/types/materials.ts`, `src/services/integratedWorkflowService.ts`
- [ ] Add type guard for valid Material objects → `src/types/materials.ts`, `src/services/materialRecognitionAPI.ts`
- [ ] Add type guard for ProcessingJob status validation → `src/types/materials.ts`, `src/services/materialRecognitionAPI.ts`
- [ ] Implement custom type guards for complex types → `src/types/materials.ts`, `src/services/integratedAIService.ts`
- [ ] Add runtime type validation where needed → `src/services/materialRecognitionAPI.ts`, `src/services/ml/serverMLService.ts`

## Phase 3: Utility Types and Generics
- [ ] Create ApiResponse<T> utility type → `src/types/materials.ts` (new utility types)
- [ ] Implement OptionalKeys<T, K> utility type → `src/types/materials.ts`
- [ ] Add generic constraints to repository interfaces → `src/services/integratedAIService.ts`, `src/services/materialRecognitionAPI.ts`
- [ ] Create mapped types for API transformations → `src/types/materials.ts`, `src/api/controllers/documentWorkflowController.ts`
- [ ] Implement conditional types for better type inference → `src/types/materials.ts`

## Phase 4: Documentation Improvements
- [ ] Add missing @param tags to all functions → All `.ts` files in `src/` directory
- [ ] Add missing @returns tags to all functions → All `.ts` files in `src/` directory
- [ ] Add @throws documentation for error cases → All `.ts` files in `src/` directory
- [ ] Standardize TSDoc comment format → All `.ts` files in `src/` directory
- [ ] Add examples to complex function documentation → `src/services/integratedAIService.ts`, `src/services/materialRecognitionAPI.ts`

## Phase 5: Legacy Code Cleanup
- [ ] Remove MaterialCategory_OLD enum → `src/types/materials.ts`
- [ ] Update all references to use new enum → Search across all `.ts` files for `MaterialCategory_OLD`
- [ ] Remove deprecated interfaces → `src/types/materials.ts`
- [ ] Clean up legacy type definitions → `src/types/materials.ts`
- [ ] Update import statements → All files importing from `src/types/materials.ts`

## Phase 6: Error Handling Enhancements
- [ ] Create custom error classes with proper typing → `src/types/materials.ts` (new error types)
- [ ] Implement ValidationError class → `src/types/materials.ts`
- [ ] Add error type discrimination → `src/services/materialRecognitionAPI.ts`, `src/services/integratedAIService.ts`
- [ ] Improve error message typing → `src/services/materialRecognitionAPI.ts`
- [ ] Add error boundary types → `src/types/materials.ts`

## Phase 7: Configuration Optimization
- [ ] Enable stricter TypeScript settings → `tsconfig.json`
- [ ] Add exactOptionalPropertyTypes → `tsconfig.json`
- [ ] Enable noImplicitOverride → `tsconfig.json`
- [ ] Configure path mapping for cleaner imports → `tsconfig.json`
- [ ] Add type checking for JavaScript files → `tsconfig.json`

## Phase 8: Testing and Validation
- [ ] Run TypeScript compiler to verify all changes → Terminal command
- [ ] Check for any new type errors → Terminal command
- [ ] Validate type coverage improvements → Terminal command
- [ ] Test type guards with edge cases → `src/services/materialRecognitionAPI.ts`, `src/services/integratedAIService.ts`
- [ ] Verify documentation generation → Terminal command