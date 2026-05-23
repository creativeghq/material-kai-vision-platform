/**
 * XML Field Mapping Dictionary
 *
 * Deterministic rule-shortcut for the XML import field-detection step. Used by
 * `xml-import-orchestrator` (and any other edge function that needs to suggest
 * a product-schema target for an XML tag name).
 *
 * Architecture:
 *   1. The orchestrator's preview pass detects every tag name in the feed.
 *   2. For each tag, `lookupField()` does a direct dictionary hit + regex
 *      fallback. ~60-80% of fields in a typical feed resolve here.
 *   3. Fields the dictionary couldn't confidently match (confidence < 0.85
 *      or fell through to `metadata`) are sent to Claude in a single batched
 *      prompt as the AI residual pass.
 *
 * To add coverage for a new language or supplier:
 *   - Add lowercase tag entries to MAPPING_RULES (toLowerCase() is called on
 *     the XML tag before lookup, so entries here MUST be lowercase).
 *   - For digit-suffix patterns (image1, dim2), prefer REGEX_RULES.
 *   - Confidence ≥ 0.85 short-circuits the AI residual call; use that for
 *     unambiguous matches only. Lower confidence values cost nothing — they
 *     just don't bypass the AI pass.
 *
 * Test: the orchestrator's preview pass logs the rule-shortcut hit rate;
 * watch for it in Supabase function logs after adding entries.
 */

export interface MappingSuggestion {
  mapping: string;
  confidence: number;
}

