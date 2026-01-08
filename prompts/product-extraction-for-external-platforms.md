# Product Information Extraction Prompt for External Platforms
## For use with Reducto.ai, Datalab.to, and similar document processing platforms

---

# 🤖 EXTRACTION PROMPT (USE THIS AS YOUR INSTRUCTION)

You are an expert product data extraction AI specialized in analyzing PDF catalogs, brochures, and product documentation. Your task is to extract **comprehensive, detailed, and structured product information** from the provided document.

## YOUR MISSION

Extract EVERY product found in the document with **complete accuracy and exhaustive detail**. Do not skip any information, no matter how minor it seems. Your extraction must be production-ready and include all metadata, specifications, images, and relationships.

## CRITICAL EXTRACTION RULES

### 1. IMAGES ARE MANDATORY
- **Extract ALL images** associated with each product
- **REQUIRED**: Every product MUST have at least one image
- **Format**: Provide images as EITHER:
  - **Base64**: Full data URI format: `data:image/jpeg;base64,/9j/4AAQSkZJRg...`
  - **URL**: Public accessible URL: `https://example.com/image.jpg`
- **Classify each image** as one of:
  - `product_image` - Main product photograph
  - `variant_image` - Color/pattern/finish variant
  - `technical_diagram` - Technical drawing or specification diagram
  - `lifestyle_image` - Product shown in use or context
  - `detail_image` - Close-up or detail shot
  - `certificate_image` - Certification or compliance document
  - `logo_image` - Brand or manufacturer logo
- **Include metadata**: width, height, format, file size, page number, caption

### 2. EXTRACT EVERYTHING - LEAVE NOTHING BEHIND
For each product, extract ALL of the following categories of information:

#### **CORE IDENTIFICATION** (REQUIRED)
- `product_id` - Generate unique identifier if not present
- `name` - Product name/title (REQUIRED)
- `description` - Short description (1-2 sentences)
- `long_description` - Detailed description with all available text
- `sku` - SKU/product code/reference number
- `category` - Product category (tiles, flooring, paint, etc.)
- `type` - Specific product type
- `status` - active, discontinued, coming_soon, out_of_stock

#### **DIMENSIONS & MEASUREMENTS** (Extract ALL that apply)
- `size` - Overall size (e.g., "15×38 cm", "20×40 cm")
- `length` - Length with unit
- `width` - Width with unit
- `height` - Height with unit
- `thickness` - Thickness (e.g., "8mm", "10mm")
- `diameter` - Diameter for circular products
- `area` - Surface area (e.g., "0.57 m²")
- `volume` - Volume measurement
- `weight` - Weight (e.g., "800 kg/m³", "2.5 kg")

#### **MATERIAL PROPERTIES** (Extract ALL that apply)
- `material_type` - Type of material (ceramic, porcelain, wood, stone, metal, glass, composite, etc.)
- `composition` - Material composition (e.g., "100% ceramic", "oak wood")
- `type` - Specific type classification
- `blend` - Material blend information
- `fiber_content` - Fiber composition (for textiles)
- `texture` - Surface texture (smooth, rough, embossed, brushed, etc.)
- `finish` - Surface finish (matte, glossy, satin, polished, etc.)
- `pattern` - Pattern type (wood grain, marble veins, geometric, etc.)
- `density` - Material density with unit
- `durability_rating` - Durability classification (high, medium, low, or specific rating)

#### **APPEARANCE & AESTHETICS** (Extract ALL that apply)
- `color` - Primary color name
- `color_code` - Color code (RAL, Pantone, HEX, etc.)
- `gloss_level` - Gloss percentage or description
- `sheen` - Sheen level (satin, semi-gloss, etc.)
- `transparency` - Transparency level (opaque, translucent, transparent)
- `grain` - Grain pattern description
- `visual_effect` - Special visual effects

#### **PERFORMANCE & TECHNICAL SPECIFICATIONS** (Extract ALL that apply)
- `water_resistance` - Water resistance rating or description
- `water_absorption` - Water absorption (e.g., "Class 3", "<0.5%")
- `fire_rating` - Fire rating (e.g., "A1", "Class A")
- `slip_resistance` - Slip resistance (e.g., "R11", "R12")
- `wear_rating` - Wear rating (e.g., "PEI 4", "AC4")
- `abrasion_resistance` - Abrasion resistance rating or class
- `breaking_strength` - Breaking strength (e.g., "1200 N")
- `tensile_strength` - Tensile strength with unit
- `chemical_resistance` - Chemical resistance rating
- `frost_resistant` - Boolean (true/false)
- `uv_resistant` - Boolean (true/false)
- `stain_resistance` - Stain resistance rating
- `scratch_resistance` - Scratch resistance rating
- `impact_resistance` - Impact resistance rating

