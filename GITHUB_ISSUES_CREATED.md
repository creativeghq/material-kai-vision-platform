# 🎫 GitHub Issues Created - Future Enhancements

All TODO items that require significant infrastructure work have been documented as GitHub issues with comprehensive technical details.

---

## ✅ Created Issues

### Issue #96: Implement Duplicate Prevention Metrics Tracking
**URL**: https://github.com/creativeghq/material-kai-vision-platform/issues/96
**Priority**: Medium
**Effort**: 3-5 days
**Labels**: `enhancement`, `database`, `metrics`, `technical-debt`

**Summary**: Track metrics for duplicate prevention during chunk processing
- Exact duplicates prevented
- Semantic duplicates prevented  
- Low quality chunks rejected

**Technical Requirements**:
- Database schema changes (new columns or metrics table)
- Processing pipeline instrumentation
- API updates to return actual metrics

**File**: `mivaa-pdf-extractor/app/api/chunk_quality_routes.py` (lines 280-282)

---

### Issue #97: Migrate Web Scraping to Async Job Queue System
**URL**: https://github.com/creativeghq/material-kai-vision-platform/issues/97
**Priority**: High
**Effort**: 1-2 weeks
**Labels**: `enhancement`, `architecture`, `async`, `high-priority`

**Summary**: Replace synchronous web scraping with async job queue
- Background job execution
- Progress tracking
- Retry logic
- Better user experience

**Technical Requirements**:
- Choose queue technology (Celery, custom, or Supabase)
- Database schema for job tracking
- API changes (return job ID, polling endpoints)
- Frontend integration

**File**: `mivaa-pdf-extractor/app/api/web_scraping_routes.py` (line 125, 231)

---

### Issue #98: Build AI Model Testing Framework
**URL**: https://github.com/creativeghq/material-kai-vision-platform/issues/98
**Priority**: High
**Effort**: 4-5 weeks
**Labels**: `enhancement`, `ai`, `testing`, `quality-assurance`

**Summary**: Automated testing framework for AI model outputs
- Vision model testing (property extraction accuracy)
- Embedding model testing (semantic similarity)
- LLM testing (prompt response quality)
- Regression detection
- Cost tracking

**Technical Requirements**:
- Test dataset creation (ground truth data)
- Database schema for test cases and results
- Evaluation metrics implementation
- CI/CD integration

**File**: `mivaa-pdf-extractor/app/services/admin_prompt_service.py` (line 220)

---

### Issue #99: Implement Geospatial Search and Proximity Filtering
**URL**: https://github.com/creativeghq/material-kai-vision-platform/issues/99
**Priority**: Medium
**Effort**: 3-4 weeks
**Labels**: `enhancement`, `geospatial`, `database`, `maps`

**Summary**: Add geospatial search capabilities
- Location storage (lat/lon for materials, warehouses, suppliers)
- Distance calculation (Haversine or PostGIS)
- Proximity search ("materials within 50km")
- Nearest neighbor search
- Map-based UI

**Technical Requirements**:
- PostGIS extension setup
- Geocoding service integration (Google Maps, Mapbox, or Nominatim)
- Spatial indexes
- Frontend map component

**File**: `mivaa-pdf-extractor/app/services/product_creation_service.py` (line 765)

---

### Issue #100: Support Multi-Product Detection from Catalog Pages
**URL**: https://github.com/creativeghq/material-kai-vision-platform/issues/100
**Priority**: Medium
**Effort**: 3-4 weeks
**Labels**: `enhancement`, `vision`, `ai`, `complex`

**Summary**: Detect and extract multiple products from single catalog page
- Product region detection
- Layout analysis (grid, comparison, mixed)
- Image-text association
- Property extraction for each product
- Validation

**Technical Requirements**:
- Vision model enhancements
- Layout analysis algorithms
- Image segmentation/cropping
- Multi-product API response format

**File**: `mivaa-pdf-extractor/app/services/product_vision_extractor.py` (line 292)

---

## 📊 Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Issues Created** | 5 |
| **High Priority** | 2 (#97, #98) |
| **Medium Priority** | 3 (#96, #99, #100) |
| **Total Estimated Effort** | 11-18 weeks |
| **Database Changes Required** | 4 issues |
| **AI/ML Work** | 2 issues (#98, #100) |

---

## 🎯 Recommended Implementation Order

### Phase 1: Quick Wins (1-2 weeks)
1. **Issue #96**: Duplicate Prevention Metrics
   - Relatively simple database changes
   - High visibility, low risk

### Phase 2: Infrastructure (2-3 weeks)
2. **Issue #97**: Async Job Queue
   - High priority, improves UX significantly
   - Foundation for other async features

### Phase 3: Quality Assurance (4-5 weeks)
3. **Issue #98**: AI Model Testing Framework
   - Critical for long-term quality
   - Enables confident model updates

### Phase 4: Advanced Features (6-8 weeks)
4. **Issue #99**: Geospatial Search
   - Nice-to-have feature
   - Requires PostGIS setup

5. **Issue #100**: Multi-Product Detection
   - Complex vision work
   - High value but can be deferred

---

## 💡 Next Steps

1. **Prioritize**: Review issues with product team
2. **Estimate**: Refine effort estimates based on team capacity
3. **Plan**: Add to sprint backlog based on priority
4. **Assign**: Assign issues to team members
5. **Track**: Monitor progress in GitHub Projects

---

All issues include:
- ✅ Detailed technical specifications
- ✅ Implementation steps broken down by phase
- ✅ Code examples and database schemas
- ✅ Success criteria
- ✅ Cost/complexity analysis
- ✅ Related file references with line numbers

**Ready for sprint planning!** 🚀

