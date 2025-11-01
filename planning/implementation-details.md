# Category-Based Extraction: Implementation Details

## Overview

This document provides step-by-step implementation details for converting the PDF extraction pipeline from boolean `focused_extraction` to category-based extraction.

---

## Part 1: API Endpoint Changes

### **Current Endpoints**

```python
# ENDPOINT 1: /documents/upload-with-discovery
POST /api/rag/documents/upload-with-discovery
{
    "file": "catalog.pdf",
    "focused_extraction": true,
    "extract_categories": "products"
}

# ENDPOINT 2: /documents/upload-focused
POST /api/rag/documents/upload-focused
{
    "file": "catalog.pdf",
    "product_name": "NOVA",
    "designer": "SG NY"
}
```

### **New Unified Endpoint**

```python
@router.post("/documents/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    categories: str = Form("products", 
        description="Categories to extract: 'products', 'certificates', 'logos', 'specifications', 'all'"),
    discovery_model: str = Form("claude", 
        description="AI model: 'claude' or 'gpt'"),
    custom_prompt: Optional[str] = Form(None,
        description="Custom NLP prompt: 'extract products and certificates'"),
    # Backward compatibility
    focused_extraction: Optional[bool] = Form(None),
    extract_categories: Optional[str] = Form(None),
):
    """
    Upload PDF with intelligent category-based extraction.
    
    Categories:
    - 'products': Product pages only
    - 'certificates': Certification pages only
    - 'logos': Logo/branding pages only
    - 'specifications': Technical specification pages only
    - 'all': All content
    - Multiple: 'products,certificates' (comma-separated)
    
    Custom Prompt (NLP):
    - 'extract products and certificates'
    - 'get all logos and certifications'
    - 'find product specifications'
    """
    
    # Backward compatibility: convert old parameters
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

### **Deprecation Path**

**Phase 1 (Current)**:
- Keep both old endpoints
- Add new `/documents/upload` endpoint
- Support both old and new parameters

**Phase 2 (Next Release)**:
- Mark old endpoints as deprecated
- Log warnings when used
- Redirect to new endpoint

**Phase 3 (Future)**:
- Remove old endpoints
- Remove backward compatibility code

---

## Part 2: Background Task Function

### **Current Function Signature**

```python
async def process_document_with_discovery(
    job_id: str,
    document_id: str,
    file_content: bytes,
    filename: str,
    title: str,
    description: str,
    document_tags: List[str],
    discovery_model: str,
    focused_extraction: bool,
    extract_categories: List[str],
    chunk_size: int,
    chunk_overlap: int,
    workspace_id: str,
):
```

### **New Function Signature**

```python
async def process_document_with_categories(
    job_id: str,
    document_id: str,
    file_content: bytes,
    filename: str,
    title: str,
    description: str,
    document_tags: List[str],
    discovery_model: str,
    categories: List[str],  # ["products", "certificates", "logos"]
    custom_prompt: Optional[str],
    chunk_size: int,
    chunk_overlap: int,
    workspace_id: str,
):
    """
    Process document with category-based extraction.
    
    Stages:
    0. Product Discovery (0-15%) - Identify all content by category
    1. Category Extraction (15-30%) - Build pages_to_process
    2. Chunking (30-50%) - Create chunks with category tags
    3. Image Processing (50-70%) - Extract images with category tags
    4. Entity Creation (70-90%) - Create products, certificates, logos, specs
    5. Metafield Linking (90-100%) - Link metafields to all entities
    """
```

---

## Part 3: Stage 0 - Enhanced Product Discovery

### **Current Claude Prompt**

```python
def _build_discovery_prompt(pdf_text, total_pages):
    return f"""
    Analyze this PDF catalog and identify ALL products.
    
    For each product, extract:
    - Product name
    - Designer/Studio
    - Page range
    - Dimensions
    - Variants
    - Metafields (R11, fire ratings, etc.)
    
    Return JSON with products array.
    """
