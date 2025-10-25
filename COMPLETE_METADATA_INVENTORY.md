# 📋 Complete Metadata Inventory - Material-KAI Vision Platform

## Overview
This document provides a comprehensive list of ALL metadata, properties, and attributes tracked for materials, products, images, and documents in the platform.

---

## 🏢 MATERIALS METADATA

### Basic Information
- **id** - UUID (unique identifier)
- **name** - String (display name)
- **description** - String (detailed description)
- **category** - Enum (wood, metal, plastic, ceramic, glass, fabric, stone, composite)
- **thumbnailUrl** - String (optional thumbnail image)
- **imageUrl** - String (optional primary image)

### Physical Properties
- **density** - Number (kg/m³)
- **hardness** - Number (Mohs scale or similar)
- **elasticity** - Number (Young's modulus)
- **thermalConductivity** - Number (W/m·K)
- **electricalConductivity** - Number (S/m)
- **magneticProperties** - String (ferromagnetic, paramagnetic, diamagnetic)
- **porosity** - Number (percentage)
- **surfaceRoughness** - Number (Ra or Rz)

### Mechanical Properties
- **tensileStrength** - Number (MPa)
- **compressiveStrength** - Number (MPa)
- **flexuralStrength** - Number (MPa)
- **fatigueResistance** - Number (cycles)
- **impactResistance** - Number (J/m²)
- **wearResistance** - Number (rating)
- **creepResistance** - Number (rating)
- **yieldStrength** - Number (MPa)

### Chemical Properties
- **composition** - Object (element: percentage pairs)
- **corrosionResistance** - Number (rating 0-10)
- **chemicalStability** - Number (rating 0-10)
- **oxidationResistance** - Number (rating 0-10)
- **acidResistance** - Number (rating 0-10)
- **alkalineResistance** - Number (rating 0-10)
- **solventResistance** - Number (rating 0-10)

### Thermal Properties
- **meltingPoint** - Number (°C)
- **boilingPoint** - Number (°C)
- **thermalExpansion** - Number (coefficient)
- **specificHeatCapacity** - Number (J/kg·K)
- **thermalDiffusivity** - Number (m²/s)

### Optical Properties
- **transparency** - String (opaque, translucent, transparent)
- **reflectance** - Number (0-1)
- **refractionIndex** - Number
- **colorProperties** - Object (RGB, HSL values)

### Environmental Properties
- **sustainability** - String (rating: low, medium, high)
- **recyclability** - String (yes, partial, no)
- **carbonFootprint** - Number (kg CO₂/kg material)
- **biodegradability** - String (yes, partial, no)
- **renewableSource** - Boolean

### Safety Properties
- **toxicity** - String (rating: non-toxic, low, moderate, high)
- **flammability** - String (rating: non-flammable, low, moderate, high)
- **hazardousSubstances** - Array (list of substances)
- **safetyDataSheet** - String (URL to SDS)

### Surface & Finish
- **finish** - String (matte, gloss, satin, metallic, brushed, polished, textured, smooth)
- **texture** - String (smooth, rough, woven, knitted, embossed, velvet, silk, cotton, linen)
- **pattern** - String (solid, striped, geometric, floral, abstract, checkered, dotted)
- **color** - String (color name or hex code)

### Dimensional Properties
- **length** - Number (with unit)
- **width** - Number (with unit)
- **thickness** - Number (with unit)
- **weight** - Number (with unit)
- **shape** - String (rectangular, square, hexagonal, round, irregular, custom)
- **edgeType** - String (straight, beveled, rounded, chamfered)
- **rectified** - Boolean

### Material Composition
- **materialType** - String (specific type)
- **woodSpecies** - String (for wood products)
- **stoneType** - String (marble, granite, limestone, travertine, slate, quartzite)
- **percentageComposition** - Object (component: percentage)

### Standards & Certifications
- **standards** - Array (ISO, ASTM, EN, etc.)
- **certifications** - Array (CE, FSC, LEED, etc.)
- **complianceData** - Object (standard: compliance status)

### Application & Installation
- **application** - String (interior, exterior, industrial, residential, commercial)
- **installationMethod** - String (adhesive, mechanical, welded, bolted, etc.)
- **maintenanceRequirements** - String (description)
- **lifespan** - Number (years)
- **warranty** - String (duration and coverage)

### Metadata Fields (Dynamic)
- **metafieldValues** - Array of custom fields
  - **id** - UUID
  - **key** - String (field name)
  - **value** - String/Number/Boolean/Date
  - **type** - String (text, number, boolean, url, date)

### Relationships
- **relationships** - Array
  - **id** - UUID
  - **type** - String (compatible, alternative, component, similar)
  - **targetMaterialId** - UUID
  - **description** - String

### Timestamps
- **createdAt** - ISO 8601 timestamp
- **updatedAt** - ISO 8601 timestamp

---

## 📦 PRODUCTS METADATA

### Basic Information
- **id** - UUID
- **name** - String
- **description** - String (short)
- **longDescription** - String (full content)
- **categoryId** - UUID (reference to category)
- **status** - Enum (draft, published, archived)

### Source Information
- **sourceDocumentId** - UUID (PDF source)
- **sourceChunks** - Array (chunk IDs)
- **createdFromType** - Enum (pdf_processing, xml_import, manual, scraping, sample_data)
- **createdBy** - UUID (user ID)

### Properties
- **materialType** - String
- **color** - String
- **finish** - String
- **durability** - String
- **[custom properties]** - Any

### Specifications
- **modelNumber** - String
- **sku** - String
- **upc** - String
- **brand** - String
- **manufacturer** - String
- **variants** - Array (color, size, finish options)
- **[technical specs]** - Any

### Metadata
- **supplier** - String
- **origin** - String
- **priceRange** - String
- **availability** - String
- **certifications** - Array
- **[custom metadata]** - Any

### Embeddings
- **embedding** - Vector(1536) (text embedding)
- **embeddingModel** - String (default: text-embedding-3-small)

### Timestamps
- **createdAt** - ISO 8601 timestamp
- **updatedAt** - ISO 8601 timestamp

---

## 🖼️ IMAGES METADATA

### Basic Information
- **id** - UUID
- **documentId** - UUID
- **chunkId** - UUID (primary related chunk)
- **imageUrl** - String
- **caption** - String
- **altText** - String
- **imageType** - String (product, texture, sample, installation, moodboard, etc.)

### Image Properties
- **width** - Integer (pixels)
- **height** - Integer (pixels)
- **format** - String (JPEG, PNG, etc.)
- **sizeBytes** - Integer
- **colorMode** - String (RGB, CMYK, etc.)
- **resolutionDpi** - Integer

### Quality Metrics
- **qualityScore** - Float (0-1)
- **sharpnessScore** - Float (0-1)
- **confidence** - Float (0-1)
- **processingStatus** - String (pending, completed, failed)

### Content Analysis
- **dominantColors** - Array (color palette)
- **brightness** - Float (0-1)
- **contrast** - Float (0-1)
- **ocrExtractedText** - String
- **ocrConfidenceScore** - Float (0-1)

### Visual Features
- **visualFeatures** - Object
  - **clip512** - Array (CLIP embeddings)
  - **colorEmbedding** - Array (color analysis)
  - **textureEmbedding** - Array (texture analysis)

### Image Analysis Results
- **imageAnalysisResults** - Object
  - **confidence** - Float
  - **properties** - Object (color, finish, pattern, texture, composition)
  - **materialType** - String
  - **analysisMethod** - String
  - **extractedFeatures** - Object
  - **processingTimeMs** - Integer
  - **classificationScores** - Object

### Contextual Information
- **contextualName** - String
- **nearestHeading** - String
- **headingLevel** - Integer
- **headingDistance** - Integer
- **pageNumber** - Integer
- **proximityScore** - Float

### Extracted Metadata (NEW)
- **extractedMetadata** - Object
  - **sizes** - Array (dimensions)
  - **factory** - String (manufacturer)
  - **group** - String (collection/group)
  - **collection** - String
  - **specifications** - Object
  - **productCodes** - Array
  - **availability** - String

### Material Properties (NEW)
- **materialProperties** - Object
  - **color** - String
  - **finish** - String
  - **pattern** - String
  - **texture** - String
  - **composition** - Object
  - **safetyRatings** - Object
  - **thermalProperties** - Object
  - **mechanicalProperties** - Object
  - **confidence** - Float

### Relationship Data (NEW)
- **relatedChunksCount** - Integer
- **qualityScore** - Float (0-1)

### Multimodal Metadata
- **multimodalMetadata** - Object (cross-modal analysis)

### Timestamps
- **createdAt** - ISO 8601 timestamp

---

## 📄 DOCUMENT CHUNKS METADATA

### Basic Information
- **id** - UUID
- **documentId** - UUID
- **workspaceId** - UUID
- **content** - String (text content)
- **chunkIndex** - Integer

### Quality Metrics
- **quality** - Object
  - **completeness** - Float (0-1)
  - **coherence** - Float (0-1)
  - **readability** - Float (0-1)

### Content Classification
- **contentType** - String (text, table, image, mixed)
- **language** - String (ISO 639-1 code)

### Structural Information
- **headers** - Array (heading hierarchy)
- **tableData** - Object (if table content)
- **imageMetadata** - Object (if image references)

### Position Information
- **startChar** - Integer
- **endChar** - Integer
- **pageNumber** - Integer

### Embeddings
- **embedding** - Vector(1536) (text embedding)
- **textEmbedding1536** - Vector(1536)
- **visualClipEmbedding512** - Vector(512)
- **multimodalFusionEmbedding2048** - Vector(2048)

### Timestamps
- **createdAt** - ISO 8601 timestamp
- **extractedAt** - ISO 8601 timestamp

---

## 📊 DYNAMIC METAFIELDS

### Field Definition
- **id** - UUID
- **fieldName** - String (internal name)
- **displayName** - String (user-facing name)
- **fieldType** - Enum (text, number, boolean, date, select, multiselect, json)
- **isRequired** - Boolean
- **description** - String
- **extractionHints** - String (for AI extraction)
- **appliesToCategories** - Array (material categories)
- **isGlobal** - Boolean
- **displayOrder** - Integer
- **fieldOptions** - Object (for select fields)
- **validationRules** - Object
- **defaultValue** - Any

### Field Values
- **id** - UUID
- **key** - String
- **value** - Any
- **type** - String

---

## 🔗 RELATIONSHIPS & ASSOCIATIONS

### Image-Chunk Relationships (NEW)
- **imageId** - UUID
- **chunkId** - UUID
- **similarityScore** - Float (0-1)
- **relationshipType** - String (primary, related, context)

### Product-Image Associations
- **productId** - UUID
- **imageId** - UUID
- **imageType** - String
- **displayOrder** - Integer

### Material-Product Relationships
- **type** - String (compatible, alternative, component, similar)
- **targetMaterialId** - UUID
- **description** - String

---

## 📈 STATISTICS & METRICS

### Per Material
- Total products created
- Total images associated
- Average quality score
- Usage frequency
- Last accessed date

### Per Product
- Related materials count
- Associated images count
- Chunk sources count
- Embedding quality score

### Per Image
- Related chunks count (NEW)
- Quality score (NEW)
- Extracted metadata fields count (NEW)
- Material properties extracted count (NEW)

---

## ✅ Summary

**Total Metadata Categories:** 15+
**Total Fields:** 200+
**Dynamic Fields:** Unlimited (via metafields system)
**Embedding Types:** 6 (text, visual CLIP, multimodal, color, texture, application)
**Relationship Types:** 4+ (compatible, alternative, component, similar, primary, related, context)

---

**Last Updated:** 2025-10-24
**Status:** Complete & Comprehensive

