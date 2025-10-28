# AI Services Integration Guide

**Date**: October 27, 2025  
**Purpose**: Guide for integrating new AI services into the PDF processing pipeline

---

## 📋 **OVERVIEW**

This guide explains how to integrate the 7 new AI services into the existing PDF processing workflow.

---

## 🔧 **SERVICES TO INTEGRATE**

### **Phase 1 Services**
1. **ConfidenceThresholds** - Configuration for confidence-based routing
2. **EscalationEngine** - Intelligent model escalation

### **Phase 2 Services**
3. **DocumentClassifier** - Two-stage content classification
4. **BoundaryDetector** - Product boundary detection
5. **ProductValidator** - Product quality validation

### **Phase 3 Services**
6. **GPT5Service** - OpenAI GPT-5 integration

### **Phase 4 Services**
7. **ConsensusValidator** - Multi-model consensus validation

---

## 🚀 **INTEGRATION STEPS**

### **Step 1: Update PDF Processor**

**File**: `mivaa-pdf-extractor/app/services/pdf_processor.py`

**Changes Needed**:

```python
from app.services.document_classifier import DocumentClassifier
from app.services.boundary_detector import BoundaryDetector
from app.services.product_validator import ProductValidator
from app.services.escalation_engine import EscalationEngine
from app.config.confidence_thresholds import ConfidenceThresholds

class PDFProcessor:
    def __init__(self):
        # ... existing code ...
        self.document_classifier = DocumentClassifier()
        self.boundary_detector = BoundaryDetector()
        self.product_validator = ProductValidator()
        self.escalation_engine = EscalationEngine()
    
    async def process_pdf(self, pdf_path, job_id):
        # 1. Extract text and images (existing)
        pages = await self.extract_pages(pdf_path)
        
        # 2. NEW: Classify content before chunking
        classified_pages = []
        for page in pages:
            classification = await self.document_classifier.classify_content(
                content=page['text'],
                context={'page_number': page['number'], 'has_images': len(page['images']) > 0},
                job_id=job_id
            )
            page['classification'] = classification
            classified_pages.append(page)
        
        # 3. Create chunks (existing, but now classification-aware)
        chunks = await self.create_chunks(classified_pages)
        
        # 4. NEW: Detect product boundaries
        boundaries = await self.boundary_detector.detect_boundaries(
            chunks=chunks,
            job_id=job_id
        )
        
        # 5. NEW: Group chunks by product
        product_groups = await self.boundary_detector.group_chunks_by_product(
            chunks=chunks,
            boundaries=boundaries
        )
        
        # 6. Extract products from groups
        products = []
        for group in product_groups:
            product = await self.extract_product_from_chunks(group, job_id)
            
            # 7. NEW: Validate product
            validation = await self.product_validator.validate_product(
                product_data=product,
                chunks=group,
                images=product.get('images', [])
            )
            
            if validation['passed']:
                products.append(product)
            else:
                logger.warning(f"Product failed validation: {validation}")
        
        return {
            'chunks': chunks,
            'products': products,
            'boundaries': boundaries,
            'classifications': [p['classification'] for p in classified_pages]
        }
```

---

### **Step 2: Update Material Classifier with Escalation**

**File**: `mivaa-pdf-extractor/app/services/enhanced_material_classifier.py`

**Changes Needed**:

```python
from app.services.escalation_engine import EscalationEngine
from app.config.confidence_thresholds import ConfidenceThresholds

class EnhancedMaterialClassifier:
    def __init__(self):
        # ... existing code ...
        self.escalation_engine = EscalationEngine()
    
    async def classify_material(self, content, job_id):
        # Define classification function
        async def classify_with_model(model, data):
            # Your existing classification logic
            result = await self._classify_internal(data['content'], model)
            return result
        
        # Use escalation engine
        result = await self.escalation_engine.execute_with_escalation(
            task_type='material_classification',
            task_function=classify_with_model,
            task_data={'content': content},
            initial_model='llama-4-scout-17b',
            job_id=job_id,
            max_attempts=3
        )
        
        if result['success']:
            return result['result']
        else:
            # Fallback to existing logic
            return await self._classify_internal(content, 'llama-4-scout-17b')
```

