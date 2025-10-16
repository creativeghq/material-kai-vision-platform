# Phase 1: Foundation Implementation Guide

## Overview
Phase 1 focuses on establishing baseline metrics and implementing semantic coherence scoring for chunks.

## Current Status: IN PROGRESS

### Completed ✅
- Updated chunking configuration (1500/100/500/3000)
- Fixed MIVAA progress calculation
- Added layout-analysis step execution
- Fixed document naming
- Created document records in database
- Build verified and working

### In Progress 🔄
- Processing WIFI MOMO PDF with new config
- Measuring baseline metrics
- Implementing semantic coherence scoring

---

## Step 1: Process WIFI MOMO PDF

### Option A: Via Frontend UI
1. Navigate to PDF Processing page
2. Upload WIFI MOMO PDF (or use URL)
3. Monitor progress in modal
4. Wait for completion

### Option B: Via Script
```bash
# Set environment variables
export SUPABASE_KEY=your_key
export MIVAA_API_URL=http://localhost:8000

# Run baseline test
node scripts/test-pdf-processing-baseline.js
```

### Expected Results
- **Chunk Count**: 30-35 chunks for 40-page catalog
- **Average Size**: 1200-1500 characters
- **Processing Time**: < 5 minutes
- **Images Extracted**: 15-25 images

---

## Step 2: Measure Baseline Metrics

### Run Quality Metrics Script
```bash
export SUPABASE_KEY=your_key
node scripts/measure-chunk-quality.js
```

### Metrics Collected
1. **Chunk Metrics**
   - Total chunks
   - Size distribution
   - Coherence indicators
   - Metadata coverage

2. **Image Metrics**
   - Total images
   - Confidence distribution
   - Caption coverage
   - Page number tracking

3. **Quality Scores**
   - Chunk quality: % of chunks in optimal size range
   - Image quality: % of high-confidence images
   - Metadata coverage: % of chunks with document_name

---

## Step 3: Implement Semantic Coherence Scoring

### Database Setup
```bash
# Apply SQL migration to add quality metrics columns
# This adds:
# - coherence_score (decimal 0-1)
# - coherence_metrics (JSONB with detailed scores)
# - quality_assessment (text: Excellent/Very Good/Good/Fair/Acceptable/Poor)
# - quality_recommendations (text array)

# Execute via Supabase dashboard or CLI
psql -h db.supabase.co -U postgres -d postgres -f scripts/add-quality-metrics-columns.sql
```

### Service Integration
The `chunkQualityService.ts` provides:

```typescript
// Score a single chunk
const qualityData = chunkQualityService.scoreChunk(
  chunkId,
  content,
  metadata
);

// Update database
await chunkQualityService.updateChunkQuality(chunkId, qualityData);

// Calculate document-level metrics
await chunkQualityService.calculateDocumentQuality(documentId);
```

### Coherence Metrics Calculated
1. **Semantic Completeness** (25% weight)
   - Complete sentences
   - Paragraph structure
   - Proper boundaries

2. **Boundary Quality** (25% weight)
   - Ends at sentence boundary
   - Ends at paragraph boundary
   - Ends at section boundary

3. **Context Preservation** (20% weight)
   - Context references
   - Topic consistency
   - Word diversity

4. **Metadata Richness** (15% weight)
   - Required fields present
   - Additional metadata
   - Field completeness

5. **Structural Integrity** (15% weight)
   - Heading preservation
   - List preservation
   - Code block preservation
   - Table preservation

---

## Step 4: Integrate into PDF Workflow

### Location: `src/services/consolidatedPDFWorkflowService.ts`

After storing chunks (around line 1200), add:

```typescript
// Score chunk quality
const qualityData = chunkQualityService.scoreChunk(
  chunkId,
  content,
  metadata
);

// Update chunk with quality metrics
await chunkQualityService.updateChunkQuality(chunkId, qualityData);

// Track quality in job metadata
job.metadata.qualityMetrics = job.metadata.qualityMetrics || [];
job.metadata.qualityMetrics.push({
  chunkId,
  coherenceScore: qualityData.coherence_score,
  assessment: qualityData.quality_assessment,
});
```

