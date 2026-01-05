# MIVAA Service Consolidation Plan

## Current State Analysis

### Two Services Exist:

1. **`mivaaApiClient.ts`** (462 lines) - Modern, Direct API Client
   - Direct calls to MIVAA backend (`https://v1api.materialshub.gr`)
   - Uses Supabase auth tokens
   - Simple request/response pattern
   - No retry logic (relies on network stability)
   - **Preferred for new code**

2. **`mivaaIntegrationService.ts`** (555 lines) - Legacy Integration Layer
   - Calls through Supabase Edge Function (`mivaa-gateway`)
   - Includes retry logic via `RetryHelper`
   - Has utility methods (e.g., `validateAndFixImageUrls`)
   - More complex error handling
   - **Legacy, being phased out**

## Problem: Duplication & Confusion

### Duplicate Methods:
| Method | mivaaApiClient | mivaaIntegrationService | Issue |
|--------|---------------|------------------------|-------|
| Material Analysis | `analyzeMaterial()` | `analyzeMaterial()` | Different implementations |
| Search | `searchMultiVector()` | `semanticSearch()` | Different endpoints |
| PDF Processing | `uploadPDF()` | `processPDF()` | Different approaches |
| Embeddings | `generateEmbedding()` | `generateEmbedding()` | Duplicate |
| Image Analysis | `analyzeVision()` | `analyzeImage()` | Different implementations |

### Current Usage:
**mivaaApi (Direct):**
- `consolidatedPDFController.ts` - Search
- `integratedAIService.ts` - AI operations
- `PDFProcessingStepsMonitor.tsx` - Job monitoring

**mivaaService (Legacy):**
- `MivaaPDFProcessor.tsx` - PDF processing
- `MaterialRecognition.tsx` - Material analysis
- `consolidatedPDFController.ts` - RAG processing

## Recommended Solution: Consolidate to mivaaApiClient

### Phase 1: Migrate Utility Methods (Week 1)
1. Move `validateAndFixImageUrls()` from `mivaaIntegrationService` to a separate utility
2. Create `src/utils/imageUrlValidator.ts`
3. Update imports in affected files

### Phase 2: Update Component Usage (Week 1-2)
Replace all `mivaaService` calls with `mivaaApi`:

**Files to Update:**
1. `src/components/features/pdf/MivaaPDFProcessor.tsx`
   - Replace: `mivaaService.processPDF()` 
   - With: `mivaaApi.uploadPDF()`

2. `src/components/features/recognition/MaterialRecognition.tsx`
   - Replace: `mivaaService.analyzeMaterial()`
   - With: `mivaaApi.analyzeMaterial()`

3. `src/api/controllers/consolidatedPDFController.ts`
   - Remove `mivaaService` instance
   - Use only `mivaaApi`

### Phase 3: Add Retry Logic to mivaaApiClient (Week 2)
Since `mivaaIntegrationService` has retry logic that's valuable:

```typescript
// Add to mivaaApiClient.ts
import { RetryHelper } from '@/utils/retryHelper';

private async requestWithRetry<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<MivaaApiResponse<T>> {
  return RetryHelper.withRetry(
    () => this.request(endpoint, options),
    {
      maxAttempts: 3,
      delay: 1000,
      backoffMultiplier: 2,
      retryCondition: (error) => {
        const status = (error as any).status;
        return !status || status >= 500;
      },
    }
  );
}
```

### Phase 4: Remove mivaaIntegrationService (Week 3)
1. Delete `src/services/mivaaIntegrationService.ts`
2. Delete `src/services/pdf/mivaaIntegrationService.ts` (duplicate)
3. Update all imports
4. Run tests to ensure nothing breaks

## Benefits of Consolidation

✅ **Single Source of Truth** - One client for all MIVAA calls
✅ **Simpler Architecture** - No confusion about which service to use
✅ **Better Performance** - Direct calls, no Edge Function overhead
✅ **Easier Maintenance** - One codebase to update
✅ **Consistent Error Handling** - Unified approach across the app

## Migration Checklist

- [ ] Create `src/utils/imageUrlValidator.ts`
- [ ] Move `validateAndFixImageUrls()` to utility
- [ ] Update `MivaaPDFProcessor.tsx` to use `mivaaApi`
- [ ] Update `MaterialRecognition.tsx` to use `mivaaApi`
- [ ] Update `consolidatedPDFController.ts` to use only `mivaaApi`
- [ ] Add retry logic to `mivaaApiClient`
- [ ] Test all PDF processing flows
- [ ] Test all material recognition flows
- [ ] Test all search flows
- [ ] Delete `mivaaIntegrationService.ts`
- [ ] Delete `src/services/pdf/mivaaIntegrationService.ts`
- [ ] Update documentation
- [ ] Run full test suite

## Risk Mitigation

1. **Gradual Migration** - Update one component at a time
2. **Feature Flags** - Use flags to toggle between old/new implementations
3. **Monitoring** - Track error rates during migration
4. **Rollback Plan** - Keep old service until migration is complete and tested

## Timeline

- **Week 1**: Phases 1-2 (Utility migration + Component updates)
- **Week 2**: Phase 3 (Add retry logic)
- **Week 3**: Phase 4 (Remove old service)
- **Week 4**: Testing & Documentation

## Conclusion

**Recommendation: CONSOLIDATE to `mivaaApiClient`**

The duplication is real and causes confusion. `mivaaApiClient` is the modern, preferred approach. `mivaaIntegrationService` should be deprecated and removed after migrating its useful features (retry logic, utilities) to the main client.

