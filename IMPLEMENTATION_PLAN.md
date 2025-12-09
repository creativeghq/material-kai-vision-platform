# Implementation Plan for Pending Tasks

## Task 1: Update Database Prompt ⚠️ CRITICAL

### Steps:
1. Open Supabase Dashboard → SQL Editor
2. Run this query to view current prompt:
   ```sql
   SELECT prompt_text FROM prompts WHERE id = 'be3ce539-677b-4a09-974a-e43d6faf7b0e';
   ```
3. Copy content from `update_discovery_prompt.sql`
4. Execute the UPDATE statement
5. Verify update:
   ```sql
   SELECT name, updated_at FROM prompts WHERE id = 'be3ce539-677b-4a09-974a-e43d6faf7b0e';
   ```

### Verification:
- Check that prompt includes "pattern" field in variant examples
- Check that "available_colors" field is present
- Check that "packaging" object with 6 fields is included
- Check that "Color List Extraction" section exists
- Check that "Packaging Details Extraction" section exists

---

## Task 2: Implement OCR for Icon-Based Metadata

### Technical Approach:

#### Option 1: Claude Vision (Recommended)
- Already using Claude Vision for image analysis
- Can identify icons and extract their meaning
- No additional OCR library needed
- Add specific instructions to prompt

#### Option 2: Tesseract OCR
- Traditional OCR approach
- Good for text in images
- May struggle with pure icons
- Requires additional dependency

### Implementation Steps:

1. **Enhance Claude Vision Prompt** (Recommended First Step)
   - Add icon detection instructions
   - Provide examples of common icons (R11, fire ratings, etc.)
   - Ask Claude to describe what icons represent

2. **Add Icon Mapping Dictionary**
   ```python
   ICON_METADATA_MAPPING = {
       'R9': {'slip_resistance': 'R9'},
       'R10': {'slip_resistance': 'R10'},
       'R11': {'slip_resistance': 'R11'},
       'R12': {'slip_resistance': 'R12'},
       'R13': {'slip_resistance': 'R13'},
       'A1': {'fire_rating': 'A1'},
       'A2': {'fire_rating': 'A2'},
       'B': {'fire_rating': 'B'},
       # Add more mappings
   }
   ```

3. **Update Product Discovery Prompt**
   Add section:
   ```
   **ICON-BASED METADATA EXTRACTION:**
   
   Many catalogs use icons/symbols to represent technical specifications.
   Look for and extract:
   - Slip resistance icons (R9, R10, R11, R12, R13)
   - Fire rating symbols (A1, A2, B, C)
   - Certification badges (CE, ISO, etc.)
   - Technical specification icons
   
   When you see an icon, describe what it represents and extract the value.
   ```

4. **Files to Modify**:
   - `mivaa-pdf-extractor/app/services/product_discovery_service.py` (add icon instructions to prompt)
   - Database prompt (add icon extraction section)

---

## Task 3: Extract Factory-Level Documents

### Document Types to Extract:

1. **Regulations** - Legal compliance, standards
2. **Cleaning** - Cleaning instructions, maintenance
3. **Handling** - Installation, handling guidelines
4. **Care Instructions** - Long-term care, maintenance
5. **Technical Information** - Factory-wide technical specs
6. **Certifications** - Factory certifications (ISO, etc.)

### Implementation Steps:

1. **Add Factory Document Detection to Prompt**
   ```
   **FACTORY-LEVEL DOCUMENTS:**
   
   Identify and extract documents that apply to the ENTIRE factory/catalog:
   - Regulations (legal compliance, standards)
   - Cleaning instructions
   - Handling guidelines
   - Installation guides
   - Maintenance instructions
   - Care instructions
   - Technical information sheets
   
   Common headings to look for:
   - "Regulations", "Regulatory Information"
   - "Cleaning", "Cleaning Instructions", "Maintenance"
   - "Installation", "Installation Guide"
   - "Handling", "Handling Instructions"
   - "Care Instructions", "Care & Maintenance"
   - "Technical Information", "Technical Data"
   
   For each document, extract:
   - Document type
   - Title/heading
   - Full content
   - Page range
   - Applies to: factory/manufacturer name
   ```

