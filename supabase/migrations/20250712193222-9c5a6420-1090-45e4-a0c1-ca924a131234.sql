-- Add comprehensive material metadata fields based on the provided JSON structure

-- TILES metadata fields
INSERT INTO public.material_metadata_fields (field_name, display_name, field_type, applies_to_categories, description, dropdown_options, is_global, sort_order) VALUES
-- Identification fields for tiles
('tile_type', 'Tile Type', 'dropdown', ARRAY['ceramics'], 'Type of tile material', ARRAY['ceramic', 'porcelain', 'natural stone', 'glass', 'metal', 'composite', 'mosaic'], false, 1),
('tile_subtype', 'Tile Subtype', 'text', ARRAY['ceramics'], 'Specific subtype of tile', NULL, false, 2),
('manufacturing_method', 'Manufacturing Method', 'dropdown', ARRAY['ceramics'], 'How the tile was manufactured', ARRAY['pressed', 'extruded', 'cast', 'handmade'], false, 3),
('certifications', 'Certifications', 'multiselect', ARRAY['ceramics'], 'Quality and environmental certifications', ARRAY['ISO', 'CE', 'GREENGUARD', 'LEED', 'ANSI', 'other'], false, 4),

-- Physical properties for tiles
('length', 'Length', 'number', ARRAY['ceramics'], 'Length dimension', NULL, false, 10),
('width', 'Width', 'number', ARRAY['ceramics'], 'Width dimension', NULL, false, 11),
('thickness', 'Thickness', 'number', ARRAY['ceramics'], 'Thickness dimension', NULL, false, 12),
('dimension_unit', 'Dimension Unit', 'dropdown', ARRAY['ceramics'], 'Unit for dimensions', ARRAY['mm', 'cm', 'inch', 'm', 'ft'], false, 13),
('weight_value', 'Weight Value', 'number', ARRAY['ceramics'], 'Weight value', NULL, false, 14),
('weight_unit', 'Weight Unit', 'dropdown', ARRAY['ceramics'], 'Unit for weight', ARRAY['kg/m²', 'lb/ft²', 'kg', 'lb'], false, 15),
('tile_shape', 'Shape', 'dropdown', ARRAY['ceramics'], 'Geometric shape of tile', ARRAY['square', 'rectangular', 'hexagonal', 'octagonal', 'triangular', 'irregular', 'mosaic'], false, 16),
('primary_color', 'Primary Color', 'text', ARRAY['ceramics'], 'Main color', NULL, false, 17),
('secondary_color', 'Secondary Color', 'text', ARRAY['ceramics'], 'Secondary color if applicable', NULL, false, 18),
('color_family', 'Color Family', 'dropdown', ARRAY['ceramics'], 'General color category', ARRAY['white', 'black', 'grey', 'brown', 'beige', 'red', 'blue', 'green', 'yellow', 'multicolor'], false, 19),

-- Installation properties for tiles
('joint_width', 'Joint Width', 'number', ARRAY['ceramics'], 'Recommended joint width in mm', NULL, false, 20),
('installation_format', 'Installation Format', 'dropdown', ARRAY['ceramics'], 'Installation pattern format', ARRAY['single', 'multi-format', 'pattern', 'modular'], false, 21),
('installation_method', 'Installation Method', 'dropdown', ARRAY['ceramics'], 'How tiles are installed', ARRAY['adhesive', 'mortar', 'floating', 'interlocking'], false, 22),
('subfloor_requirements', 'Subfloor Requirements', 'text', ARRAY['ceramics'], 'Requirements for subfloor preparation', NULL, false, 23),