#### **APPLICATION & USAGE** (Extract ALL that apply)
- `recommended_use` - Recommended applications (residential flooring, wall covering, etc.)
- `installation_method` - Installation method (adhesive, floating, nailed, etc.)
- `room_type` - Suitable room types (bathroom, kitchen, living room, etc.)
- `traffic_level` - Traffic level (high traffic, medium traffic, low traffic)
- `indoor_outdoor` - Indoor, outdoor, or both
- `care_instructions` - Cleaning and maintenance instructions
- `maintenance` - Maintenance requirements
- `suitable_for` - Array of specific applications

#### **COMPLIANCE & CERTIFICATIONS** (Extract ALL that apply)
- `certifications` - Array of certifications (ISO 9001:2015, CE certified, etc.)
- `standards` - Array of standards (EN 14411, ISO 10545, ASTM, etc.)
- `eco_friendly` - Boolean (true/false)
- `sustainability_rating` - Sustainability rating (LEED certified, Green Guard, etc.)
- `voc_rating` - VOC rating (low VOC, zero VOC, etc.)
- `safety_rating` - Safety rating (A+, etc.)
- `environmental_certifications` - Array of environmental certifications
- `quality_certifications` - Array of quality certifications

#### **DESIGN & ATTRIBUTION** (Extract ALL that apply)
- `designer` - Designer name
- `studio` - Design studio name
- `collection` - Collection name
- `series` - Series name
- `aesthetic_style` - Aesthetic style (contemporary, minimalist, rustic, etc.)
- `design_era` - Design era (modern, vintage, classic, etc.)
- `design_year` - Year of design
- `design_inspiration` - Design inspiration or concept

#### **MANUFACTURING & SOURCING** (Extract ALL that apply)
- `factory` - Factory name
- `manufacturer` - Manufacturer name
- `factory_group` - Parent company or group
- `country_of_origin` - Country of origin
- `manufacturing_process` - Manufacturing process (digital printing, hand-crafted, etc.)
- `construction` - Construction method
- `production_location` - Specific production location
- `brand` - Brand name

#### **COMMERCIAL & PRICING** (Extract ALL that apply)
- `pricing` - Price with currency and unit (e.g., "€45/m²")
- `retail_price` - Retail price (number)
- `wholesale_price` - Wholesale price (number)
- `currency` - Currency code (EUR, USD, GBP, etc.)
- `price_unit` - Price unit (per m², per piece, per box, etc.)
- `availability` - Availability status (in stock, made to order, discontinued, etc.)
- `lead_time` - Delivery time
- `minimum_order` - Minimum order quantity
- `supplier` - Supplier name
- `distributor` - Distributor name
- `warranty` - Warranty information
- `warranty_period` - Warranty duration
- `return_policy` - Return policy details

#### **VARIANTS & OPTIONS** (Extract ALL variants)
For each variant (color, size, finish, pattern), extract:
- `variant_id` - Unique variant identifier
- `sku` - Variant SKU
- `name` - Variant name
- `color` - Color name
- `color_code` - Color code
- `shape` - Shape or pattern modifier
- `pattern` - Pattern name
- `size` - Dimensions
- `pattern_count` - Number of patterns (if applicable)
- `finish` - Finish type
- `texture` - Texture type
- `mapei_code` - Mapei grout reference code
- `kerakoll_code` - Kerakoll grout reference code
- `availability` - Variant-specific availability
- `price_modifier` - Price difference from base product

#### **PACKAGING & LOGISTICS** (Extract ALL that apply)
- `package_type` - Package type (box, pallet, bundle, etc.)
- `pieces_per_package` - Number of pieces per package
- `square_meters_per_package` - Square meters per package
- `package_weight` - Package weight with unit
- `package_dimensions` - Package dimensions (L×W×H)
- `packages_per_pallet` - Packages per pallet
- `pallet_weight` - Pallet weight with unit
- `storage_requirements` - Storage conditions