export const MAPPING_RULES: Record<string, MappingSuggestion> = {
  // ---------- Name variations ----------
  'name': { mapping: 'name', confidence: 1.0 },
  'title': { mapping: 'name', confidence: 0.95 },
  'product_name': { mapping: 'name', confidence: 1.0 },
  'productname': { mapping: 'name', confidence: 1.0 },
  'nombre': { mapping: 'name', confidence: 0.95 },
  'titulo': { mapping: 'name', confidence: 0.9 },
  'nom': { mapping: 'name', confidence: 0.95 },

  // ---------- Factory / manufacturer ----------
  'factory': { mapping: 'factory_name', confidence: 1.0 },
  'factory_name': { mapping: 'factory_name', confidence: 1.0 },
  'manufacturer': { mapping: 'factory_name', confidence: 1.0 },
  'supplier': { mapping: 'factory_name', confidence: 0.95 },
  'brand': { mapping: 'factory_name', confidence: 0.9 },
  'fabricante': { mapping: 'factory_name', confidence: 0.95 },
  'fabricant': { mapping: 'factory_name', confidence: 0.95 },

  // Factory group
  'factory_group': { mapping: 'factory_group_name', confidence: 1.0 },
  'factory_group_name': { mapping: 'factory_group_name', confidence: 1.0 },
  'group': { mapping: 'factory_group_name', confidence: 0.85 },
  'brand_group': { mapping: 'factory_group_name', confidence: 0.9 },

  // Factory address / location
  'address': { mapping: 'factory_address', confidence: 0.9 },
  'factory_address': { mapping: 'factory_address', confidence: 1.0 },
  'manufacturer_address': { mapping: 'factory_address', confidence: 1.0 },
  'city': { mapping: 'factory_city', confidence: 0.9 },
  'factory_city': { mapping: 'factory_city', confidence: 1.0 },
  'country': { mapping: 'factory_country', confidence: 0.9 },
  'factory_country': { mapping: 'factory_country', confidence: 1.0 },
  'manufacturer_country': { mapping: 'factory_country', confidence: 1.0 },
  'postal_code': { mapping: 'factory_postal_code', confidence: 0.9 },
  'zip': { mapping: 'factory_postal_code', confidence: 0.85 },

  // Contact
  'phone': { mapping: 'factory_phone', confidence: 0.9 },
  'factory_phone': { mapping: 'factory_phone', confidence: 1.0 },
  'manufacturer_phone': { mapping: 'factory_phone', confidence: 1.0 },
  'tel': { mapping: 'factory_phone', confidence: 0.85 },
  'telephone': { mapping: 'factory_phone', confidence: 0.9 },
  'email': { mapping: 'factory_email', confidence: 0.9 },
  'factory_email': { mapping: 'factory_email', confidence: 1.0 },
  'manufacturer_email': { mapping: 'factory_email', confidence: 1.0 },
  'website': { mapping: 'factory_website', confidence: 0.9 },
  'factory_website': { mapping: 'factory_website', confidence: 1.0 },
  'manufacturer_website': { mapping: 'factory_website', confidence: 1.0 },
  'url': { mapping: 'factory_website', confidence: 0.8 },
  'homepage': { mapping: 'factory_website', confidence: 0.85 },

  // Origin
  'country_of_origin': { mapping: 'factory_country_of_origin', confidence: 1.0 },
  'origin': { mapping: 'factory_country_of_origin', confidence: 0.9 },
  'made_in': { mapping: 'factory_country_of_origin', confidence: 0.95 },

  // Company details
  'founded': { mapping: 'factory_founded_year', confidence: 0.9 },
  'founded_year': { mapping: 'factory_founded_year', confidence: 1.0 },
  'established': { mapping: 'factory_founded_year', confidence: 0.85 },
  'employees': { mapping: 'factory_employee_count', confidence: 0.9 },
  'employee_count': { mapping: 'factory_employee_count', confidence: 1.0 },
  'linkedin': { mapping: 'factory_linkedin_url', confidence: 0.9 },
  'linkedin_url': { mapping: 'factory_linkedin_url', confidence: 1.0 },

  // ---------- Category ----------
  'category': { mapping: 'material_category', confidence: 1.0 },
  'material_category': { mapping: 'material_category', confidence: 1.0 },
  'type': { mapping: 'material_category', confidence: 0.9 },
  'material_type': { mapping: 'material_category', confidence: 1.0 },
  'categoria': { mapping: 'material_category', confidence: 0.95 },
  'tipo': { mapping: 'material_category', confidence: 0.9 },
  'categorie': { mapping: 'material_category', confidence: 0.95 },

  // ---------- Description ----------
  'description': { mapping: 'description', confidence: 1.0 },
  'desc': { mapping: 'description', confidence: 0.95 },
  'descripcion': { mapping: 'description', confidence: 0.95 },

  // ---------- Price ----------
  'price': { mapping: 'price', confidence: 1.0 },
  'cost': { mapping: 'price', confidence: 0.85 },
  'precio': { mapping: 'price', confidence: 0.95 },
  'prix': { mapping: 'price', confidence: 0.95 },
  'preis': { mapping: 'price', confidence: 0.95 },
  'pricew': { mapping: 'price', confidence: 0.85 },        // ERP wholesale price (Panagoulas-style)
  'priceretail': { mapping: 'price', confidence: 0.85 },    // ERP retail price (Panagoulas-style)
  'price_w': { mapping: 'price', confidence: 0.85 },
  'price_retail': { mapping: 'price', confidence: 0.85 },
  'wholesale_price': { mapping: 'price', confidence: 0.9 },
  'retail_price': { mapping: 'price', confidence: 0.9 },

  // ---------- SKU / external id ----------
  'sku': { mapping: 'external_sku', confidence: 1.0 },
  'external_sku': { mapping: 'external_sku', confidence: 1.0 },
  'product_code': { mapping: 'external_sku', confidence: 0.9 },
  'product_id': { mapping: 'external_sku', confidence: 0.9 },
  'item_id': { mapping: 'external_sku', confidence: 0.85 },
  'mtrl': { mapping: 'external_sku', confidence: 0.8 },     // Greek ERP internal material id
  'code': { mapping: 'external_sku', confidence: 0.8 },     // common SKU shorthand
  'kodikos': { mapping: 'external_sku', confidence: 0.85 }, // Greek "κωδικός"

  // ---------- Collection / model ----------
  'collection': { mapping: 'collection', confidence: 1.0 },
  'coleccion': { mapping: 'collection', confidence: 0.9 },
  'serie': { mapping: 'collection', confidence: 0.85 },
  'series': { mapping: 'collection', confidence: 0.85 },
  'model': { mapping: 'collection', confidence: 0.8 },
  'modelname': { mapping: 'collection', confidence: 0.75 },
  'model_name': { mapping: 'collection', confidence: 0.8 },

  // ---------- Color ----------
  'color': { mapping: 'color', confidence: 1.0 },
  'colors': { mapping: 'colors', confidence: 1.0 },
  'colour': { mapping: 'color', confidence: 1.0 },
  'colours': { mapping: 'colors', confidence: 1.0 },

  // ---------- Dimensions / size ----------
  'dimensions': { mapping: 'dimensions', confidence: 1.0 },
  'dimension': { mapping: 'dimensions', confidence: 0.95 },
  'dim': { mapping: 'dimensions', confidence: 0.8 },
  'dimensiones': { mapping: 'dimensions', confidence: 0.95 },
  'size': { mapping: 'size', confidence: 1.0 },
  'sizes': { mapping: 'size', confidence: 0.9 },

  // ---------- Finish / material attribute / designer ----------
  'finish': { mapping: 'finish', confidence: 1.0 },
  'acabado': { mapping: 'finish', confidence: 0.9 },
  'material': { mapping: 'material', confidence: 1.0 },
  'materia': { mapping: 'material', confidence: 0.85 },
  'designer': { mapping: 'designer', confidence: 1.0 },
  'disenador': { mapping: 'designer', confidence: 0.9 },

  // ---------- Images ----------
  'image': { mapping: 'images', confidence: 1.0 },
  'images': { mapping: 'images', confidence: 1.0 },
  'img': { mapping: 'images', confidence: 0.95 },
  'picture': { mapping: 'images', confidence: 0.9 },
  'photo': { mapping: 'images', confidence: 0.9 },
  'imagen': { mapping: 'images', confidence: 0.95 },
  'image_link': { mapping: 'images', confidence: 1.0 },
  'image_url': { mapping: 'images', confidence: 1.0 },
  'imagen_url': { mapping: 'images', confidence: 0.95 },
  'additional_image_link': { mapping: 'images', confidence: 0.95 },
  'additional_images': { mapping: 'images', confidence: 0.95 },

  // ---------- Greek synonyms ----------
  // toLowerCase() handles Greek capitals correctly (Π → π, etc.). Tag names
  // from Greek ERP feeds (Panagoulas, Kariera, etc.) often mix Greek words
  // with English; we cover both the bare Greek term and accent-less variants
  // since some encoders strip accents.

  // Name
  'όνομα': { mapping: 'name', confidence: 0.95 },
  'ονομα': { mapping: 'name', confidence: 0.9 },
  'ονομασία': { mapping: 'name', confidence: 0.95 },
  'τίτλος': { mapping: 'name', confidence: 0.9 },
  'περιγραφή_προϊόντος': { mapping: 'name', confidence: 0.85 },

  // Manufacturer / brand
  'κατασκευαστής': { mapping: 'factory_name', confidence: 0.95 },
  'κατασκευαστης': { mapping: 'factory_name', confidence: 0.9 },
  'κατασκευάστρια': { mapping: 'factory_name', confidence: 0.95 },
  'προμηθευτής': { mapping: 'factory_name', confidence: 0.9 },
  'μάρκα': { mapping: 'factory_name', confidence: 0.9 },
  'εταιρεία': { mapping: 'factory_name', confidence: 0.8 },

  // Category
  'κατηγορία': { mapping: 'material_category', confidence: 0.95 },
  'κατηγορια': { mapping: 'material_category', confidence: 0.9 },
  'είδος': { mapping: 'material_category', confidence: 0.85 },
  'τύπος': { mapping: 'material_category', confidence: 0.85 },
  'κλάση': { mapping: 'material_category', confidence: 0.8 },

  // Description
  'περιγραφή': { mapping: 'description', confidence: 0.95 },
  'περιγραφη': { mapping: 'description', confidence: 0.9 },
  'σχόλιο': { mapping: 'description', confidence: 0.7 },

  // Price
  'τιμή': { mapping: 'price', confidence: 0.95 },
  'τιμη': { mapping: 'price', confidence: 0.9 },
  'κόστος': { mapping: 'price', confidence: 0.85 },
  'τιμή_χονδρικής': { mapping: 'price', confidence: 0.85 },
  'τιμή_λιανικής': { mapping: 'price', confidence: 0.85 },

  // Color
  'χρώμα': { mapping: 'color', confidence: 0.95 },
  'χρωμα': { mapping: 'color', confidence: 0.9 },
  'χρώματα': { mapping: 'colors', confidence: 0.95 },

  // Dimensions / size
  'διαστάσεις': { mapping: 'dimensions', confidence: 0.95 },
  'διασταση': { mapping: 'dimensions', confidence: 0.9 },
  'διάσταση': { mapping: 'dimensions', confidence: 0.9 },
  'μέγεθος': { mapping: 'size', confidence: 0.9 },

  // Material / finish
  'υλικό': { mapping: 'material', confidence: 0.9 },
  'φινίρισμα': { mapping: 'finish', confidence: 0.9 },
  'επιφάνεια': { mapping: 'finish', confidence: 0.75 },
  'τελείωμα': { mapping: 'finish', confidence: 0.85 },

  // Collection
  'συλλογή': { mapping: 'collection', confidence: 0.9 },
  'σειρά': { mapping: 'collection', confidence: 0.85 },

  // Designer
  'σχεδιαστής': { mapping: 'designer', confidence: 0.9 },

  // Images
  'εικόνα': { mapping: 'images', confidence: 0.95 },
  'εικονα': { mapping: 'images', confidence: 0.9 },
  'εικόνες': { mapping: 'images', confidence: 0.95 },
  'φωτογραφία': { mapping: 'images', confidence: 0.9 },
  'φωτογραφίες': { mapping: 'images', confidence: 0.9 },

  // Factory address / contact
  'διεύθυνση': { mapping: 'factory_address', confidence: 0.85 },
  'πόλη': { mapping: 'factory_city', confidence: 0.9 },
  'χώρα': { mapping: 'factory_country', confidence: 0.9 },
  'χώρα_προέλευσης': { mapping: 'factory_country_of_origin', confidence: 0.9 },
  'τηλέφωνο': { mapping: 'factory_phone', confidence: 0.9 },
  'τκ': { mapping: 'factory_postal_code', confidence: 0.85 },
  'ιστοσελίδα': { mapping: 'factory_website', confidence: 0.85 },
};