```

### **New Enhanced Prompt**

```python
async def _build_discovery_prompt(pdf_text, total_pages, categories, custom_prompt):
    """Build Claude prompt for category-based discovery"""
    
    category_instructions = {
        "products": """
            Identify product pages with:
            - Product name, designer, studio
            - Page range, dimensions, variants
            - Metafields (R11, fire ratings, thickness, etc.)
        """,
        "certificates": """
            Identify certification pages with:
            - Certification type (EPD, LEED, FSC, etc.)
            - Issue/expiry dates
            - Certifying body
            - Linked products
        """,
        "logos": """
            Identify logo/branding pages with:
            - Logo name/brand
            - Page numbers
            - Logo type (company, certification, etc.)
        """,
        "specifications": """
            Identify specification pages with:
            - Specification title
            - Page range
            - Technical details
            - Linked products
        """
    }
    
    # Build category-specific instructions
    instructions = ""
    for category in categories:
        if category in category_instructions:
            instructions += f"\n{category.upper()}:\n{category_instructions[category]}"
    
    # If custom prompt provided, use it
    if custom_prompt:
        instructions = f"Custom extraction request: {custom_prompt}\n\n{instructions}"
    
    prompt = f"""
    Analyze this PDF catalog and identify content by categories: {', '.join(categories)}
    
    {instructions}
    
    For EACH category, classify pages and extract metadata.
    
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

### **New ProductCatalog Structure**

```python
@dataclass
class EnhancedProductCatalog:
    products: List[ProductInfo]
    certificates: List[CertificateInfo]  # NEW
    logos: List[LogoInfo]  # NEW
    specifications: List[SpecificationInfo]  # NEW
    
    # Page classification
    page_classification: Dict[int, str]  # page -> "product" | "certificate" | "logo" | "specification"
    
    # Metafields per category
    metafield_categories: Dict[str, List[str]]
    
    # Tracking
    total_pages: int
    total_images: int
    processing_time_ms: float
    model_used: str
    confidence_score: float
```

---

## Part 4: Stage 1 - Category-Based Page Selection

### **Current Logic**

```python
product_pages = set()
if focused_extraction:
    for product in catalog.products:
        product_pages.update(product.page_range)
else:
    product_pages = set(range(1, pdf_result.page_count + 1))
```

### **New Logic**

```python
async def build_pages_to_process(
    catalog: EnhancedProductCatalog,
    categories: List[str],
    total_pages: int
) -> Tuple[Set[int], Dict[int, str]]:
    """
    Build set of pages to process based on categories.
    
    Returns:
        (pages_to_process, page_to_category)
    """
    pages_to_process = set()
    page_to_category = {}
    
    for category in categories:
        if category == "all":
            # Process all pages
            pages_to_process = set(range(1, total_pages + 1))
            # Classify each page
            for page_num in pages_to_process:
                page_to_category[page_num] = catalog.page_classification.get(
                    page_num, "unknown"
                )
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
        
        elif category == "logos":
            for logo in catalog.logos:
                pages_to_process.update(logo.page_range)
                for page in logo.page_range:
                    page_to_category[page] = "logo"
        
        elif category == "specifications":
            for spec in catalog.specifications:
                pages_to_process.update(spec.page_range)
                for page in spec.page_range:
                    page_to_category[page] = "specification"
    
    logger.info(f"📄 Pages to process: {sorted(pages_to_process)}")
    logger.info(f"📊 Category distribution: {dict(sorted(Counter(page_to_category.values()).items()))}")
    
    return pages_to_process, page_to_category
```

---

## Part 5: Stages 2-5 - Category-Aware Processing

### **Stage 2: Chunking with Category Tags**

```python
# When saving chunks to database
chunk_record = {
    'id': chunk_id,
    'document_id': document_id,
    'content': chunk_text,
    'page_number': page_num,
    'category': page_to_category.get(page_num, 'unknown'),  # NEW
    'metadata': {
        'category': page_to_category.get(page_num, 'unknown'),
        'categories_requested': categories,
        # ... other metadata
    }
}
```

### **Stage 3: Image Processing with Category Tags**

```python
# When saving images to database
image_record = {
    'id': image_id,
    'document_id': document_id,
    'image_url': storage_url,
    'page_number': page_num,
    'category': page_to_category.get(page_num, 'unknown'),  # NEW
    'metadata': {
        'category': page_to_category.get(page_num, 'unknown'),
        'categories_requested': categories,
        # ... other metadata
    }
}
```

### **Stage 4: Entity Creation**

```python
# Create products
for product in catalog.products:
    if "products" in categories or "all" in categories:
        product_record = {
            'id': product_id,
            'name': product.name,
            'category': 'product',  # NEW
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
            'category': 'certificate',  # NEW
            # ... other fields
        }
        supabase.client.table('certificates').insert(cert_record).execute()

# Create logos
for logo in catalog.logos:
    if "logos" in categories or "all" in categories:
        logo_record = {
            'id': logo_id,
            'name': logo.name,
            'category': 'logo',  # NEW
            # ... other fields
        }
        supabase.client.table('logos').insert(logo_record).execute()

# Create specifications
for spec in catalog.specifications:
    if "specifications" in categories or "all" in categories:
        spec_record = {
            'id': spec_id,
            'title': spec.title,
            'category': 'specification',  # NEW
            # ... other fields
        }
        supabase.client.table('specifications').insert(spec_record).execute()
```

### **Stage 5: Metafield Linking**

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
    
    # For logos
    if "logos" in categories or "all" in categories:
        for logo in catalog.logos:
            await link_logo_metafields(logo, document_id)
    
    # For specifications
    if "specifications" in categories or "all" in categories:
        for spec in catalog.specifications:
            await link_specification_metafields(spec, document_id)
    
    # For chunks and images
    await link_chunk_metafields(document_id, categories)
    await link_image_metafields(document_id, categories)
```

---

## Part 6: NLP Prompt Parsing

### **Parse Extraction Prompt**

```python
async def parse_extraction_prompt(prompt: str) -> List[str]:
    """
    Parse NLP prompt to extract categories.
    
    Examples:
    - "extract products" -> ["products"]
    - "extract products and certificates" -> ["products", "certificates"]
    - "get all logos" -> ["logos"]
    - "find product specs" -> ["specifications"]
    """
    
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
    
    content = response.content[0].text.strip()
    
    # Extract JSON array
    try:
        categories = json.loads(content)
        if isinstance(categories, list):
            return categories
    except:
        pass
    
    # Fallback: simple keyword matching
    prompt_lower = prompt.lower()
    categories = []
    
    if "product" in prompt_lower:
        categories.append("products")
    if "certificate" in prompt_lower or "cert" in prompt_lower:
        categories.append("certificates")
    if "logo" in prompt_lower or "brand" in prompt_lower:
        categories.append("logos")
    if "specification" in prompt_lower or "spec" in prompt_lower:
        categories.append("specifications")
    if "all" in prompt_lower:
        categories = ["all"]
    
    return categories if categories else ["products"]
```

---

## Part 7: Database Migrations

### **Add Category Columns**

```sql
-- Add category column to chunks
ALTER TABLE document_chunks ADD COLUMN category VARCHAR(50);
CREATE INDEX idx_chunks_category ON document_chunks(category);

-- Add category column to images
ALTER TABLE document_images ADD COLUMN category VARCHAR(50);
CREATE INDEX idx_images_category ON document_images(category);

-- Create certificates table
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),  -- EPD, LEED, FSC, etc.
    pages INT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create logos table
CREATE TABLE logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255) NOT NULL,
    pages INT[],
    image_id UUID REFERENCES document_images(id),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create specifications table
CREATE TABLE specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    title VARCHAR(255) NOT NULL,
    pages INT[],
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Part 8: Testing Strategy

### **Test Cases**

1. **Single Category**: `categories=["products"]`
2. **Multiple Categories**: `categories=["products", "certificates"]`
3. **All Content**: `categories=["all"]`
4. **NLP Prompt**: `custom_prompt="extract products and logos"`
5. **Backward Compatibility**: Old `focused_extraction` parameter
6. **Metafield Creation**: New metafield types discovered
7. **Consistency**: Same results across all stages

---

## Part 9: Admin Panel Configuration

### **New Admin Pages**

1. **Category Settings**
   - Enable/disable categories
   - Set default categories
   - Define category-specific rules

2. **Metafield Management**
   - View discovered metafields
   - Map to database fields
   - Create new metafield types

3. **Custom Prompts**
   - Create custom extraction prompts
   - Test with sample PDFs
   - View extraction results

4. **Extraction History**
   - View all extractions
   - Filter by category
   - Retry failed extractions

