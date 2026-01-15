# RAG Routes Refactoring Roadmap

**Complete step-by-step guide to finish the refactoring**

---

## Current Status: 75% Complete ✅

- ✅ Upload routes extracted (518 lines)
- ✅ Query routes extracted (944 lines)
- ✅ Management routes extracted (849 lines)
- ✅ Orchestration abstracted (1,048 lines)
- ⏳ Remaining: 1,118 lines (25%)

---

## Phase 1: Quick Wins (1-2 hours) 🎯

### Step 1: Extract Data Retrieval Endpoints
**Estimated Time:** 30 minutes  
**Risk:** Low  
**Value:** High

**Create:** `app/api/documents/data_routes.py`

**Endpoints to Move:**
- `GET /chunks` (62 lines)
- `GET /images` (51 lines)
- `GET /products` (73 lines)
- `GET /embeddings` (154 lines)
- `GET /relevancies` (72 lines)

**Total:** ~350 lines

**Steps:**
1. Create `data_routes.py` with router
2. Copy endpoints from `rag_routes.py`
3. Update imports (Supabase client, models)
4. Test each endpoint
5. Remove from `rag_routes.py`
6. Update `__init__.py` to include new router

**Testing:**
```bash
# Test each endpoint
curl http://localhost:8000/chunks?document_id=xxx
curl http://localhost:8000/images?document_id=xxx
curl http://localhost:8000/products?document_id=xxx
curl http://localhost:8000/embeddings?document_id=xxx
curl http://localhost:8000/relevancies?document_id=xxx
```

---

### Step 2: Extract Health & Monitoring Endpoints
**Estimated Time:** 20 minutes  
**Risk:** Low  
**Value:** Medium

**Create:** `app/api/documents/monitoring_routes.py`

**Endpoints to Move:**
- `GET /health` (38 lines)
- `GET /stats` (48 lines)
- `GET /workspace-stats` (82 lines)

**Total:** ~150 lines

**Steps:**
1. Create `monitoring_routes.py` with router
2. Copy endpoints from `rag_routes.py`
3. Update imports (RAG service, Supabase)
4. Test each endpoint
5. Remove from `rag_routes.py`
6. Update `__init__.py`

**Testing:**
```bash
curl http://localhost:8000/health
curl http://localhost:8000/stats
curl http://localhost:8000/workspace-stats?workspace_id=xxx
```

---

### Step 3: Extract Admin Endpoints
**Estimated Time:** 15 minutes  
**Risk:** Low  
**Value:** Medium

**Create:** `app/api/documents/admin_routes.py`

**Endpoints to Move:**
- `GET /admin/stuck-jobs/analyze/{job_id}` (23 lines)
- `GET /admin/stuck-jobs/statistics` (58 lines)

**Total:** ~100 lines

**Steps:**
1. Create `admin_routes.py` with router
2. Copy endpoints from `rag_routes.py`
3. Update imports (stuck_job_analyzer)
4. Test each endpoint
5. Remove from `rag_routes.py`
6. Update `__init__.py`

**Testing:**
```bash
curl http://localhost:8000/admin/stuck-jobs/analyze/xxx
curl http://localhost:8000/admin/stuck-jobs/statistics
```

---

## Phase 2: Model Consolidation (30 minutes) 📝

### Step 4: Consolidate Data Models
**Estimated Time:** 30 minutes  
**Risk:** Low  
**Value:** Medium

**Create:** `app/api/documents/models.py`

**Models to Move:**
- All Pydantic request/response models (16 total)
- ~200 lines

**Steps:**
1. Create `models.py`
2. Move all BaseModel classes
3. Update imports in all route files
4. Test all endpoints
5. Remove from `rag_routes.py`

**Import Updates:**
```python
# Before
from app.api.rag_routes import QueryRequest, QueryResponse

# After
from app.api.documents.models import QueryRequest, QueryResponse
```

---

## Phase 3: Service Layer Extraction (1-2 hours) ⚙️

### Step 5: Extract Background Processing Functions
**Estimated Time:** 1-2 hours  
**Risk:** Medium  
**Value:** High

