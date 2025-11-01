# Category-Based Extraction: Implementation Roadmap

## Executive Summary

This document provides a **complete implementation roadmap** for converting the PDF extraction pipeline from boolean `focused_extraction` to a **category-based system** that supports:

- ✅ Multiple extraction categories (products, certificates, logos, specifications)
- ✅ NLP-based prompts from agents
- ✅ Consistency across all processing stages
- ✅ Metafield extraction for ANY category
- ✅ Admin panel configuration

---

## Phase 1: API Endpoint Consolidation (Week 1)

### **Objective**: Unify upload endpoints and add category support

### **Changes Required**

#### **1. Create New Unified Endpoint**

**File**: `mivaa-pdf-extractor/app/api/rag_routes.py`

```python
@router.post("/documents/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    categories: str = Form("products"),
    discovery_model: str = Form("claude"),
    custom_prompt: Optional[str] = Form(None),
    # Backward compatibility
    focused_extraction: Optional[bool] = Form(None),
    extract_categories: Optional[str] = Form(None),
):
    """
    Upload PDF with category-based extraction.
    
    Categories: 'products', 'certificates', 'logos', 'specifications', 'all'
    """
    
    # Convert old parameters to new format
    if focused_extraction is not None or extract_categories is not None:
        if extract_categories:
            categories = extract_categories
        elif not focused_extraction:
            categories = "all"
    
    # Parse custom prompt if provided
    if custom_prompt:
        categories = await parse_extraction_prompt(custom_prompt)
    
    # Parse categories string to list
    categories_list = [c.strip().lower() for c in categories.split(',')]
    
    # Start background processing
    background_tasks.add_task(
        process_document_with_categories,
        job_id, document_id, file_content, file.filename,
        title, description, document_tags,
        discovery_model, categories_list, custom_prompt,
        chunk_size, chunk_overlap, workspace_id
    )
```

#### **2. Deprecate Old Endpoints**

- Mark `/documents/upload-with-discovery` as deprecated
- Mark `/documents/upload-focused` as deprecated
- Add deprecation warnings in logs
- Redirect to new `/documents/upload` endpoint

#### **3. Add NLP Prompt Parser**

**File**: `mivaa-pdf-extractor/app/services/nlp_prompt_parser.py` (NEW)

```python
async def parse_extraction_prompt(prompt: str) -> List[str]:
    """Parse NLP prompt to extract categories"""
    
    # Use Claude to parse natural language
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""
            Parse this extraction request and return ONLY a JSON array of categories.
            
            Valid categories: "products", "certificates", "logos", "specifications", "all"
            
            Request: "{prompt}"
            
            Return ONLY: ["category1", "category2"]
            """
        }]
    )
    
    # Extract and parse JSON
    content = response.content[0].text.strip()
    try:
        categories = json.loads(content)
        return categories if isinstance(categories, list) else ["products"]
    except:
        # Fallback to keyword matching
        return fallback_parse_prompt(prompt)
```

### **Testing**

```bash
# Test 1: Products only
curl -X POST "http://localhost:8000/api/rag/documents/upload" \
  -F "file=@harmony.pdf" \
  -F "categories=products"

# Test 2: Multiple categories
curl -X POST "http://localhost:8000/api/rag/documents/upload" \
  -F "file=@harmony.pdf" \
  -F "categories=products,certificates"

# Test 3: NLP prompt
curl -X POST "http://localhost:8000/api/rag/documents/upload" \
  -F "file=@harmony.pdf" \
  -F "custom_prompt=extract products and environmental certifications"

# Test 4: Backward compatibility
curl -X POST "http://localhost:8000/api/rag/documents/upload" \
  -F "file=@harmony.pdf" \
  -F "focused_extraction=true" \
  -F "extract_categories=products"
```

---

## Phase 2: Product Discovery Service (Week 2)

### **Objective**: Update discovery to identify all categories

### **Changes Required**

#### **1. Update Claude Prompt**

**File**: `mivaa-pdf-extractor/app/services/product_discovery_service.py`

```python
async def _build_discovery_prompt(
    pdf_text: str,
    total_pages: int,
    categories: List[str],
    custom_prompt: Optional[str]
) -> str:
    """Build Claude prompt for category-based discovery"""
    
    category_instructions = {
        "products": "Identify product pages with name, designer, dimensions, variants, metafields",
        "certificates": "Identify certification pages with type, dates, certifying body",
        "logos": "Identify logo/branding pages with name, type, color",
        "specifications": "Identify specification pages with title, technical details"
    }
    
    instructions = ""
    for category in categories:
        if category in category_instructions:
            instructions += f"\n{category.upper()}:\n{category_instructions[category]}"
    
    if custom_prompt:
        instructions = f"Custom request: {custom_prompt}\n\n{instructions}"
    
    prompt = f"""
    Analyze this PDF catalog and identify content by categories: {', '.join(categories)}
    
    {instructions}
    
    Return JSON with:
    - products: [...]
    - certificates: [...]
    - logos: [...]
    - specifications: [...]
    - page_classification: {{page_num: category}}
    - metafield_categories: {{category: [metafields]}}
    
    PDF TEXT:
    {pdf_text[:50000]}
    """
    
    return prompt
```