2. **Database Schema** (Check if exists, create if needed)
   ```sql
   CREATE TABLE IF NOT EXISTS factory_documents (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     factory_name TEXT NOT NULL,
     factory_group_name TEXT,
     document_type TEXT NOT NULL, -- 'regulations', 'cleaning', 'handling', etc.
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     page_range INTEGER[],
     document_id UUID REFERENCES documents(id),
     metadata JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Update Product Discovery Service**
   - Add factory document extraction to discovery prompt
   - Parse factory documents from AI response
   - Save to database

4. **Files to Modify**:
   - `mivaa-pdf-extractor/app/services/product_discovery_service.py`
   - Database migration (add factory_documents table if needed)
   - Database prompt

---

## Task 4: Extract Global Factory Metadata

### Metadata to Extract:

1. **Factory Information**
   - Factory name
   - Factory group/parent company
   - Country of origin
   - Manufacturing location

2. **Global Standards**
   - Standard sizes available
   - Standard thicknesses
   - Standard finishes

3. **Factory-Wide Certifications**
   - ISO certifications
   - Quality certifications
   - Environmental certifications

4. **Default Technical Specs**
   - Common slip resistance
   - Common fire ratings
   - Common water absorption class

### Implementation Steps:

1. **Add Factory Metadata Extraction to Prompt**
   ```
   **FACTORY-LEVEL METADATA:**
   
   Extract information that applies to ALL products from this factory:
   
   1. Factory Information:
      - Factory name and group
      - Country of origin
      - Manufacturing location
   
   2. Global Standards:
      - Standard sizes available across all products
      - Standard thicknesses
      - Standard finishes
   
   3. Factory Certifications:
      - ISO certifications
      - Quality certifications
      - Environmental certifications
   
   4. Default Technical Specifications:
      - Common slip resistance ratings
      - Common fire ratings
      - Common water absorption classes
   
   This information is typically found in:
   - Introduction pages
   - "About Us" sections
   - Technical information sheets
   - Certification pages
   ```

2. **Create Factory Metadata Enrichment Logic**
   ```python
   def enrich_product_with_factory_defaults(product, factory_metadata):
       """Enrich product metadata with factory-level defaults"""
       if not product.get('country_of_origin') and factory_metadata.get('country_of_origin'):
           product['country_of_origin'] = factory_metadata['country_of_origin']
       
       if not product.get('certifications') and factory_metadata.get('certifications'):
           product['certifications'] = factory_metadata['certifications']
       
       # Add more enrichment logic
       return product
   ```

3. **Files to Modify**:
   - `mivaa-pdf-extractor/app/services/product_discovery_service.py`
   - Add factory metadata extraction
   - Add product enrichment logic

---

## Task 5: English-Only Text Extraction

### Challenges:

1. Catalogs often have parallel text in multiple languages
2. Languages may be mixed on same page
3. Need to detect and filter non-English text

### Implementation Approaches:

#### Option 1: Prompt-Based (Recommended)
- Add instruction to Claude Vision: "Extract ONLY English text"
- Simplest approach, no additional libraries
- Claude can identify language

#### Option 2: Language Detection Library
- Use `langdetect` or `langid` Python library
- Detect language of each text block
- Filter out non-English blocks
- More precise but more complex

### Implementation Steps:

1. **Update Claude Vision Prompt** (Simplest)
   ```
   **LANGUAGE EXTRACTION:**
   
   CRITICAL: Extract ONLY English text.
   
   Many catalogs contain multiple languages (English, Spanish, French, etc.).
   You MUST:
   - Identify which text is in English
   - Extract ONLY the English version
   - Ignore all non-English text
   - Do NOT include duplicate content in other languages
   
   Common patterns:
   - Parallel columns (English on left, Spanish on right)
   - Sequential sections (English first, then other languages)
   - Mixed paragraphs (English sentence, then translation)
   ```

2. **Add Post-Processing Language Filter** (If needed)
   ```python
   from langdetect import detect
   
   def filter_english_only(text):
       """Filter out non-English text"""
       try:
           if detect(text) == 'en':
               return text
           return None
       except:
           return text  # If detection fails, keep text
   ```

3. **Files to Modify**:
   - `mivaa-pdf-extractor/app/services/product_discovery_service.py` (add language instruction to prompt)
   - Database prompt (add language extraction section)
   - Optional: Add language detection post-processing

---

## Priority Order:

1. **Task 1** (CRITICAL) - Update database prompt - Do this FIRST
2. **Task 5** (HIGH) - English-only extraction - Prevents data quality issues
3. **Task 3** (HIGH) - Factory documents - Important for completeness
4. **Task 2** (MEDIUM) - OCR for icons - Nice to have, improves accuracy
5. **Task 4** (MEDIUM) - Global factory metadata - Enrichment feature

