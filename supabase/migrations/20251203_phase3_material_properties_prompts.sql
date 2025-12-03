-- Phase 3: Material Properties Extraction Prompts Migration
-- Insert default prompts for 9 material property extraction categories

-- 1. Slip Safety Ratings
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for slip resistance and safety properties. Extract the following:

SLIP SAFETY RATINGS:
1. R-Value (DIN 51130): Look for R9, R10, R11, R12, R13 ratings
2. Barefoot Ramp Test (DIN 51097): Look for Class A, B, or C ratings  
3. DCOF Range: Dynamic Coefficient of Friction values (0.0-1.0, ≥0.42 recommended)
4. Pendulum Test Range (PTV): Pendulum Test Values (0-100)
5. Safety Certifications: ANSI A137.1, DIN 51130, DIN 51097, BS 7976, AS/NZS 4586

Return as JSON:
{
    "rValue": ["R10", "R11"],
    "barefootRampTest": ["A", "B"],
    "dcofRange": [0.45, 0.62],
    "pendulumTestRange": [25, 45],
    "safetyCertifications": ["DIN 51130"],
    "confidence": 0.85,
    "category": "slip_safety_ratings"
}',
  'You are an expert at extracting slip resistance and safety properties from material specifications.',
  false, 1, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 2. Surface Gloss/Reflectivity
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for surface gloss and reflectivity properties:

SURFACE GLOSS/REFLECTIVITY:
1. Gloss Level: super-polished, polished, satin, semi-polished, matte, velvet, anti-glare
2. Gloss Value Range: Numerical values 0-100 (gloss meter readings)
3. Surface Finish descriptions and specifications

Return as JSON:
{
    "glossLevel": ["polished", "satin"],
    "glossValueRange": [15, 35],
    "confidence": 0.90,
    "category": "surface_gloss_reflectivity"
}',
  'You are an expert at extracting surface gloss and reflectivity properties from material specifications.',
  false, 2, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 3. Mechanical Properties
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for mechanical properties:

MECHANICAL PROPERTIES:
1. Mohs Hardness: Scale 1-10 (1=talc, 10=diamond)
2. PEI Rating: Abrasion resistance Class 0-5 (porcelain enamel institute)
3. Tensile strength, compressive strength, elastic modulus if mentioned
4. Durability ratings and wear resistance classifications

Return as JSON:
{
    "mohsHardnessRange": [6.5, 7.0],
    "peiRating": [3, 4],
    "tensileStrength": 45.5,
    "compressiveStrength": 120.0,
    "confidence": 0.88,
    "category": "mechanical_properties_extended"
}',
  'You are an expert at extracting mechanical properties from material specifications.',
  false, 3, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 4. Thermal Properties
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for thermal properties:

THERMAL PROPERTIES:
1. Thermal Conductivity: W/mK values (0-10+ range)
2. Heat Resistance: Temperature range in °C (0-500°C+)
3. Radiant Heating Compatibility: Yes/No/Compatible
4. Thermal expansion coefficient if mentioned
5. Fire resistance ratings or classifications

Return as JSON:
{
    "thermalConductivityRange": [0.8, 1.2],
    "heatResistanceRange": [200, 300],
    "radiantHeatingCompatible": true,
    "thermalExpansion": 8.6e-6,
    "confidence": 0.82,
    "category": "thermal_properties"
}',
  'You are an expert at extracting thermal properties from material specifications.',
  false, 4, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 5. Water/Moisture Resistance
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for water and moisture resistance:

WATER/MOISTURE RESISTANCE:
1. Water Absorption Range: Percentage 0-20%
2. Frost Resistance: Yes/No/Rated
3. Mold/Mildew Resistance: Yes/No/Treated
4. Porosity levels and permeability ratings
5. Waterproof vs water-resistant classifications

Return as JSON:
{
    "waterAbsorptionRange": [0.1, 0.5],
    "frostResistance": true,
    "moldMildewResistant": true,
    "porosity": "low",
    "confidence": 0.91,
    "category": "water_moisture_resistance"
}',
  'You are an expert at extracting water and moisture resistance properties from material specifications.',
  false, 5, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 6. Chemical/Hygiene Resistance
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for chemical and hygiene resistance:

CHEMICAL/HYGIENE RESISTANCE:
1. Acid Resistance Level: low, medium, high, excellent
2. Alkali Resistance Level: low, medium, high, excellent
3. Stain Resistance Class: Class 1-5 ratings
4. Food Safe Certification: FDA approved, food contact safe
5. Chemical compatibility with cleaners, solvents

Return as JSON:
{
    "acidResistance": ["high"],
    "alkaliResistance": ["medium", "high"],
    "stainResistanceClass": [4, 5],
    "foodSafeCertified": true,
    "confidence": 0.86,
    "category": "chemical_hygiene_resistance"
}',
  'You are an expert at extracting chemical and hygiene resistance properties from material specifications.',
  false, 6, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 7. Acoustic/Electrical Properties
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for acoustic and electrical properties:

ACOUSTIC/ELECTRICAL PROPERTIES:
1. NRC Range: Noise Reduction Coefficient 0.0-1.0
2. Anti-Static Properties: Yes/No/ESD safe
3. Electrical Conductivity: Conductive/Non-conductive/Semi-conductive
4. Sound absorption coefficients and ratings
5. EMI/EMC shielding properties if applicable

Return as JSON:
{
    "nrcRange": [0.15, 0.25],
    "antiStatic": true,
    "conductive": false,
    "soundAbsorption": 0.22,
    "confidence": 0.79,
    "category": "acoustic_electrical_properties"
}',
  'You are an expert at extracting acoustic and electrical properties from material specifications.',
  false, 7, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 8. Environmental/Sustainability
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for environmental and sustainability properties:

ENVIRONMENTAL/SUSTAINABILITY:
1. Greenguard Certification: certified, gold, none
2. Total Recycled Content Range: Percentage 0-100%
3. LEED Credits Range: Available credits 0-10
4. VOC emissions, off-gassing properties
5. Carbon footprint, lifecycle assessment data
6. Recyclability and end-of-life properties

Return as JSON:
{
    "greenguardLevel": ["certified"],
    "totalRecycledContentRange": [25, 40],
    "leedCreditsRange": [2, 4],
    "vocEmissions": "low",
    "confidence": 0.84,
    "category": "environmental_sustainability"
}',
  'You are an expert at extracting environmental and sustainability properties from material specifications.',
  false, 8, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- 9. Dimensional/Aesthetic
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'entity_creation',
  'material_properties',
  'Analyze this material document for dimensional and aesthetic properties:

DIMENSIONAL/AESTHETIC:
1. Rectified Edges: Yes/No/Available
2. Texture Rating Range: If texture is rated/classified
3. Shade Variation: V1 (Uniform), V2 (Slight), V3 (Moderate), V4 (Substantial)
4. Dimensional stability and tolerances
5. Color consistency and variation specifications

Return as JSON:
{
    "rectifiedEdges": true,
    "textureRatingRange": true,
    "shadeVariation": ["V2", "V3"],
    "dimensionalStability": "high",
    "confidence": 0.88,
    "category": "dimensional_aesthetic"
}',
  'You are an expert at extracting dimensional and aesthetic properties from material specifications.',
  false, 9, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO NOTHING;

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Phase 3 Migration Complete: Inserted 9 material property extraction prompts';
END $$;