---

### **Step 3: Update Product Creation with Consensus**

**File**: `mivaa-pdf-extractor/app/services/product_creation_service.py`

**Changes Needed**:

```python
from app.services.consensus_validator import ConsensusValidator

class ProductCreationService:
    def __init__(self):
        # ... existing code ...
        self.consensus_validator = ConsensusValidator()
    
    async def extract_product_name(self, content, job_id):
        # Check if this is a critical task
        if ConsensusValidator.is_critical_task('product_name_extraction'):
            # Use consensus validation
            result = await self.consensus_validator.validate_critical_extraction(
                content=content,
                extraction_type='product_name',
                job_id=job_id
            )
            
            if result['success']:
                if result['needs_human_review']:
                    # Flag for review
                    logger.warning(f"Product name extraction needs review: {result}")
                
                return result['result']['extracted_value']
        
        # Fallback to existing logic
        return await self._extract_name_internal(content)
```

---

### **Step 4: Add GPT-5 for Complex Tasks**

**File**: `mivaa-pdf-extractor/app/services/product_enrichment_service.py`

**Changes Needed**:

```python
from app.services.gpt5_service import GPT5Service
from app.config.confidence_thresholds import ConfidenceThresholds

class ProductEnrichmentService:
    def __init__(self):
        # ... existing code ...
        self.gpt5 = GPT5Service()
    
    async def enrich_product(self, product_data, job_id):
        # Try with Claude first
        result = await self._enrich_with_claude(product_data)
        
        confidence = result.get('confidence_score', 0.0)
        
        # Check if we should escalate to GPT-5
        if ConfidenceThresholds.should_escalate('product_enrichment', confidence):
            logger.info(f"Escalating to GPT-5 (confidence: {confidence:.2f})")
            
            # Use GPT-5 for complex analysis
            gpt5_result = await self.gpt5.analyze_complex_content(
                content=str(product_data),
                analysis_type='product_extraction',
                job_id=job_id
            )
            
            if gpt5_result['success']:
                return gpt5_result['data']
        
        return result
```

---

### **Step 5: Create New API Endpoints**

**File**: `mivaa-pdf-extractor/app/api/ai_services_routes.py` (NEW)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.document_classifier import DocumentClassifier
from app.services.boundary_detector import BoundaryDetector
from app.services.product_validator import ProductValidator
from app.services.consensus_validator import ConsensusValidator

router = APIRouter(prefix="/api/v1/ai-services", tags=["AI Services"])

# Initialize services
document_classifier = DocumentClassifier()
boundary_detector = BoundaryDetector()
product_validator = ProductValidator()
consensus_validator = ConsensusValidator()


class ClassifyRequest(BaseModel):
    content: str
    context: Optional[Dict[str, Any]] = None
    job_id: Optional[str] = None


@router.post("/classify-document")
async def classify_document(request: ClassifyRequest):
    """Classify document content."""
    result = await document_classifier.classify_content(
        content=request.content,
        context=request.context,
        job_id=request.job_id
    )
    return result


class DetectBoundariesRequest(BaseModel):
    chunks: List[Dict[str, Any]]
    job_id: Optional[str] = None


@router.post("/detect-boundaries")
async def detect_boundaries(request: DetectBoundariesRequest):
    """Detect product boundaries in chunks."""
    boundaries = await boundary_detector.detect_boundaries(
        chunks=request.chunks,
        job_id=request.job_id
    )
    return {"boundaries": boundaries}


class ValidateProductRequest(BaseModel):
    product_data: Dict[str, Any]
    chunks: List[Dict[str, Any]]
    images: Optional[List[Dict[str, Any]]] = None


@router.post("/validate-product")
async def validate_product(request: ValidateProductRequest):
    """Validate product extraction."""
    validation = await product_validator.validate_product(
        product_data=request.product_data,
        chunks=request.chunks,
        images=request.images
    )
    return validation


