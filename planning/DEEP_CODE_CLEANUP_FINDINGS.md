# Deep Code Cleanup - Findings & Recommendations

**Date:** 2026-01-08  
**Scope:** Complete codebase scan for dead code, unused imports, deprecated features

---

## ✅ **Already Cleaned (Previous Audits)**

### 1. Deprecated API Endpoints - **REMOVED** ✅
- `GET /documents` (HTTP 410)
- `DELETE /documents/{document_id}` (HTTP 410)
- **Status:** Already removed from `rag_routes.py`

### 2. Circuit Breaker Alias - **REMOVED** ✅
- `together_breaker = vision_breaker` backward compatibility alias
- **Status:** Already removed from `circuit_breaker.py`

---

## 🟡 **TODOs Found - Need Action**

### 1. Chunk Quality Tracking (INCOMPLETE)
**File:** `mivaa-pdf-extractor/app/api/chunk_quality_routes.py`  
**Lines:** 280-282

```python
exact_duplicates_prevented=0,  # TODO: Track this in processing
semantic_duplicates_prevented=0,  # TODO: Track this in processing
low_quality_rejected=0,  # TODO: Track this in processing
```

**Impact:** Quality metrics endpoint returns zeros  
**Recommendation:**
- **Option A:** Implement tracking in chunking service
- **Option B:** Remove these fields if not needed
- **Option C:** Add comment explaining why they're zero

---

### 2. Empty Test Infrastructure
**Files:**
- `mivaa-pdf-extractor/tests/` - Empty directory
- `Makefile` - Test commands reference non-existent tests

**Impact:** Misleading - looks like tests exist but don't  
**Recommendation:**
- **Option A:** Create basic smoke tests
- **Option B:** Remove test commands from Makefile
- **Option C:** Add comment explaining test strategy

---

### 3. Debug Directories in ESLint Ignore
**File:** `eslint.config.js`  
**Lines:** 37-38

```javascript
'src/pages/PDFProcessing.tsx',  // Why excluded?
'src/debug/**',  // Debug directory
```

**Questions:**
- Why is `PDFProcessing.tsx` excluded from linting?
- Should `src/debug/` be deleted or is it needed?

**Recommendation:**
- **Investigate:** Check if `PDFProcessing.tsx` has linting issues
- **Decide:** Keep or delete `src/debug/` directory

---

## 🔍 **Potential Cleanup Opportunities**

### 4. Duplicate Table Extraction (ALREADY HANDLED) ✅
**Status:** Old `extract_pdf_tables()` already deprecated  
**New:** `TableExtractor` service is the current implementation  
**Action:** ✅ No action needed - already using new service

---

### 5. Unused Dependencies Check
**File:** `requirements.txt`

**Recommendation:** Run dependency audit:
```bash
# Check for unused packages
pip-autoremove --list

# Or use pipdeptree
pipdeptree --warn silence | grep -E '^\w'
```

**Common candidates for removal:**
- Old PDF libraries if replaced
- Deprecated AI model libraries
- Unused image processing libraries

---

### 6. Commented Code Blocks
**Status:** 3,175+ lines of commented code found in previous audit

**Recommendation:**
- **Review:** Check if commented code is needed for reference
- **Archive:** Move important commented code to documentation
- **Delete:** Remove truly dead commented code

**Example locations:**
- Old chunking implementations
- Deprecated search strategies
- Legacy API response formats

---

## 📊 **Summary Statistics**

### Code Health Metrics
| Metric | Count | Status |
|--------|-------|--------|
| Deprecated Endpoints | 0 | ✅ Clean |
| TODO Comments | 50+ | 🟡 Needs Review |
| Commented Code Lines | 3,175+ | 🟡 Needs Cleanup |
| Empty Test Files | Many | 🟡 Misleading |
| Unused Imports | Unknown | ⏳ Need Tool |

---

## 🎯 **Recommended Action Plan**

### Phase 1: Quick Wins (1-2 hours)
1. ✅ **Resolve TODOs** in `chunk_quality_routes.py`
   - Either implement or remove/document
2. ✅ **Clean up test infrastructure**
   - Remove misleading test commands or add basic tests
3. ✅ **Investigate debug exclusions**
   - Fix or document `PDFProcessing.tsx` linting exclusion

### Phase 2: Dependency Audit (2-3 hours)
1. ⏳ **Run dependency checker**
   - Identify unused packages in `requirements.txt`
2. ⏳ **Test removal**
   - Remove unused packages one by one
   - Run tests after each removal
3. ⏳ **Update documentation**
   - Document required vs optional dependencies

### Phase 3: Commented Code Cleanup (3-4 hours)
1. ⏳ **Review commented blocks**
   - Categorize: needed reference vs dead code
2. ⏳ **Archive important code**
   - Move to documentation or migration guides
3. ⏳ **Delete dead code**
   - Remove truly unused commented code

### Phase 4: Import Cleanup (Requires Python env)
1. ⏳ **Install autoflake**
   ```bash
   pip install autoflake
   ```
2. ⏳ **Scan for unused imports**
   ```bash
   autoflake --check --remove-all-unused-imports --recursive mivaa-pdf-extractor/app
   ```
3. ⏳ **Apply fixes**
   ```bash
   autoflake --in-place --remove-all-unused-imports --recursive mivaa-pdf-extractor/app
   ```

---

## ✅ **Completed in This Session**

### Option A: Table Integration ✅
1. ✅ Updated Stage 5 to count tables
2. ✅ Updated `GET /products` endpoint to include tables
3. ✅ Created comprehensive documentation

### Option B: Deep Code Cleanup (In Progress)
1. ✅ Verified deprecated endpoints already removed
2. ✅ Identified TODO comments needing action
3. ✅ Documented cleanup opportunities
4. ⏳ Need Python environment for import cleanup
5. ⏳ Need dependency audit tools

---

## 🚀 **Next Steps**

**Immediate (Can do now):**
1. Resolve TODO comments in `chunk_quality_routes.py`
2. Clean up test infrastructure in Makefile
3. Investigate `PDFProcessing.tsx` linting exclusion

**Requires Setup:**
1. Install Python linting tools (autoflake, pip-autoremove)
2. Run dependency audit
3. Scan for unused imports

**Would you like me to:**
- A) Resolve the TODO comments now?
- B) Clean up the test infrastructure?
- C) Investigate the linting exclusions?
- D) Create a script to find commented code blocks?

