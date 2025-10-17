# PHASE 2 STEP 2: IMPLEMENT STORAGE - TIER 2 PLAN

**Date**: 2025-10-16  
**Status**: ANALYSIS COMPLETE  
**Tier**: IMPORTANT (6 functions)

---

## 📊 TIER 2 FUNCTIONS ANALYSIS

### 1. ❌ spaceformer-analysis - NEEDS FIX
**Location**: `supabase/functions/spaceformer-analysis/index.ts`  
**Status**: WRONG TABLE - NEEDS FIX

**Current Issue**:
- Tries to store in `spatial_analysis` table (doesn't exist)
- Should store in `spaceformer_analysis_results` table

**Current Storage** (lines 550-572):
```typescript
private async createAnalysisRecord(analysisId: string, request: SpaceFormerRequest): Promise<void> {
  const { error } = await supabase
    .from('spatial_analysis')  // ❌ WRONG TABLE
    .insert({
      id: analysisId,
      user_id: request.user_id,
      nerf_reconstruction_id: request.nerf_reconstruction_id,
      room_type: request.room_type,
      room_dimensions: request.room_dimensions || {},
      status: 'processing',
    });
}
```

**Fix Required**:
- Change table from `spatial_analysis` to `spaceformer_analysis_results`
- Update schema to match new table structure
- Store: user_id, input_data (JSONB), result_data (JSONB), confidence_score, processing_time_ms

---

### 2. ✅ visual-search-analyze - ALREADY HAS STORAGE
**Location**: `supabase/functions/visual-search-analyze/index.ts`  
**Status**: ALREADY IMPLEMENTED ✅

**Current Storage**:
- Stores in `material_visual_analysis` table
- Returns record_id in response
- Status: VERIFIED WORKING

---

### 3. ❌ svbrdf-extractor - NEEDS STORAGE
**Location**: `supabase/functions/svbrdf-extractor/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Creates `processingRecord` but doesn't store final results
- Returns results without storing

**Storage Target**: `svbrdf_extraction_results` table

**What to Store**:
- user_id
- input_data (JSONB - imageUrl, workspaceId)
- result_data (JSONB - material_properties, texture_maps, confidence_score)
- confidence_score
- processing_time_ms

---

### 4. ❌ material-recognition - NEEDS STORAGE
**Location**: `supabase/functions/material-recognition/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Performs recognition but doesn't store results
- Returns results directly

**Storage Target**: `recognition_results` table (already exists)

**What to Store**:
- file_id
- material_id
- confidence_score
- detection_method
- ai_model_version
- properties_detected (JSONB)
- processing_time_ms
- user_verified
- embedding

---

### 5. ❌ ocr-processing - NEEDS STORAGE
**Location**: `supabase/functions/ocr-processing/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Performs OCR but doesn't store results
- Returns results directly

**Storage Target**: `ocr_results` table (newly created)

**What to Store**:
- user_id
- file_id
- extracted_text
- confidence_score
- processing_time_ms

---

### 6. ❌ voice-to-material - NEEDS STORAGE
**Location**: `supabase/functions/voice-to-material/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Processes voice input but doesn't store results
- Returns results directly

**Storage Target**: `voice_conversion_results` table (newly created)

**What to Store**:
- user_id
- input_data (JSONB - audio_data, language)
- result_data (JSONB - recognized_materials, confidence_scores)
- confidence_score
- processing_time_ms

---

## 🔧 IMPLEMENTATION PRIORITY

1. **spaceformer-analysis** - Fix wrong table (5 min)
2. **svbrdf-extractor** - Add storage (15 min)
3. **material-recognition** - Add storage (15 min)
4. **ocr-processing** - Add storage (15 min)
5. **voice-to-material** - Add storage (15 min)
6. **visual-search-analyze** - Verify (5 min)

**Total Estimated Time**: 1-1.5 hours

---

## 📋 IMPLEMENTATION STEPS

### Step 1: Fix spaceformer-analysis
- Change table name from `spatial_analysis` to `spaceformer_analysis_results`
- Update schema to use JSONB fields
- Update `updateAnalysisRecord` to store final results

### Step 2: Add storage to svbrdf-extractor
- Add storage call before return statement
- Store extraction results with confidence and processing time

### Step 3: Add storage to material-recognition
- Add storage call before return statement
- Store recognition results with confidence and method

### Step 4: Add storage to ocr-processing
- Add storage call before return statement
- Store OCR results with confidence and processing time

### Step 5: Add storage to voice-to-material
- Add storage call before return statement
- Store voice conversion results with confidence and processing time

### Step 6: Verify visual-search-analyze
- Confirm storage is working correctly
- Check that record_id is returned

---

## ✨ SUCCESS CRITERIA

- [ ] spaceformer-analysis uses correct table
- [ ] svbrdf-extractor stores all results
- [ ] material-recognition stores all results
- [ ] ocr-processing stores all results
- [ ] voice-to-material stores all results
- [ ] visual-search-analyze verified working
- [ ] All functions return storage IDs
- [ ] Error handling for storage failures

---

## 🚀 NEXT STEPS

1. Implement storage fixes in all 6 functions
2. Test each function
3. Move to Tier 3

---

**Status**: READY TO IMPLEMENT  
**Estimated Time**: 1-1.5 hours