class ConsensusValidateRequest(BaseModel):
    content: str
    extraction_type: str
    job_id: Optional[str] = None


@router.post("/consensus-validate")
async def consensus_validate(request: ConsensusValidateRequest):
    """Validate extraction using consensus."""
    result = await consensus_validator.validate_critical_extraction(
        content=request.content,
        extraction_type=request.extraction_type,
        job_id=request.job_id
    )
    return result
```

**Register routes in main.py**:

```python
from app.api import ai_services_routes

app.include_router(ai_services_routes.router)
```

---

### **Step 6: Update Environment Variables**

**File**: `.env`

Add GPT-5 API key:

```bash
# OpenAI API Key (for GPT-5)
OPENAI_API_KEY=your_openai_api_key_here
```

---

## 🧪 **TESTING INTEGRATION**

### **Test 1: Document Classification**

```python
# Test script
from app.services.document_classifier import DocumentClassifier

classifier = DocumentClassifier()

content = """
HARMONY FOLD
Dimensions: 15×38 cm
Designer: ESTUDI{H}AC
Material: Porcelain
"""

result = await classifier.classify_content(content)
print(f"Type: {result['content_type']}")
print(f"Confidence: {result['confidence']:.2f}")
print(f"Is Product: {result['is_product']}")
```

### **Test 2: Boundary Detection**

```python
from app.services.boundary_detector import BoundaryDetector

detector = BoundaryDetector()

chunks = [
    {"content": "Product A specifications...", "metadata": {"page_number": 1}},
    {"content": "Product A features...", "metadata": {"page_number": 1}},
    {"content": "Product B specifications...", "metadata": {"page_number": 2}},
]

boundaries = await detector.detect_boundaries(chunks)
print(f"Found {len(boundaries)} boundaries")
```

### **Test 3: Escalation Engine**

```python
from app.services.escalation_engine import EscalationEngine

engine = EscalationEngine()

async def classify_task(model, data):
    # Simulate classification
    return {
        "success": True,
        "result": "material_type",
        "confidence_score": 0.65  # Low confidence
    }

result = await engine.execute_with_escalation(
    task_type='material_classification',
    task_function=classify_task,
    task_data={'content': 'test'},
    initial_model='llama-4-scout-17b'
)

print(f"Escalations: {result['escalation_count']}")
print(f"Final model: {result['model_used']}")
```

---

## 📊 **MONITORING & METRICS**

### **Key Metrics to Track**

1. **Escalation Rate**: % of tasks that escalate
2. **Consensus Agreement**: Average agreement score
3. **Validation Pass Rate**: % of products that pass validation
4. **Cost per PDF**: Average AI cost per document
5. **Processing Time**: Average time per PDF

### **Dashboard Queries**

```sql
-- Escalation rate
SELECT 
    COUNT(*) FILTER (WHERE action = 'escalate') * 100.0 / COUNT(*) as escalation_rate
FROM ai_call_logs
WHERE created_at > NOW() - INTERVAL '7 days';

-- Average consensus agreement
SELECT 
    AVG((metadata->>'agreement_score')::float) as avg_agreement
FROM ai_call_logs
WHERE task LIKE '%consensus%'
AND created_at > NOW() - INTERVAL '7 days';

-- Cost breakdown by model
SELECT 
    model,
    COUNT(*) as calls,
    SUM(cost) as total_cost,
    AVG(cost) as avg_cost
FROM ai_call_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY model
ORDER BY total_cost DESC;
```

---

## 🎯 **SUCCESS CRITERIA**

- ✅ All services integrated into PDF pipeline
- ✅ API endpoints working
- ✅ Escalation logic functioning
- ✅ Consensus validation for critical tasks
- ✅ Product validation reducing false positives
- ✅ Cost tracking and optimization
- ✅ Comprehensive logging

---

**Integration complete when all tests pass and Harmony PDF extracts 14+ products with high quality!** 🚀