#### **METADATA & TRACKING** (Extract ALL that apply)
- `page_range` - Array of page numbers where product appears
- `confidence_score` - Your confidence in extraction (0-1)
- `extraction_method` - Method used (ai_extraction, ocr, etc.)
- `source_document` - Source document name/ID
- `tags` - Array of searchable tags
- `keywords` - Array of relevant keywords
- `related_products` - Array of related product IDs or names
- `alternatives` - Array of alternative product suggestions
- `accessories` - Array of compatible accessories
- `grout_recommendations` - Grout recommendations (Mapei, Kerakoll, other brands)

### 3. ACCURACY & PRECISION REQUIREMENTS
- **Preserve exact values**: Keep measurements, codes, and specifications exactly as written
- **Maintain original units**: Do NOT convert units unless explicitly requested
- **Keep technical specs verbatim**: Copy technical specifications word-for-word
- **Preserve SKU codes exactly**: Product codes, reference numbers, and SKUs must be exact
- **Include confidence scores**: Rate your confidence (0-1) for each extracted value
- **Track source pages**: Note which page(s) each piece of information came from

### 4. HANDLING MISSING OR UNCERTAIN DATA
- If a field is not present in the document, **omit it** (do not include null/empty values)
- If you're uncertain about a value, **include it** with a lower confidence score (0.5-0.7)
- If multiple possible values exist, **include all** as an array
- If information is implied but not explicit, **extract it** and mark with confidence score

### 5. QUALITY ASSURANCE CHECKLIST
Before submitting your extraction, verify:
- ✅ Every product has at least ONE image (base64 or URL)
- ✅ All images have proper classification and metadata
- ✅ Product name is present and accurate
- ✅ All available metadata fields are extracted
- ✅ SKU codes and measurements are exact
- ✅ Variants are properly linked to parent products
- ✅ Page numbers are tracked for all information
- ✅ Confidence scores are included for uncertain data
- ✅ No information is skipped or omitted