#### **2. Create Enhanced Catalog Classes**

```python
@dataclass
class CertificateInfo:
    name: str
    type: str  # EPD, LEED, FSC, etc.
    page_range: List[int]
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    certifying_body: Optional[str] = None
    metafields: Dict[str, Any] = None

@dataclass
class LogoInfo:
    name: str
    page_range: List[int]
    logo_type: Optional[str] = None
    color: Optional[str] = None
    brand_name: Optional[str] = None
    metafields: Dict[str, Any] = None

@dataclass
class SpecificationInfo:
    title: str
    page_range: List[int]
    spec_type: Optional[str] = None
    content: Optional[str] = None
    metafields: Dict[str, Any] = None

@dataclass
class EnhancedProductCatalog:
    products: List[ProductInfo]
    certificates: List[CertificateInfo]
    logos: List[LogoInfo]
    specifications: List[SpecificationInfo]
    page_classification: Dict[int, str]
    metafield_categories: Dict[str, List[str]]
    total_pages: int
    total_images: int
    processing_time_ms: float
    model_used: str
    confidence_score: float
```

### **Testing**

```bash
# Test discovery with multiple categories
python -c "
from app.services.product_discovery_service import discover_products_by_categories
import asyncio

result = asyncio.run(discover_products_by_categories(
    pdf_text='...',
    total_pages=11,
    categories=['products', 'certificates'],
    discovery_model='claude'
))

print(f'Products: {len(result.products)}')
print(f'Certificates: {len(result.certificates)}')
print(f'Page classification: {result.page_classification}')
"
```

---

## Phase 3: Processing Pipeline (Week 3)

### **Objective**: Update all stages to use categories

### **Changes Required**

#### **1. Stage 1: Build Pages to Process**

```python
async def build_pages_to_process(
    catalog: EnhancedProductCatalog,
    categories: List[str],
    total_pages: int
) -> Tuple[Set[int], Dict[int, str]]:
    """Build pages_to_process based on categories"""
    
    pages_to_process = set()
    page_to_category = {}
    
    for category in categories:
        if category == "all":
            pages_to_process = set(range(1, total_pages + 1))
            for page_num in pages_to_process:
                page_to_category[page_num] = catalog.page_classification.get(page_num, "unknown")
            break
        
        elif category == "products":
            for product in catalog.products:
                pages_to_process.update(product.page_range)
                for page in product.page_range:
                    page_to_category[page] = "product"
        
        elif category == "certificates":
            for cert in catalog.certificates:
                pages_to_process.update(cert.page_range)
                for page in cert.page_range:
                    page_to_category[page] = "certificate"
        
        # ... similar for logos and specifications
    
    return pages_to_process, page_to_category
```

#### **2. Stage 2: Chunking with Categories**

```python
# When saving chunks
chunk_record = {
    'id': chunk_id,
    'document_id': document_id,
    'content': chunk_text,
    'page_number': page_num,
    'category': page_to_category.get(page_num, 'unknown'),  # NEW
    'metadata': {
        'category': page_to_category.get(page_num, 'unknown'),
        'categories_requested': categories,
    }
}
```

#### **3. Stage 3: Images with Categories**

```python
# When saving images
image_record = {
    'id': image_id,
    'document_id': document_id,
    'image_url': storage_url,
    'page_number': page_num,
    'category': page_to_category.get(page_num, 'unknown'),  # NEW
    'metadata': {
        'category': page_to_category.get(page_num, 'unknown'),
        'categories_requested': categories,
    }
}
```

#### **4. Stage 4: Entity Creation**

```python
# Create products
for product in catalog.products:
    if "products" in categories or "all" in categories:
        product_record = {
            'id': product_id,
            'name': product.name,
            'category': 'product',
            # ... other fields
        }
        supabase.client.table('products').insert(product_record).execute()

# Create certificates
for cert in catalog.certificates:
    if "certificates" in categories or "all" in categories:
        cert_record = {
            'id': cert_id,
            'name': cert.name,
            'type': cert.type,
            'category': 'certificate',
            # ... other fields
        }
        supabase.client.table('certificates').insert(cert_record).execute()

# ... similar for logos and specifications
```

### **Testing**

```bash
# Test consistency across stages
python -c "
from app.services.extraction_service import validate_extraction_consistency

result = validate_extraction_consistency(
    document_id='test-doc',
    categories=['products', 'certificates']
)

print(f'✅ Consistency validated: {result}')
"
```