### Update Quality Assessment Step
Modify the 'quality-assessment' step to:
1. Calculate document-level metrics
2. Generate quality report
3. Store in database
4. Return summary to UI

---

## Step 5: Validation & Testing

### Test Checklist
- [ ] Upload WIFI MOMO PDF
- [ ] Verify chunks have coherence_score
- [ ] Check coherence_metrics JSONB structure
- [ ] Verify quality_assessment values
- [ ] Check quality_recommendations array
- [ ] Validate document_quality_metrics table
- [ ] Test with multiple PDFs

### Expected Quality Scores
- **Excellent** (0.9-1.0): Well-structured, complete chunks
- **Very Good** (0.8-0.9): Good structure, minor issues
- **Good** (0.7-0.8): Acceptable quality
- **Fair** (0.6-0.7): Some quality issues
- **Acceptable** (0.5-0.6): Needs improvement
- **Poor** (<0.5): Significant issues

---

## Step 6: Monitoring & Reporting

### Dashboard Queries
```sql
-- Get average coherence by document
SELECT 
  d.title,
  AVG(dc.coherence_score) as avg_coherence,
  COUNT(*) as chunk_count
FROM documents d
JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.title
ORDER BY avg_coherence DESC;

-- Get low-quality chunks
SELECT 
  dc.id,
  dc.content,
  dc.coherence_score,
  dc.quality_assessment,
  dc.quality_recommendations
FROM document_chunks dc
WHERE dc.coherence_score < 0.6
ORDER BY dc.coherence_score ASC;

-- Get document quality summary
SELECT 
  d.title,
  dqm.average_coherence_score,
  dqm.chunks_with_high_coherence,
  dqm.chunks_with_low_coherence,
  dqm.quality_assessment
FROM documents d
JOIN document_quality_metrics dqm ON d.id = dqm.document_id
ORDER BY dqm.average_coherence_score DESC;
```

---

## Files Created/Modified

### New Files
- `scripts/test-pdf-processing-baseline.js` - Baseline metrics collection
- `scripts/measure-chunk-quality.js` - Quality metrics measurement
- `scripts/semantic-coherence-scorer.ts` - Coherence scoring logic
- `scripts/add-quality-metrics-columns.sql` - Database migration
- `src/services/chunkQualityService.ts` - Quality service integration

### Modified Files
- `src/services/consolidatedPDFWorkflowService.ts` - Will integrate quality scoring

---

## Next Steps

1. **Execute Database Migration**
   - Apply SQL migration to add quality columns
   - Verify new tables and indexes created

2. **Process Test PDF**
   - Upload WIFI MOMO PDF
   - Collect baseline metrics
   - Document results

3. **Integrate Quality Scoring**
   - Add chunkQualityService to workflow
   - Score all chunks during processing
   - Store metrics in database

4. **Validate Results**
   - Query database for quality metrics
   - Verify coherence scores
   - Check recommendations

5. **Move to Phase 2**
   - Implement embedding stability metrics
   - Add context-aware embeddings
   - Build chunk relationship graph

---

## Success Criteria

✅ Baseline metrics collected and documented  
✅ Semantic coherence scoring implemented  
✅ Quality metrics stored in database  
✅ Document-level aggregation working  
✅ All chunks have coherence scores  
✅ Quality assessment visible in UI  
✅ Recommendations generated for low-quality chunks  

---

## Troubleshooting

### Issue: Low coherence scores
**Solution**: Review chunk boundaries, ensure proper metadata, check for incomplete sentences

### Issue: Missing metadata
**Solution**: Verify document_name is being set during chunk creation

### Issue: Database migration fails
**Solution**: Check Supabase permissions, ensure authenticated role has access

### Issue: Performance degradation
**Solution**: Add indexes on coherence_score, batch quality calculations

---

## Performance Targets

- Coherence scoring: < 100ms per chunk
- Database updates: < 50ms per chunk
- Document aggregation: < 1s for 100 chunks
- Overall quality assessment step: < 30s

---

## References

- Chunking Configuration: `docs/PENDING_TASKS.md`
- Quality Metrics Schema: `scripts/add-quality-metrics-columns.sql`
- Service Implementation: `src/services/chunkQualityService.ts`
- Baseline Metrics: `scripts/measure-chunk-quality.js`

