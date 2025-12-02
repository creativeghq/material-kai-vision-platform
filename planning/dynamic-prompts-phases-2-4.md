# Dynamic Prompts System - Phases 2-4 Implementation Plan

**Status**: Pending  
**Phase 1**: ✅ Complete (Metadata Extraction)  
**Phases 2-4**: ⏳ Pending Implementation

---

## Phase 2: Product Discovery Prompts

### Scope
Convert product discovery prompts from hardcoded to database-driven.

### Files to Update
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/product_vision_extractor.py`

### Prompts to Migrate (2 prompts)
1. **Product Discovery Prompt** - Main product identification prompt
2. **Product Boundary Detection** - Product page boundary detection

### Database Schema
Use existing `extraction_prompts` table:
- **Stage**: `discovery`
- **Category**: `products`
- **Priority**: Custom (is_custom=true) → Default (is_custom=false) → Hardcoded fallback

### Implementation Steps
1. Add Supabase client to product discovery services
2. Create `_load_prompt_from_database()` method
3. Update discovery methods to use database prompts
4. Insert default prompts into database
5. Test with Harmony PDF
6. Deploy and monitor

### Estimated Effort
2-3 hours

---

## Phase 3: Material Properties Extraction

### Scope
Convert material properties extraction prompt from hardcoded to database-driven.

### Files to Update
- `mivaa-pdf-extractor/app/services/dynamic_metadata_extractor.py` (additional prompts)

### Prompts to Migrate (1 prompt)
1. **Material Properties Extraction** - Specialized material properties prompt

### Database Schema
Use existing `extraction_prompts` table:
- **Stage**: `entity_creation`
- **Category**: `material_properties`
- **Priority**: Custom (is_custom=true) → Default (is_custom=false) → Hardcoded fallback

### Implementation Steps
1. Identify material properties extraction prompt
2. Add database loading for material properties category
3. Insert default prompt into database
4. Test with material-heavy PDFs
5. Deploy and monitor

### Estimated Effort
1-2 hours

---

## Phase 4: Image Analysis Prompts

### Scope
Convert image analysis prompts from hardcoded to database-driven.

### Files to Update
- `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

### Prompts to Migrate (2 prompts)
1. **Image Classification Prompt** - Material/product image classification
2. **Image Description Prompt** - Detailed image description generation

### Database Schema
Use existing `extraction_prompts` table:
- **Stage**: `image_analysis`
- **Category**: `products`
- **Priority**: Custom (is_custom=true) → Default (is_custom=false) → Hardcoded fallback

### Implementation Steps
1. Add Supabase client to image analysis service
2. Create `_load_prompt_from_database()` method
3. Update analysis methods to use database prompts
4. Insert default prompts into database
5. Test with image-heavy PDFs
6. Deploy and monitor

### Estimated Effort
2-3 hours

---

## Admin UI for Prompt Management

### Features
1. **Visual Prompt Editor**
   - Markdown editor with syntax highlighting
   - Live preview of prompt formatting
   - Placeholder autocomplete
   - Template library

2. **Version History**
   - Track all prompt changes
   - Compare versions side-by-side
   - Rollback to previous versions
   - Change attribution (who/when)

3. **A/B Testing**
   - Create prompt variants
   - Split traffic between variants
   - Track performance metrics
   - Automatic winner selection

4. **Prompt Analytics**
   - Success rate by prompt version
   - Average processing time
   - Error rate tracking
   - Cost per prompt execution

### Implementation Steps
1. Create `/admin/prompts` page
2. Build prompt editor component
3. Add version history viewer
4. Implement A/B testing framework
5. Add analytics dashboard
6. Deploy and train admins

### Estimated Effort
1-2 weeks

---

## Total Estimated Effort

- **Phase 2**: 2-3 hours
- **Phase 3**: 1-2 hours
- **Phase 4**: 2-3 hours
- **Admin UI**: 1-2 weeks

**Total Development**: 5-8 hours (Phases 2-4) + 1-2 weeks (Admin UI)

---

## Benefits

### Immediate Benefits (Phases 2-4)
- ✅ All prompts database-driven (no code changes needed)
- ✅ Workspace-specific customization
- ✅ Version control for all prompts
- ✅ Consistent prompt management across platform

### Long-term Benefits (Admin UI)
- ✅ Non-technical admins can optimize prompts
- ✅ A/B testing for continuous improvement
- ✅ Data-driven prompt optimization
- ✅ Reduced development overhead

---

## Priority Recommendation

**High Priority**: Phases 2-4 (5-8 hours total)  
**Medium Priority**: Admin UI (1-2 weeks)

Phases 2-4 provide immediate value with minimal effort. Admin UI can be implemented later as a quality-of-life improvement.