-- Technical specifications for tiles
('water_absorption', 'Water Absorption', 'dropdown', ARRAY['ceramics'], 'Water absorption classification', ARRAY['BIa (≤0.5%)', 'BIb (0.5-3%)', 'BIIa (3-6%)', 'BIIb (6-10%)', 'BIII (>10%)'], false, 30),
('slip_resistance', 'Slip Resistance', 'dropdown', ARRAY['ceramics'], 'Slip resistance rating', ARRAY['R9', 'R10', 'R11', 'R12', 'R13'], false, 31),
('frost_resistance', 'Frost Resistance', 'boolean', ARRAY['ceramics'], 'Can withstand freezing temperatures', NULL, false, 32),
('chemical_resistance', 'Chemical Resistance', 'dropdown', ARRAY['ceramics'], 'Resistance to chemicals', ARRAY['AA', 'A', 'B', 'C', 'D'], false, 33),
('pei_rating', 'PEI Rating', 'dropdown', ARRAY['ceramics'], 'Wear resistance rating', ARRAY['1', '2', '3', '4', '5'], false, 34),
('mohs_hardness', 'Mohs Hardness', 'dropdown', ARRAY['ceramics'], 'Hardness scale rating', ARRAY['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], false, 35),
('breaking_strength', 'Breaking Strength', 'number', ARRAY['ceramics'], 'Breaking strength in N', NULL, false, 36),
('modulus_of_rupture', 'Modulus of Rupture', 'number', ARRAY['ceramics'], 'Modulus of rupture in MPa', NULL, false, 37),
('thermal_expansion', 'Thermal Expansion', 'number', ARRAY['ceramics'], 'Thermal expansion coefficient', NULL, false, 38),
('thermal_shock', 'Thermal Shock Resistance', 'boolean', ARRAY['ceramics'], 'Resistance to thermal shock', NULL, false, 39),
('crazing_resistance', 'Crazing Resistance', 'boolean', ARRAY['ceramics'], 'Resistance to crazing', NULL, false, 40),

-- Surface properties for tiles
('surface_finish', 'Surface Finish', 'dropdown', ARRAY['ceramics'], 'Surface finish type', ARRAY['Matte', 'Glossy', 'Semi-polished', 'Lappato', 'Polished', 'Textured', 'Anti-slip', 'Satin', 'Silk', 'Honed', 'Natural', 'Structured'], false, 50),
('edge_type', 'Edge Type', 'dropdown', ARRAY['ceramics'], 'Edge finishing type', ARRAY['Rectified', 'Non-rectified', 'Beveled', 'Micro-beveled', 'Pillowed'], false, 51),
('rectified', 'Rectified', 'boolean', ARRAY['ceramics'], 'Are edges rectified', NULL, false, 52),
('surface_pattern', 'Surface Pattern', 'text', ARRAY['ceramics'], 'Pattern on surface', NULL, false, 53),
('surface_texture', 'Surface Texture', 'text', ARRAY['ceramics'], 'Texture description', NULL, false, 54),
('surface_treatment', 'Surface Treatment', 'dropdown', ARRAY['ceramics'], 'Surface treatment type', ARRAY['glazed', 'unglazed', 'through-body', 'digital print', 'screen print'], false, 55),

-- Performance ratings for tiles
('v_rating', 'V Rating', 'dropdown', ARRAY['ceramics'], 'Shade variation rating', ARRAY['V1', 'V2', 'V3', 'V4'], false, 60),
('fire_rating', 'Fire Rating', 'dropdown', ARRAY['ceramics'], 'Fire resistance classification', ARRAY['A1', 'A2', 'B', 'C', 'D', 'E', 'F'], false, 61),
('heat_resistance', 'Heat Resistance', 'boolean', ARRAY['ceramics'], 'Resistance to heat', NULL, false, 62),
('sound_insulation', 'Sound Insulation', 'text', ARRAY['ceramics'], 'Sound insulation properties', NULL, false, 63),
('stain_resistance', 'Stain Resistance', 'dropdown', ARRAY['ceramics'], 'Resistance to staining', ARRAY['excellent', 'good', 'fair', 'poor'], false, 64),
('fade_resistance', 'Fade Resistance', 'dropdown', ARRAY['ceramics'], 'Resistance to fading', ARRAY['excellent', 'good', 'fair', 'poor'], false, 65),
('antimicrobial', 'Antimicrobial', 'boolean', ARRAY['ceramics'], 'Has antimicrobial properties', NULL, false, 66),

-- Applications for tiles
('usage_type', 'Usage Type', 'multiselect', ARRAY['ceramics'], 'Intended usage', ARRAY['residential', 'commercial', 'industrial', 'outdoor'], false, 70),
('application_areas', 'Application Areas', 'multiselect', ARRAY['ceramics'], 'Where it can be used', ARRAY['floor', 'wall', 'ceiling', 'countertop', 'backsplash', 'shower', 'pool'], false, 71),
('environments', 'Environments', 'multiselect', ARRAY['ceramics'], 'Suitable environments', ARRAY['interior', 'exterior', 'wet areas', 'high traffic', 'kitchen', 'bathroom'], false, 72),
('traffic_rating', 'Traffic Rating', 'dropdown', ARRAY['ceramics'], 'Foot traffic suitability', ARRAY['light', 'moderate', 'heavy', 'extra heavy'], false, 73);

-- STONE metadata fields
INSERT INTO public.material_metadata_fields (field_name, display_name, field_type, applies_to_categories, description, dropdown_options, is_global, sort_order) VALUES
-- Stone identification
('stone_type', 'Stone Type', 'dropdown', ARRAY['concrete'], 'Type of natural stone', ARRAY['granite', 'marble', 'limestone', 'travertine', 'slate', 'sandstone', 'quartzite', 'onyx', 'basalt', 'other'], false, 100),
('formation_type', 'Formation Type', 'dropdown', ARRAY['concrete'], 'Geological formation type', ARRAY['igneous', 'metamorphic', 'sedimentary'], false, 101),
('quarry_name', 'Quarry Name', 'text', ARRAY['concrete'], 'Name of source quarry', NULL, false, 102),

-- Stone physical properties
('stone_density', 'Density', 'number', ARRAY['concrete'], 'Density in kg/m³', NULL, false, 110),
('veining_pattern', 'Veining Pattern', 'dropdown', ARRAY['concrete'], 'Intensity of veining', ARRAY['none', 'light', 'moderate', 'heavy', 'dramatic'], false, 111),
('movement_pattern', 'Movement Pattern', 'dropdown', ARRAY['concrete'], 'Visual movement pattern', ARRAY['static', 'linear', 'flowing', 'bookmatched'], false, 112),

-- Stone technical specs
('compressive_strength', 'Compressive Strength', 'number', ARRAY['concrete'], 'Compressive strength in MPa', NULL, false, 120),
('flexural_strength', 'Flexural Strength', 'number', ARRAY['concrete'], 'Flexural strength in MPa', NULL, false, 121),
('abrasion_resistance', 'Abrasion Resistance', 'number', ARRAY['concrete'], 'Abrasion resistance value', NULL, false, 122),
('porosity', 'Porosity', 'number', ARRAY['concrete'], 'Porosity percentage', NULL, false, 123),
('stone_hardness', 'Hardness', 'number', ARRAY['concrete'], 'Hardness value', NULL, false, 124),
('acid_resistance', 'Acid Resistance', 'boolean', ARRAY['concrete'], 'Resistance to acids', NULL, false, 125),
('thermal_conductivity', 'Thermal Conductivity', 'number', ARRAY['concrete'], 'Thermal conductivity W/mK', NULL, false, 126),
('coefficient_of_expansion', 'Coefficient of Expansion', 'number', ARRAY['concrete'], 'Thermal expansion coefficient', NULL, false, 127),

-- Stone surface properties
('edge_profile', 'Edge Profile', 'dropdown', ARRAY['concrete'], 'Edge finishing profile', ARRAY['straight', 'beveled', 'bullnose', 'ogee', 'custom'], false, 130),
('stone_surface_treatment', 'Surface Treatment', 'dropdown', ARRAY['concrete'], 'Surface treatment applied', ARRAY['sealed', 'unsealed', 'impregnated', 'coated'], false, 131);

-- WOOD metadata fields
INSERT INTO public.material_metadata_fields (field_name, display_name, field_type, applies_to_categories, description, dropdown_options, is_global, sort_order) VALUES
-- Wood identification
('wood_type', 'Wood Type', 'dropdown', ARRAY['wood'], 'Type of wood product', ARRAY['solid', 'engineered', 'bamboo', 'cork'], false, 200),
('wood_species', 'Wood Species', 'text', ARRAY['wood'], 'Species name', NULL, false, 201),
('species_family', 'Species Family', 'dropdown', ARRAY['wood'], 'Wood family classification', ARRAY['hardwood', 'softwood', 'exotic'], false, 202),
('wood_grade', 'Grade', 'dropdown', ARRAY['wood'], 'Quality grade', ARRAY['select', 'prime', 'standard', 'rustic', 'character'], false, 203),
('wood_cut', 'Cut Type', 'dropdown', ARRAY['wood'], 'How wood was cut', ARRAY['plain sawn', 'quarter sawn', 'rift sawn', 'live edge'], false, 204),

-- Wood physical properties
('length_variation', 'Length Variation', 'boolean', ARRAY['wood'], 'Variable plank lengths', NULL, false, 210),
('width_variation', 'Width Variation', 'boolean', ARRAY['wood'], 'Variable plank widths', NULL, false, 211),
('installation_pattern', 'Installation Pattern', 'dropdown', ARRAY['wood'], 'Recommended installation pattern', ARRAY['straight', 'herringbone', 'chevron', 'parquet', 'random'], false, 212),
('color_variation', 'Color Variation', 'dropdown', ARRAY['wood'], 'Natural color variation', ARRAY['uniform', 'slight', 'moderate', 'high'], false, 213),

-- Wood technical specs
('janka_hardness', 'Janka Hardness', 'number', ARRAY['wood'], 'Janka hardness rating', NULL, false, 220),
('hardness_scale', 'Hardness Scale', 'dropdown', ARRAY['wood'], 'Scale used for hardness', ARRAY['Janka', 'Brinell'], false, 221),
('grain_pattern', 'Grain Pattern', 'text', ARRAY['wood'], 'Description of grain pattern', NULL, false, 222),
('moisture_content', 'Moisture Content', 'number', ARRAY['wood'], 'Moisture content percentage', NULL, false, 223),
('wood_treatment', 'Treatment', 'text', ARRAY['wood'], 'Chemical or physical treatment', NULL, false, 224),
('dimensional_stability', 'Dimensional Stability', 'number', ARRAY['wood'], 'Stability rating', NULL, false, 225),
('wear_resistance', 'Wear Resistance', 'dropdown', ARRAY['wood'], 'Resistance to wear', ARRAY['excellent', 'good', 'fair', 'poor'], false, 226),

-- Wood surface properties
('wood_surface_treatment', 'Surface Treatment', 'dropdown', ARRAY['wood'], 'Surface treatment type', ARRAY['prefinished', 'unfinished', 'hand-scraped', 'wire-brushed', 'distressed', 'smooth'], false, 230),
('wood_edge_profile', 'Edge Profile', 'dropdown', ARRAY['wood'], 'Edge finishing', ARRAY['square', 'micro-beveled', 'beveled', 'pillowed'], false, 231),
('wear_layer_thickness', 'Wear Layer Thickness', 'number', ARRAY['wood'], 'Thickness of wear layer in mm', NULL, false, 232),

-- Wood construction
('construction_layers', 'Number of Layers', 'number', ARRAY['wood'], 'Number of construction layers', NULL, false, 240),
('core_type', 'Core Type', 'dropdown', ARRAY['wood'], 'Core material type', ARRAY['plywood', 'HDF', 'softwood', 'hardwood'], false, 241),
('top_layer_thickness', 'Top Layer Thickness', 'number', ARRAY['wood'], 'Thickness of top layer in mm', NULL, false, 242),
('wood_installation_method', 'Installation Method', 'dropdown', ARRAY['wood'], 'How wood is installed', ARRAY['nail down', 'glue down', 'floating', 'click lock'], false, 243),
('underlayment_required', 'Underlayment Required', 'boolean', ARRAY['wood'], 'Requires underlayment', NULL, false, 244);

-- COMMON PROPERTIES (applies to all materials)
INSERT INTO public.material_metadata_fields (field_name, display_name, field_type, applies_to_categories, description, dropdown_options, is_global, sort_order) VALUES
-- Brand and identification (global)
('brand', 'Brand', 'text', NULL, 'Manufacturer brand name', NULL, true, 1),
('collection', 'Collection', 'text', NULL, 'Product collection name', NULL, true, 2),
('model', 'Model', 'text', NULL, 'Model number or name', NULL, true, 3),
('sku', 'SKU', 'text', NULL, 'Stock keeping unit', NULL, true, 4),
('origin_country', 'Origin Country', 'text', NULL, 'Country of origin/manufacture', NULL, true, 5),

-- Pricing (global)
('price_currency', 'Currency', 'dropdown', NULL, 'Price currency', ARRAY['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'other'], true, 300),
('price_unit', 'Price Unit', 'dropdown', NULL, 'Unit for pricing', ARRAY['per m²', 'per ft²', 'per piece', 'per box', 'per linear foot', 'per linear meter'], true, 301),
('price_range', 'Price Range', 'dropdown', NULL, 'General price category', ARRAY['budget', 'mid-range', 'premium', 'luxury'], true, 302),

-- Availability (global)
('stock_status', 'Stock Status', 'dropdown', NULL, 'Availability status', ARRAY['in stock', 'made to order', 'discontinued', 'seasonal'], true, 310),
('lead_time_days', 'Lead Time (Days)', 'number', NULL, 'Lead time in days', NULL, true, 311),
('minimum_order', 'Minimum Order', 'number', NULL, 'Minimum order quantity', NULL, true, 312),

-- Sustainability (global)
('recycled_content_percent', 'Recycled Content %', 'number', NULL, 'Percentage of recycled content', NULL, true, 320),
('recyclable', 'Recyclable', 'boolean', NULL, 'Can be recycled', NULL, true, 321),
('voc_level', 'VOC Level', 'dropdown', NULL, 'Volatile organic compound level', ARRAY['zero', 'low', 'moderate', 'high'], true, 322),
('energy_efficiency', 'Energy Efficiency', 'text', NULL, 'Energy efficiency rating', NULL, true, 323),
('carbon_footprint', 'Carbon Footprint', 'text', NULL, 'Carbon footprint information', NULL, true, 324),

-- Maintenance (global)
('cleaning_method', 'Cleaning Method', 'multiselect', NULL, 'Recommended cleaning methods', ARRAY['dry mop', 'damp mop', 'steam', 'specialized cleaner'], true, 330),
('sealing_required', 'Sealing Required', 'boolean', NULL, 'Requires periodic sealing', NULL, true, 331),
('maintenance_frequency', 'Maintenance Frequency', 'dropdown', NULL, 'How often maintenance is needed', ARRAY['daily', 'weekly', 'monthly', 'yearly', 'as needed'], true, 332),
('repairability', 'Repairability', 'dropdown', NULL, 'How easily material can be repaired', ARRAY['excellent', 'good', 'fair', 'poor'], true, 333),

-- Installation (global)
('difficulty_level', 'Installation Difficulty', 'dropdown', NULL, 'Installation difficulty level', ARRAY['DIY', 'semi-professional', 'professional only'], true, 340),
('tools_required', 'Tools Required', 'text', NULL, 'Tools needed for installation', NULL, true, 341),
('preparation_needed', 'Preparation Needed', 'text', NULL, 'Preparation requirements', NULL, true, 342),
('installation_time', 'Installation Time', 'text', NULL, 'Estimated installation time', NULL, true, 343),

-- Image types (global)
('image_type', 'Image Type', 'dropdown', NULL, 'Type of product image', ARRAY['primary', 'secondary', 'detail', 'room-scene', 'installation', 'texture-close-up', 'edge-detail'], true, 350);

-- Update existing material categories to match our structure
-- Note: We're mapping 'ceramics' to tiles, 'concrete' to stone, 'wood' to wood
-- These should align with your existing material_category enum