/**
 * Regex fallbacks for digit-suffixed tags common in Greek/Italian/German
 * ERP exports (image1/image2/image_3, dim1/dim2/dim3,
 * additional_image_link_2). Run after MAPPING_RULES so an explicit dictionary
 * entry always wins.
 */
export const REGEX_RULES: Array<{ pattern: RegExp; mapping: string; confidence: number }> = [
  { pattern: /^(image|img|picture|photo|imagen)[_-]?\d+$/, mapping: 'images', confidence: 0.85 },
  { pattern: /^(image|img|picture|photo)[_-]?link[_-]?\d*$/, mapping: 'images', confidence: 0.85 },
  { pattern: /^additional[_-]?(image|images|img)[_-]?(link)?[_-]?\d*$/, mapping: 'images', confidence: 0.85 },
  { pattern: /^dim(\d+|_\d+|ension_\d+)$/, mapping: 'dimensions', confidence: 0.7 },
  { pattern: /^(barcode|ean|gtin|upc)\d*$/, mapping: 'metadata', confidence: 0.7 },
];

/**
 * Threshold above which the dictionary's verdict is considered confident
 * enough to skip the AI residual pass for that field. Tuned to keep noisy
 * partial matches (~0.7-0.8) in the AI bucket while letting solid hits
 * (0.85+) bypass the API call entirely.
 */