---

## Phase 4: Metafield Extraction (Week 4)

### **Objective**: Support metafields for ANY category

### **Changes Required**

#### **1. Create Metafield Tables**

```sql
CREATE TABLE certificate_metafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificates(id),
    field_id UUID NOT NULL REFERENCES metafields(id),
    value_text VARCHAR(1000),
    confidence_score FLOAT DEFAULT 0.8,
    extraction_method VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Similar for logos and specifications
```

#### **2. Ensure Metafields Exist**

```python
async def ensure_metafields_exist(
    metafield_names: List[str],
    category: str,
    workspace_id: str
):
    """Create metafield records if they don't exist"""
    
    for name in metafield_names:
        existing = supabase.client.table('metafields').select('*').eq(
            'name', name
        ).eq('workspace_id', workspace_id).execute()
        
        if not existing.data:
            metafield = {
                'id': str(uuid4()),
                'workspace_id': workspace_id,
                'name': name,
                'type': 'text',
                'category': category,
                'metadata': {
                    'auto_created': True,
                    'created_from_extraction': True,
                    'discovered_category': category
                }
            }
            supabase.client.table('metafields').insert(metafield).execute()
```

#### **3. Link Metafields to Entities**

```python
async def link_metafields_by_category(
    catalog: EnhancedProductCatalog,
    categories: List[str],
    document_id: str
):
    """Link metafields to all extracted entities"""
    
    # For products
    if "products" in categories or "all" in categories:
        for product in catalog.products:
            await link_product_metafields(product, document_id)
    
    # For certificates
    if "certificates" in categories or "all" in categories:
        for cert in catalog.certificates:
            await link_certificate_metafields(cert, document_id)
    
    # ... similar for logos and specifications
```

### **Testing**

```bash
# Test metafield extraction
python -c "
from app.services.metafield_service import link_metafields_by_category

result = link_metafields_by_category(
    catalog=catalog,
    categories=['products', 'certificates'],
    document_id='test-doc'
)

print(f'✅ Metafields linked: {result}')
"
```

---

## Phase 5: Admin Panel & Migration (Week 5)

### **Objective**: Admin configuration and deprecation

### **Changes Required**

#### **1. Admin Endpoints**

```python
@router.get("/admin/extraction-config")
async def get_extraction_config():
    """Get extraction configuration"""
    return {
        "enabled_categories": ["products", "certificates", "logos", "specifications"],
        "default_categories": ["products"],
        "discovery_models": ["claude", "gpt"],
        "metafield_categories": {...}
    }

@router.put("/admin/extraction-config")
async def update_extraction_config(config: ExtractionConfig):
    """Update extraction configuration"""
    # Save to database
    pass

@router.get("/admin/extraction-history")
async def get_extraction_history(category: Optional[str] = None, limit: int = 20):
    """Get extraction history"""
    pass
```

#### **2. Deprecation Warnings**

```python
# In old endpoints
logger.warning(
    f"DEPRECATED: /documents/upload-with-discovery is deprecated. "
    f"Use /documents/upload with categories parameter instead."
)
```

#### **3. Migration Script**

```python
# Script to migrate old jobs to new format
async def migrate_old_jobs():
    """Migrate old focused_extraction jobs to categories format"""
    
    old_jobs = supabase.client.table('background_jobs').select('*').eq(
        'status', 'completed'
    ).execute()
    
    for job in old_jobs.data:
        metadata = job['metadata']
        
        # Convert old format to new
        if 'focused_extraction' in metadata:
            if metadata['focused_extraction']:
                metadata['categories'] = ['products']
            else:
                metadata['categories'] = ['all']
            
            del metadata['focused_extraction']
            
            # Update job
            supabase.client.table('background_jobs').update({
                'metadata': metadata
            }).eq('id', job['id']).execute()
```

---

## Success Criteria

### **Functional**
✅ All API endpoints updated to use categories  
✅ NLP prompts supported from agents  
✅ Metafields extracted for ANY category  
✅ Admin panel configurable  
✅ Backward compatible during migration  

### **Quality**
✅ No debug issues when `categories=["all"]`  
✅ Consistency validated across all stages  
✅ All tests passing  
✅ Documentation complete  

### **Performance**
✅ Same processing speed as before  
✅ No additional database queries  
✅ Efficient metafield creation  

---

## Rollback Plan

If issues arise:

1. **Keep old endpoints active** during migration
2. **Monitor error rates** for new endpoint
3. **Revert to old endpoint** if needed
4. **Fix issues** and re-deploy
5. **Gradual migration** of users to new endpoint

---

## Next Steps

1. **Review** this roadmap with team
2. **Assign** developers to each phase
3. **Create** GitHub issues for each phase
4. **Start** Phase 1 implementation
5. **Test** thoroughly before moving to next phase
6. **Deploy** to production after all phases complete

