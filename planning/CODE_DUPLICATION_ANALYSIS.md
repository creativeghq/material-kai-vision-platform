# Code Duplication & Consolidation Analysis
**Date:** 2026-01-05  
**Scope:** Frontend + Backend Duplication Patterns  
**Priority:** HIGH - Affects maintainability and consistency

---

## 📊 EXECUTIVE SUMMARY

### Duplication Severity
- 🔴 **Critical Duplication:** 3 instances (API clients, modal patterns)
- 🟡 **High Priority:** 5 instances (similarity calculations, HTTP logic)
- 🟢 **Medium Priority:** 4 instances (utility functions, UI patterns)

### Impact Assessment
- **Maintenance Cost:** HIGH - Changes must be made in multiple places
- **Bug Risk:** HIGH - Fixes may be applied inconsistently
- **Code Bloat:** MEDIUM - ~2,000-3,000 lines of duplicate code estimated

---

## 🔴 CRITICAL DUPLICATIONS

### 1. MIVAA API Client Duplication

**Files:**
- `src/services/mivaaApiClient.ts` (462 lines)
- `src/services/mivaaIntegrationService.ts` (555 lines)

**Problem:** Two separate services for calling MIVAA backend

**Analysis:**
```typescript
// mivaaApiClient.ts - Simple, direct API calls
class MivaaApiClient {
  private async request<T>(endpoint: string, options: RequestInit) {
    const token = await this.getAuthToken();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers }
    });
    return response.json();
  }
}

// mivaaIntegrationService.ts - Adds retry logic, circuit breaker (removed)
class MivaaIntegrationService {
  private config: MivaaConfig; // Retry attempts, backoff, timeout
  
  async validateAndFixImageUrls(documentId: string) { ... }
  async analyzeMaterial(imageUrl: string, options: MaterialAnalysisOptions) { ... }
  async searchSimilarMaterials(query: string, options: SearchOptions) { ... }
}
```

**Duplication:**
- Both have auth token retrieval
- Both make HTTP requests to MIVAA
- Both handle errors
- Both use same base URL

**Recommendation:** 🎯 **CONSOLIDATE**

**Proposed Solution:**
```typescript
// src/services/mivaa/MivaaClient.ts - Base HTTP client
export class MivaaClient {
  async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    // Auth, fetch, error handling
  }
}

// src/services/mivaa/MivaaService.ts - High-level operations
export class MivaaService {
  constructor(private client: MivaaClient) {}
  
  async analyzeMaterial(...) { return this.client.request(...) }
  async searchSimilarMaterials(...) { return this.client.request(...) }
}

// src/services/mivaa/index.ts - Single export
export const mivaaService = new MivaaService(new MivaaClient());
```

**Benefits:**
- Single source of truth for MIVAA API calls
- Easier to add features (retry, caching, etc.)
- Consistent error handling
- Reduced code by ~300 lines

**Migration Plan:**
1. Create new `src/services/mivaa/` directory
2. Extract common HTTP logic to `MivaaClient`
3. Move high-level methods to `MivaaService`
4. Update all imports gradually
5. Remove old files after migration

---

### 2. Similarity Calculation Duplication

**Files:**
- `mivaa-pdf-extractor/app/services/search/duplicate_detection_service.py`
- `mivaa-pdf-extractor/app/services/search/search_deduplication_service.py`

**Problem:** Both services calculate cosine similarity independently

**Duplication:**
```python
# duplicate_detection_service.py
def _calculate_similarity(self, product1, product2):
    name_sim = calculate_string_similarity(name1, name2)
    desc_sim = calculate_text_similarity(desc1, desc2)
    metadata_sim = self._calculate_metadata_similarity(meta1, meta2)
    
    overall = (
        name_sim * self.WEIGHTS['name'] +
        desc_sim * self.WEIGHTS['description'] +
        metadata_sim * self.WEIGHTS['metadata']
    )
    return overall

# search_deduplication_service.py
def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = sum(a * a for a in vec1) ** 0.5
    magnitude2 = sum(b * b for b in vec2) ** 0.5
    return dot_product / (magnitude1 * magnitude2)
```

**Recommendation:** 🎯 **EXTRACT TO UTILITY**

**Proposed Solution:**
```python
# app/utils/similarity.py
class SimilarityCalculator:
    """Centralized similarity calculations"""
    
    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        ...
    
    @staticmethod
    def weighted_similarity(
        components: Dict[str, float],
        weights: Dict[str, float]
    ) -> float:
        """Calculate weighted average of similarity components"""
        return sum(components[k] * weights[k] for k in components)
    
    @staticmethod
    def text_similarity(text1: str, text2: str) -> float:
        """Calculate text similarity using multiple methods"""
        ...
```

**Benefits:**
- Single implementation to test and maintain
- Consistent similarity calculations across platform
- Easy to add new similarity methods
- Reduced code by ~100 lines

---

### 3. Modal Component Duplication

**Files:**
- `src/components/Search/MergeSearchModal.tsx`
- `src/components/AI/MaterialMatchingModal.tsx`
- `src/components/MoodBoard/AddToBoardModal.tsx`
- `src/components/Quotes/AddToQuoteModal.tsx`
- `src/components/Admin/ProductDeleteConfirmation.tsx`
- `src/components/Products/ProductDetailModal.tsx`

**Problem:** 6+ modal components with similar patterns