export const AI_BYPASS_CONFIDENCE = 0.85;

/**
 * Look up a single XML tag in the dictionary. Returns null if neither the
 * direct dictionary nor the regex rules matched — caller should send those
 * to AI.
 */
export function lookupField(xmlField: string): MappingSuggestion | null {
  const lower = xmlField.toLowerCase();
  if (MAPPING_RULES[lower]) return MAPPING_RULES[lower];
  for (const { pattern, mapping, confidence } of REGEX_RULES) {
    if (pattern.test(lower)) return { mapping, confidence };
  }
  return null;
}

/**
 * Batch lookup: classifies every detected field into {confident, ambiguous,
 * unknown} buckets. Caller uses `confident` directly, sends `ambiguous` +
 * `unknown` to AI as the residual prompt.
 */
export function classifyFields(xmlFields: string[]): {
  confident: Map<string, MappingSuggestion>;
  ambiguous: Map<string, MappingSuggestion>;
  unknown: string[];
} {
  const confident = new Map<string, MappingSuggestion>();
  const ambiguous = new Map<string, MappingSuggestion>();
  const unknown: string[] = [];

  for (const xmlField of xmlFields) {
    const hit = lookupField(xmlField);
    if (!hit) {
      unknown.push(xmlField);
    } else if (hit.confidence >= AI_BYPASS_CONFIDENCE) {
      confident.set(xmlField, hit);
    } else {
      ambiguous.set(xmlField, hit);
    }
  }

  return { confident, ambiguous, unknown };
}