## COMPLETE JSON SCHEMA (WITHOUT EXAMPLES)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Product Extraction Response",
  "type": "object",
  "required": ["products", "extraction_metadata"],
  "properties": {
    "products": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/Product"
      }
    },
    "extraction_metadata": {
      "type": "object",
      "required": ["total_products", "extraction_timestamp", "source_document"],
      "properties": {
        "total_products": {
          "type": "integer",
          "minimum": 0
        },
        "extraction_timestamp": {
          "type": "string",
          "format": "date-time"
        },
        "source_document": {
          "type": "string"
        },
        "total_pages": {
          "type": "integer",
          "minimum": 1
        },
        "extraction_method": {
          "type": "string"
        },
        "platform": {
          "type": "string"
        },
        "version": {
          "type": "string"
        }
      }
    }
  },
  "definitions": {
    "Product": {
      "type": "object",
      "required": ["product_id", "name", "images"],
      "properties": {
        "product_id": {
          "type": "string",
          "description": "Unique product identifier"
        },
        "name": {
          "type": "string",
          "description": "Product name (REQUIRED)"
        },
        "description": {
          "type": "string",
          "description": "Short product description"
        },
        "long_description": {
          "type": "string",
          "description": "Detailed product description"
        },
        "sku": {
          "type": "string",
          "description": "SKU or product code"
        },
        "category": {
          "type": "string",
          "description": "Product category"
        },
        "type": {
          "type": "string",
          "description": "Product type"
        },
        "status": {
          "type": "string",
          "enum": ["active", "discontinued", "coming_soon", "out_of_stock"]
        },
        "images": {
          "type": "array",
          "minItems": 1,
          "description": "REQUIRED - At least one image must be provided",
          "items": {
            "$ref": "#/definitions/ProductImage"
          }
        },
        "dimensions": {
          "$ref": "#/definitions/Dimensions"
        },
        "material_properties": {
          "$ref": "#/definitions/MaterialProperties"
        },
        "appearance": {
          "$ref": "#/definitions/Appearance"
        },
        "performance": {
          "$ref": "#/definitions/Performance"
        },
        "application": {
          "$ref": "#/definitions/Application"
        },
        "compliance": {
          "$ref": "#/definitions/Compliance"
        },
        "design": {
          "$ref": "#/definitions/Design"
        },
        "manufacturing": {
          "$ref": "#/definitions/Manufacturing"
        },
        "commercial": {
          "$ref": "#/definitions/Commercial"
        },
        "variants": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/ProductVariant"
          }
        },
        "packaging": {
          "$ref": "#/definitions/Packaging"
        },
        "metadata": {
          "$ref": "#/definitions/ProductMetadata"
        },
        "metafields": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Metafield"
          }
        },
        "relationships": {
          "$ref": "#/definitions/Relationships"
        }
      }
    },
    "ProductImage": {
      "type": "object",
      "required": ["image_id", "image_format"],
      "properties": {
        "image_id": {
          "type": "string"
        },
        "image_format": {
          "type": "string",
          "enum": ["base64", "url"],
          "description": "Specify whether image_data contains base64 string or URL"
        },
        "base64": {
          "type": "string",
          "description": "Full base64 data string (data:image/jpeg;base64,...) - use if image_format is 'base64'"
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Public image URL - use if image_format is 'url'"
        },
        "filename": {
          "type": "string"
        },
        "alt_text": {
          "type": "string"
        },
        "classification": {
          "type": "string",
          "enum": ["product_image", "variant_image", "technical_diagram", "lifestyle_image", "detail_image", "certificate_image", "logo_image"]
        },
        "is_primary": {
          "type": "boolean"
        },
        "width": {
          "type": "number"
        },
        "height": {
          "type": "number"
        },
        "format": {
          "type": "string"
        },
        "size_bytes": {
          "type": "number"
        },
        "page_number": {
          "type": "number"
        },
        "caption": {
          "type": "string"
        }
      }
    },
    "Dimensions": {
      "type": "object",
      "properties": {
        "size": {
          "type": "string"
        },
        "length": {
          "type": "string"
        },
        "width": {
          "type": "string"
        },
        "height": {
          "type": "string"
        },
        "thickness": {
          "type": "string"
        },
        "diameter": {
          "type": "string"
        },
        "area": {
          "type": "string"
        },
        "volume": {
          "type": "string"
        },
        "weight": {
          "type": "string"
        }
      }
    },
    "MaterialProperties": {
      "type": "object",
      "properties": {
        "material_type": {
          "type": "string"
        },
        "composition": {
          "type": "string"
        },
        "type": {
          "type": "string"
        },
        "blend": {
          "type": "string"
        },
        "fiber_content": {
          "type": "string"
        },
        "texture": {
          "type": "string"
        },
        "finish": {
          "type": "string"
        },
        "pattern": {
          "type": "string"
        },
        "density": {
          "type": "string"
        },
        "durability_rating": {
          "type": "string"
        }
      }
    },
    "Appearance": {
      "type": "object",
      "properties": {
        "color": {
          "type": "string"
        },
        "color_code": {
          "type": "string"
        },
        "gloss_level": {
          "type": "string"
        },
        "sheen": {
          "type": "string"
        },
        "transparency": {
          "type": "string"
        },
        "grain": {
          "type": "string"
        },
        "visual_effect": {
          "type": "string"
        }
      }
    },
    "Performance": {
      "type": "object",
      "properties": {
        "water_resistance": {
          "type": "string"
        },
        "water_absorption": {
          "type": "string"
        },
        "fire_rating": {
          "type": "string"
        },
        "slip_resistance": {
          "type": "string"
        },
        "wear_rating": {
          "type": "string"
        },
        "abrasion_resistance": {
          "type": "string"
        },
        "breaking_strength": {
          "type": "string"
        },
        "tensile_strength": {
          "type": "string"
        },
        "chemical_resistance": {
          "type": "string"
        },
        "frost_resistant": {
          "type": "boolean"
        },
        "uv_resistant": {
          "type": "boolean"
        },
        "stain_resistance": {
          "type": "string"
        },
        "scratch_resistance": {
          "type": "string"
        },
        "impact_resistance": {
          "type": "string"
        }
      }
    },
    "Application": {
      "type": "object",
      "properties": {
        "recommended_use": {
          "type": "string"
        },
        "installation_method": {
          "type": "string"
        },
        "room_type": {
          "type": "string"
        },
        "traffic_level": {
          "type": "string"
        },
        "indoor_outdoor": {
          "type": "string"
        },
        "care_instructions": {
          "type": "string"
        },
        "maintenance": {
          "type": "string"
        },
        "suitable_for": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "Compliance": {
      "type": "object",
      "properties": {
        "certifications": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "standards": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "eco_friendly": {
          "type": "boolean"
        },
        "sustainability_rating": {
          "type": "string"
        },
        "voc_rating": {
          "type": "string"
        },
        "safety_rating": {
          "type": "string"
        },
        "environmental_certifications": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "quality_certifications": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "Design": {
      "type": "object",
      "properties": {
        "designer": {
          "type": "string"
        },
        "studio": {
          "type": "string"
        },
        "collection": {
          "type": "string"
        },
        "series": {
          "type": "string"
        },
        "aesthetic_style": {
          "type": "string"
        },
        "design_era": {
          "type": "string"
        },
        "design_year": {
          "type": "string"
        },
        "design_inspiration": {
          "type": "string"
        }
      }
    },
    "Manufacturing": {
      "type": "object",
      "properties": {
        "factory": {
          "type": "string"
        },
        "manufacturer": {
          "type": "string"
        },
        "factory_group": {
          "type": "string"
        },
        "country_of_origin": {
          "type": "string"
        },
        "manufacturing_process": {
          "type": "string"
        },
        "construction": {
          "type": "string"
        },
        "production_location": {
          "type": "string"
        },
        "brand": {
          "type": "string"
        }
      }
    },
    "Commercial": {
      "type": "object",
      "properties": {
        "pricing": {
          "type": "string"
        },
        "retail_price": {
          "type": "number"
        },
        "wholesale_price": {
          "type": "number"
        },
        "currency": {
          "type": "string"
        },
        "price_unit": {
          "type": "string"
        },
        "availability": {
          "type": "string"
        },
        "lead_time": {
          "type": "string"
        },
        "minimum_order": {
          "type": "string"
        },
        "supplier": {
          "type": "string"
        },
        "distributor": {
          "type": "string"
        },
        "warranty": {
          "type": "string"
        },
        "warranty_period": {
          "type": "string"
        },
        "return_policy": {
          "type": "string"
        }
      }
    },
    "ProductVariant": {
      "type": "object",
      "properties": {
        "variant_id": {
          "type": "string"
        },
        "sku": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "color": {
          "type": "string"
        },
        "color_code": {
          "type": "string"
        },
        "shape": {
          "type": "string"
        },
        "pattern": {
          "type": "string"
        },
        "size": {
          "type": "string"
        },
        "pattern_count": {
          "type": "number"
        },
        "finish": {
          "type": "string"
        },
        "texture": {
          "type": "string"
        },
        "mapei_code": {
          "type": "string"
        },
        "kerakoll_code": {
          "type": "string"
        },
        "availability": {
          "type": "string"
        },
        "price_modifier": {
          "type": "string"
        }
      }
    },
    "Packaging": {
      "type": "object",
      "properties": {
        "package_type": {
          "type": "string"
        },
        "pieces_per_package": {
          "type": "number"
        },
        "square_meters_per_package": {
          "type": "number"
        },
        "package_weight": {
          "type": "string"
        },
        "package_dimensions": {
          "type": "string"
        },
        "packages_per_pallet": {
          "type": "number"
        },
        "pallet_weight": {
          "type": "string"
        },
        "storage_requirements": {
          "type": "string"
        }
      }
    },
    "ProductMetadata": {
      "type": "object",
      "properties": {
        "page_range": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "confidence_score": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "extraction_method": {
          "type": "string"
        },
        "source_document": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "keywords": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "related_products": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "alternatives": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "accessories": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "grout_recommendations": {
          "type": "object",
          "properties": {
            "mapei": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "kerakoll": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "isomat": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "technica": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "other_brands": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "Metafield": {
      "type": "object",
      "properties": {
        "field_id": {
          "type": "string"
        },
        "field_name": {
          "type": "string"
        },
        "field_type": {
          "type": "string",
          "enum": ["text", "number", "boolean", "enum", "array"]
        },
        "field_value": {},
        "field_category": {
          "type": "string"
        },
        "confidence_score": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "extraction_method": {
          "type": "string"
        },
        "source_page": {
          "type": "number"
        },
        "validation_status": {
          "type": "string"
        }
      }
    },
    "Relationships": {
      "type": "object",
      "properties": {
        "related_images": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "related_chunks": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "related_documents": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "product_family": {
          "type": "string"
        },
        "parent_product": {
          "type": "string"
        },
        "child_products": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