**Create:**
- `app/services/background/product_processor.py`
- `app/services/background/image_processor.py`

**Functions to Move:**
- `create_products_background` (171 lines)
- `process_images_background` (105 lines)

**Total:** ~276 lines

**Steps:**
1. Create `background/` directory
2. Create `product_processor.py`
3. Move `create_products_background`
4. Create `image_processor.py`
5. Move `process_images_background`
6. Update imports in `rag_routes.py`
7. Test background processing
8. Update orchestration functions to use new services

**Testing:**
- Upload document and verify product creation
- Upload document with images and verify image processing
- Check sub-job creation and tracking

---

## Phase 4: Complete Orchestration (4-6 hours) 🔄

### Step 6: Full Orchestration Extraction
**Estimated Time:** 4-6 hours  
**Risk:** High  
**Value:** Very High

**Create:**
- `app/services/orchestration/standard_processor.py`
- `app/services/orchestration/discovery_processor.py`

**Functions to Move:**
- `process_document_background` (531 lines)
- `process_document_with_discovery` (517 lines)

**Total:** 1,048 lines

**Steps:**
1. Create detailed test suite first
2. Move `process_document_background` to `standard_processor.py`
3. Move `process_document_with_discovery` to `discovery_processor.py`
4. Update `app/orchestration.py` to import from new locations
5. Run comprehensive tests
6. Update all consumers
7. Remove from `rag_routes.py`

**Testing:**
- Full document upload and processing
- Product discovery pipeline
- Checkpoint recovery
- Error handling
- Background task execution

---

## Phase 5: Testing & Documentation (2-3 hours) ✅

### Step 7: Update Tests
**Estimated Time:** 2 hours

**Tasks:**
1. Update import paths in all tests
2. Add tests for new modules
3. Test all endpoints
4. Test orchestration functions
5. Integration tests

### Step 8: Update Documentation
**Estimated Time:** 1 hour

**Tasks:**
1. Update API documentation
2. Update README files
3. Update architecture diagrams
4. Create migration guide
5. Update CHANGELOG

---

## Final State

### File Structure
```
app/
├── api/
│   ├── documents/
│   │   ├── __init__.py
│   │   ├── upload_routes.py ✅ (518 lines)
│   │   ├── query_routes.py ✅ (944 lines)
│   │   ├── management_routes.py ✅ (849 lines)
│   │   ├── data_routes.py ⏳ (350 lines)
│   │   ├── monitoring_routes.py ⏳ (150 lines)
│   │   ├── admin_routes.py ⏳ (100 lines)
│   │   └── models.py ⏳ (200 lines)
│   └── rag_routes.py (core only, ~100 lines)
│
├── services/
│   ├── background/
│   │   ├── product_processor.py ⏳ (171 lines)
│   │   └── image_processor.py ⏳ (105 lines)
│   └── orchestration/
│       ├── standard_processor.py ⏳ (531 lines)
│       └── discovery_processor.py ⏳ (517 lines)
│
└── orchestration.py ✅ (abstraction layer)
```

### Metrics
- **Original:** 4,477 lines in 1 file
- **Final:** ~100 lines in main file + 10 focused modules
- **Reduction:** 98% reduction in main file
- **Modules:** 10 total (4 complete, 6 remaining)

---

## Timeline

| Phase | Duration | Completion |
|-------|----------|------------|
| Phase 1: Quick Wins | 1-2 hours | Week 1 |
| Phase 2: Models | 30 minutes | Week 1 |
| Phase 3: Services | 1-2 hours | Week 2 |
| Phase 4: Orchestration | 4-6 hours | Week 2-3 |
| Phase 5: Testing & Docs | 2-3 hours | Week 3 |
| **TOTAL** | **9-14 hours** | **3 weeks** |

---

## Success Criteria

- [ ] All endpoints working correctly
- [ ] All tests passing
- [ ] Zero breaking changes
- [ ] Documentation updated
- [ ] Code review completed
- [ ] Main file under 200 lines
- [ ] 10 focused modules created
- [ ] 98% reduction achieved

---

**Last Updated:** 2026-01-12  
**Status:** Roadmap Created  
**Next Action:** Begin Phase 1, Step 1