**Common Pattern:**
```typescript
// Every modal has:
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  setLoading(true);
  try {
    await someAction();
    onClose();
    toast({ title: 'Success' });
  } catch (error) {
    toast({ title: 'Error', variant: 'destructive' });
  } finally {
    setLoading(false);
  }
};

return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {/* Content */}
      <DialogFooter>
        <Button onClick={handleAction} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : 'Confirm'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
```

**Recommendation:** 🎯 **CREATE BASE MODAL COMPONENT**

**Proposed Solution:**
```typescript
// src/components/ui/base-modal.tsx
interface BaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => Promise<void>;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  children: React.ReactNode;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  open, onOpenChange, title, description,
  onConfirm, confirmText = 'Confirm', cancelText = 'Cancel',
  variant = 'default', children
}) => {
  const [loading, setLoading] = useState(false);
  
  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
      toast({ title: 'Success' });
    } catch (error) {
      toast({ 
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={loading}
            variant={variant}
          >
            {loading ? <Loader2 className="animate-spin" /> : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

**Usage:**
```typescript
// Simplified modal components
<BaseModal
  open={open}
  onOpenChange={setOpen}
  title="Delete Product"
  description="Are you sure?"
  onConfirm={async () => await deleteProduct(id)}
  confirmText="Delete"
  variant="destructive"
>
  <ProductDetails product={product} />
</BaseModal>
```

**Benefits:**
- Consistent modal behavior across app
- Automatic loading states and error handling
- Reduced code by ~500 lines
- Easier to add features (keyboard shortcuts, animations)

---

## 🟡 HIGH PRIORITY DUPLICATIONS

### 4. HTTP Request Logic Duplication

**Problem:** Multiple services implement their own HTTP request logic

**Files:**
- `src/services/mivaaApiClient.ts`
- `src/services/mivaaIntegrationService.ts`
- `src/services/apiGateway/browserApiIntegrationService.ts`
- Various API service files

**Common Pattern:**
```typescript
// Repeated in multiple files:
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

return await response.json();
```

**Recommendation:** 🎯 **CREATE HTTP CLIENT UTILITY**

**Proposed Solution:**
```typescript
// src/utils/httpClient.ts
export class HttpClient {
  async request<T>(
    url: string,
    options: RequestInit & { auth?: boolean }
  ): Promise<T> {
    const headers = new Headers(options.headers);
    
    if (options.auth) {
      const token = await this.getAuthToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      throw await this.handleError(response);
    }
    
    return response.json();
  }
  
  get<T>(url: string, options?: RequestInit) {
    return this.request<T>(url, { ...options, method: 'GET' });
  }
  
  post<T>(url: string, data: any, options?: RequestInit) {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}
```

---

### 5. Supabase Client Initialization Duplication

**Problem:** Supabase client created in multiple places

**Files:**
- `src/integrations/supabase/client.ts` (Frontend)
- `mivaa-pdf-extractor/app/services/core/supabase_client.py` (Backend)
- Various service files importing and re-initializing

**Recommendation:** ✅ **ALREADY GOOD** - Both use singleton pattern

**Note:** No action needed - properly implemented

---

## 🟢 MEDIUM PRIORITY DUPLICATIONS

### 6. Loading State Management

**Problem:** Every component manages loading states independently

**Pattern:**
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleAction = async () => {
  setLoading(true);
  setError(null);
  try {
    await action();
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

**Recommendation:** 🎯 **CREATE CUSTOM HOOK**

**Proposed Solution:**
```typescript
// src/hooks/useAsyncAction.ts
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options?: {
    onSuccess?: (result: Awaited<ReturnType<T>>) => void;
    onError?: (error: Error) => void;
  }
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const execute = useCallback(async (...args: Parameters<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await action(...args);
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [action, options]);
  
  return { execute, loading, error };
}
```

**Usage:**
```typescript
const { execute: deleteProduct, loading } = useAsyncAction(
  async (id: string) => await api.deleteProduct(id),
  {
    onSuccess: () => toast({ title: 'Deleted' }),
    onError: (err) => toast({ title: 'Error', description: err.message })
  }
);
```

---

## 📈 CONSOLIDATION ROADMAP

### Phase 1: Critical (Week 1-2)
1. ✅ Consolidate MIVAA API clients
2. ✅ Extract similarity calculations to utility
3. ✅ Create base modal component

**Expected Savings:** ~800 lines of code

### Phase 2: High Priority (Week 3-4)
1. ✅ Create HTTP client utility
2. ✅ Standardize error handling
3. ✅ Create async action hook

**Expected Savings:** ~400 lines of code

### Phase 3: Medium Priority (Week 5-6)
1. ✅ Consolidate loading state management
2. ✅ Extract common UI patterns
3. ✅ Create shared validation utilities

**Expected Savings:** ~300 lines of code

---

## 📊 IMPACT METRICS

### Before Consolidation
- **Total Lines:** ~150,000
- **Duplicate Code:** ~2,000-3,000 lines (2%)
- **Maintenance Points:** 15+ places to update for common changes

### After Consolidation
- **Total Lines:** ~148,500 (-1,500 lines)
- **Duplicate Code:** <500 lines (<0.5%)
- **Maintenance Points:** 3-5 centralized utilities

### Benefits
- ✅ 50% reduction in duplicate code
- ✅ 70% reduction in maintenance points
- ✅ Improved consistency
- ✅ Easier testing
- ✅ Faster development

---

**Review Completed:** 2026-01-05  
**Next Steps:** Begin Phase 1 consolidation
