/**
 * Category Field Registry — Frontend Display Configuration
 * =========================================================
 * Mirrors the Python category_field_registry.py for display purposes.
 * Controls which modal sections are shown per category and defines
 * the priority display fields for each section.
 *
 * The 10 categories match the `material_categories` DB table exactly:
 * tiles, wood, decor, furniture, general_materials, paint_wall_decor,
 * heating, sanitary, kitchen, lighting
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type UploadCategory =
  | 'tiles'
  | 'wood'
  | 'decor'
  | 'furniture'
  | 'general_materials'
  | 'paint_wall_decor'
  | 'heating'
  | 'sanitary'
  | 'kitchen'
  | 'lighting';

/** A display section in the product modal. */
export interface DisplaySection {
  /** Unique section key (used as React key and for conditional logic). */
  key: string;
  /** Section heading shown in the modal. */
  label: string;
  /**
   * Metadata field keys to display in this section, in order.
   * The modal reads these from `product.metadata` (merged with
   * properties/specifications). If a key has no value, it's skipped.
   */
  fields: Array<{ key: string; label: string }>;
}

export interface CategoryDisplayConfig {
  displayName: string;
  /** Theme color for the category badge / accent. */
  themeColor: string;
  /** Sections to render in the Details tab, in order. */
  sections: DisplaySection[];
  /**
   * Fine-grained material_category slugs that map to this upload category.
   * Used by `resolveUploadCategory()` to map the AI-extracted
   * `material_category` value back to one of our 10 DB categories.
   */
  controlledVocab: string[];
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const CATEGORY_DISPLAY_REGISTRY: Record<UploadCategory, CategoryDisplayConfig> = {

  // ═══ TILES ════════════════════════════════════════════════════════════════
  tiles: {
    displayName: 'Tiles',
    themeColor: '#3b82f6',
    controlledVocab: [
      'floor_tile', 'wall_tile', 'bathroom_tile', 'shower_tile',
      'porcelain_tile', 'ceramic_tile', 'tile', 'porcelain', 'ceramic',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'patterns', label: 'Patterns' },
          { key: 'texture', label: 'Texture' },
          { key: 'shade_variation', label: 'Shade Variation' },
          { key: 'visual_effect', label: 'Visual Effect' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'pei_rating', label: 'PEI Rating' },
          { key: 'slip_resistance', label: 'Slip Resistance' },
          { key: 'water_absorption', label: 'Water Absorption' },
          { key: 'water_absorption_pct', label: 'Water Absorption %' },
          { key: 'frost_resistance', label: 'Frost Resistance' },
          { key: 'breaking_strength', label: 'Breaking Strength' },
          { key: 'abrasion_resistance', label: 'Abrasion Resistance' },
          { key: 'chemical_resistance', label: 'Chemical Resistance' },
          { key: 'mohs_hardness', label: 'Mohs Hardness' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'traffic_level', label: 'Traffic Level' },
        ],
      },
      {
        key: 'application',
        label: 'Application & Installation',
        fields: [
          { key: 'recommended_use', label: 'Recommended Use' },
          { key: 'applications', label: 'Applications' },
          { key: 'installation_method', label: 'Installation Method' },
          { key: 'joint_width_mm', label: 'Joint Width' },
          { key: 'suitable_rooms', label: 'Room Type' },
          { key: 'underfloor_heating', label: 'Underfloor Heating' },
        ],
      },
      {
        key: 'packaging',
        label: 'Packaging',
        fields: [
          { key: 'pieces_per_box', label: 'Pieces / Box' },
          { key: 'patterns_count', label: 'Patterns' },
          { key: 'm2_per_box', label: 'Coverage / Box (m²)' },
          { key: 'sqft_per_box', label: 'Coverage / Box (sqft)' },
          { key: 'weight_per_box_kg', label: 'Weight / Box (kg)' },
          { key: 'weight_per_box_lb', label: 'Weight / Box (lb)' },
          { key: 'boxes_per_pallet', label: 'Boxes / Pallet' },
          { key: 'm2_per_pallet', label: 'Coverage / Pallet (m²)' },
          { key: 'sqft_per_pallet', label: 'Coverage / Pallet (sqft)' },
          { key: 'weight_per_pallet_kg', label: 'Pallet Weight (kg)' },
          { key: 'weight_per_pallet_lb', label: 'Pallet Weight (lb)' },
          { key: 'pallet_dimensions_cm', label: 'Pallet Dimensions' },
        ],
      },
      {
        key: 'commercial',
        label: 'Commercial Information',
        fields: [
          { key: 'product_codes', label: 'Product Codes' },
          { key: 'sku_codes', label: 'SKU Codes' },
          { key: 'grout_mapei', label: 'Grout Mapei' },
          { key: 'grout_kerakoll', label: 'Grout Kerakoll' },
          { key: 'grout_isomat', label: 'Grout Isomat' },
          { key: 'grout_technica', label: 'Grout Technica' },
          { key: 'grout_color_codes', label: 'Grout Color Codes' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications & Compliance',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'eco_friendly', label: 'Eco Friendly' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'sustainability_rating', label: 'Sustainability' },
        ],
      },
      {
        key: 'care',
        label: 'Care & Maintenance',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'maintenance', label: 'Maintenance' },
          { key: 'cleaning', label: 'Cleaning' },
        ],
      },
      {
        key: 'design',
        label: 'Design & Style',
        fields: [
          { key: 'designers', label: 'Designer' },
          { key: 'studio', label: 'Studio' },
          { key: 'collection', label: 'Collection' },
          { key: 'design_style', label: 'Design Style' },
          { key: 'inspiration', label: 'Inspiration' },
          { key: 'philosophy', label: 'Philosophy' },
        ],
      },
    ],
  },

  // ═══ WOOD ═════════════════════════════════════════════════════════════════
  wood: {
    displayName: 'Wood',
    themeColor: '#92400e',
    controlledVocab: [
      'wood_flooring', 'laminate', 'vinyl_flooring', 'hardwood',
      'engineered_wood', 'parquet', 'wood', 'bamboo',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors / Stains' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'grain_pattern', label: 'Grain Pattern' },
          { key: 'knot_character', label: 'Knot Character' },
          { key: 'shade_variation', label: 'Shade Variation' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material Specifications',
        fields: [
          { key: 'species', label: 'Wood Species' },
          { key: 'grade', label: 'Grade' },
          { key: 'construction', label: 'Construction' },
          { key: 'core_material', label: 'Core Material' },
          { key: 'wear_layer_mm', label: 'Wear Layer' },
          { key: 'total_thickness_mm', label: 'Total Thickness' },
          { key: 'finish_type', label: 'Finish Type' },
          { key: 'finish_coats', label: 'Finish Coats' },
          { key: 'bevel_edge', label: 'Edge Profile' },
          { key: 'surface_treatment', label: 'Surface Treatment' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'janka_hardness', label: 'Janka Hardness' },
          { key: 'ac_rating', label: 'AC Rating' },
          { key: 'wear_rating', label: 'Wear Class' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'slip_resistance', label: 'Slip Resistance' },
          { key: 'acoustic_rating_db', label: 'Acoustic Rating' },
          { key: 'formaldehyde_class', label: 'Formaldehyde Class' },
          { key: 'underfloor_heating', label: 'Underfloor Heating' },
          { key: 'max_surface_temp_c', label: 'Max Surface Temp' },
        ],
      },
      {
        key: 'installation',
        label: 'Installation',
        fields: [
          { key: 'click_system', label: 'Click System' },
          { key: 'installation_method', label: 'Installation Method' },
          { key: 'subfloor_requirements', label: 'Subfloor Requirements' },
          { key: 'expansion_gap_mm', label: 'Expansion Gap' },
          { key: 'acclimation_days', label: 'Acclimation Period' },
          { key: 'underlay_required', label: 'Underlay Required' },
        ],
      },
      {
        key: 'packaging',
        label: 'Packaging',
        fields: [
          { key: 'planks_per_box', label: 'Planks / Pack' },
          { key: 'm2_per_box', label: 'Coverage / Pack (m²)' },
          { key: 'sqft_per_box', label: 'Coverage / Pack (sqft)' },
          { key: 'weight_per_box_kg', label: 'Weight / Pack (kg)' },
          { key: 'boxes_per_pallet', label: 'Packs / Pallet' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'fsc_certified', label: 'FSC Certified' },
          { key: 'pefc_certified', label: 'PEFC Certified' },
          { key: 'eco_friendly', label: 'Eco Friendly' },
          { key: 'origin_country', label: 'Country of Origin' },
        ],
      },
      {
        key: 'care',
        label: 'Care & Maintenance',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'maintenance', label: 'Maintenance' },
          { key: 'compatible_cleaners', label: 'Recommended Cleaners' },
        ],
      },
      {
        key: 'design',
        label: 'Design & Style',
        fields: [
          { key: 'collection', label: 'Collection' },
          { key: 'design_style', label: 'Design Style' },
          { key: 'designers', label: 'Designer' },
        ],
      },
    ],
  },

  // ═══ DECOR ════════════════════════════════════════════════════════════════
  decor: {
    displayName: 'Decor',
    themeColor: '#8b5cf6',
    controlledVocab: [
      'rug', 'curtain', 'cushion', 'vase', 'mirror',
      'wall_art', 'sculpture', 'candle_holder', 'planter', 'decor',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'style', label: 'Style' },
          { key: 'pattern', label: 'Pattern' },
          { key: 'texture', label: 'Texture' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material',
        fields: [
          { key: 'primary_material', label: 'Primary Material' },
          { key: 'secondary_material', label: 'Secondary Material' },
          { key: 'finish', label: 'Finish' },
          { key: 'handmade', label: 'Handmade' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'width_cm', label: 'Width' },
          { key: 'height_cm', label: 'Height' },
          { key: 'depth_cm', label: 'Depth' },
          { key: 'diameter_cm', label: 'Diameter' },
          { key: 'weight_kg', label: 'Weight' },
          { key: 'available_sizes', label: 'Available Sizes' },
        ],
      },
      {
        key: 'application',
        label: 'Application',
        fields: [
          { key: 'indoor_outdoor', label: 'Indoor / Outdoor' },
          { key: 'wall_mountable', label: 'Wall Mountable' },
          { key: 'freestanding', label: 'Freestanding' },
          { key: 'suitable_rooms', label: 'Suitable Rooms' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'fragile', label: 'Fragile' },
        ],
      },
      {
        key: 'design',
        label: 'Design',
        fields: [
          { key: 'collection', label: 'Collection' },
          { key: 'designers', label: 'Designer' },
          { key: 'design_style', label: 'Style' },
        ],
      },
    ],
  },

  // ═══ FURNITURE ═════════════════════════════════════════════════════════════
  furniture: {
    displayName: 'Furniture',
    themeColor: '#d97706',
    controlledVocab: [
      'sofa', 'armchair', 'dining_chair', 'accent_chair',
      'dining_table', 'coffee_table', 'side_table',
      'cabinet', 'shelving', 'sideboard', 'bed', 'desk',
      'outdoor_furniture', 'furniture',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'fabric_options', label: 'Fabric Options' },
          { key: 'style', label: 'Style' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Materials',
        fields: [
          { key: 'frame_material', label: 'Frame' },
          { key: 'upholstery_material', label: 'Upholstery' },
          { key: 'fill_material', label: 'Fill / Padding' },
          { key: 'leg_material', label: 'Legs' },
          { key: 'top_material', label: 'Top Surface' },
          { key: 'finish', label: 'Finish' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'width_cm', label: 'Width' },
          { key: 'depth_cm', label: 'Depth' },
          { key: 'height_cm', label: 'Height' },
          { key: 'seat_height_cm', label: 'Seat Height' },
          { key: 'seat_depth_cm', label: 'Seat Depth' },
          { key: 'arm_height_cm', label: 'Arm Height' },
          { key: 'weight_kg', label: 'Weight' },
          { key: 'weight_capacity_kg', label: 'Weight Capacity' },
        ],
      },
      {
        key: 'features',
        label: 'Features',
        fields: [
          { key: 'assembly_required', label: 'Assembly Required' },
          { key: 'stackable', label: 'Stackable' },
          { key: 'foldable', label: 'Foldable' },
          { key: 'modular', label: 'Modular' },
          { key: 'reclining', label: 'Reclining' },
          { key: 'storage', label: 'Storage' },
          { key: 'indoor_outdoor', label: 'Indoor / Outdoor' },
          { key: 'number_of_seats', label: 'Seats' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'martindale_cycles', label: 'Martindale (Abrasion)' },
          { key: 'pilling_grade', label: 'Pilling Grade' },
          { key: 'light_fastness', label: 'Light Fastness' },
          { key: 'fire_retardancy', label: 'Fire Retardancy' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'fire_rating', label: 'Fire Rating' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'removable_covers', label: 'Removable Covers' },
        ],
      },
    ],
  },

  // ═══ GENERAL MATERIALS ════════════════════════════════════════════════════
  general_materials: {
    displayName: 'General Materials',
    themeColor: '#6b7280',
    controlledVocab: [
      'stone_slab', 'metal_panel', 'glass_panel',
      'countertop', 'kitchen_worktop', 'cladding',
      'concrete', 'terrazzo', 'quartz', 'composite',
      'marble', 'granite', 'stone',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'pattern', label: 'Pattern' },
          { key: 'texture', label: 'Texture' },
          { key: 'translucency', label: 'Translucent / Backlit' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material Specifications',
        fields: [
          { key: 'material_type', label: 'Material Type' },
          { key: 'composition', label: 'Composition' },
          { key: 'finish', label: 'Finish' },
          { key: 'thickness_mm', label: 'Thickness' },
          { key: 'edge_profiles', label: 'Edge Profiles' },
          { key: 'density_kg_m3', label: 'Density' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'compressive_strength', label: 'Compressive Strength' },
          { key: 'flexural_strength', label: 'Flexural Strength' },
          { key: 'water_absorption_pct', label: 'Water Absorption' },
          { key: 'scratch_resistance', label: 'Scratch Resistance' },
          { key: 'heat_resistance_c', label: 'Heat Resistance' },
          { key: 'stain_resistance', label: 'Stain Resistance' },
          { key: 'uv_resistance', label: 'UV Resistance' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'frost_resistance', label: 'Frost Resistance' },
          { key: 'acoustic_rating_db', label: 'Acoustic Rating' },
        ],
      },
      {
        key: 'application',
        label: 'Application',
        fields: [
          { key: 'recommended_use', label: 'Recommended Use' },
          { key: 'indoor_outdoor', label: 'Indoor / Outdoor' },
          { key: 'installation_method', label: 'Installation Method' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'eco_friendly', label: 'Eco Friendly' },
          { key: 'recycled_content_pct', label: 'Recycled Content' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'sealing_required', label: 'Sealing Required' },
        ],
      },
    ],
  },

  // ═══ PAINT / WALL DECOR ══════════════════════════════════════════════════
  paint_wall_decor: {
    displayName: 'Paint / Wall Decors',
    themeColor: '#10b981',
    controlledVocab: [
      'wall_paint', 'wallpaper', 'wall_coating',
      'decorative_plaster', 'wall_panel', 'paint',
    ],
    sections: [
      {
        key: 'appearance',
        label: 'Appearance',
        fields: [
          { key: 'colors', label: 'Colors' },
          { key: 'color_code_ral', label: 'RAL Code' },
          { key: 'color_code_ncs', label: 'NCS Code' },
          { key: 'color_code_pantone', label: 'Pantone' },
          { key: 'primary_color_hex', label: 'Primary Color' },
          { key: 'tintable', label: 'Tintable' },
          { key: 'pattern', label: 'Pattern' },
          { key: 'design_style', label: 'Design Style' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Product Specifications',
        fields: [
          { key: 'product_type', label: 'Product Type' },
          { key: 'base_type', label: 'Base Type' },
          { key: 'finish_sheen', label: 'Finish / Sheen' },
          { key: 'texture', label: 'Texture' },
          { key: 'substrate', label: 'Substrate (wallpaper)' },
          { key: 'pattern_repeat_cm', label: 'Pattern Repeat' },
        ],
      },
      {
        key: 'coverage',
        label: 'Coverage & Dimensions',
        fields: [
          { key: 'coverage_per_litre_m2', label: 'Coverage / Litre (m²)' },
          { key: 'coverage_per_roll_m2', label: 'Coverage / Roll (m²)' },
          { key: 'roll_width_cm', label: 'Roll Width' },
          { key: 'roll_length_m', label: 'Roll Length' },
          { key: 'can_sizes', label: 'Can Sizes' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'washability_class', label: 'Washability Class' },
          { key: 'wet_scrub_resistance', label: 'Wet Scrub Resistance' },
          { key: 'voc_level_g_l', label: 'VOC Level (g/L)' },
          { key: 'voc_class', label: 'VOC Class' },
          { key: 'dry_time_touch_hours', label: 'Dry Time (Touch)' },
          { key: 'dry_time_recoat_hours', label: 'Dry Time (Recoat)' },
          { key: 'coats_recommended', label: 'Coats Recommended' },
          { key: 'opacity_class', label: 'Opacity Class' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'mould_resistance', label: 'Mould Resistance' },
        ],
      },
      {
        key: 'application',
        label: 'Application',
        fields: [
          { key: 'recommended_use', label: 'Recommended Use' },
          { key: 'suitable_surfaces', label: 'Suitable Surfaces' },
          { key: 'application_method', label: 'Application Method' },
          { key: 'primer_required', label: 'Primer Required' },
          { key: 'suitable_rooms', label: 'Suitable Rooms' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'eco_friendly', label: 'Eco Friendly' },
          { key: 'low_odour', label: 'Low Odour' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'touch_up', label: 'Touch-Up' },
        ],
      },
    ],
  },

  // ═══ HEATING ══════════════════════════════════════════════════════════════
  heating: {
    displayName: 'Heating',
    themeColor: '#ef4444',
    controlledVocab: [
      'radiator', 'towel_rail', 'underfloor_heating',
      'heat_pump', 'boiler', 'fireplace', 'convector', 'heating',
    ],
    sections: [
      {
        key: 'thermal_performance',
        label: 'Thermal Performance',
        fields: [
          { key: 'heat_output_watts', label: 'Heat Output (W)' },
          { key: 'heat_output_btu', label: 'Heat Output (BTU)' },
          { key: 'delta_t', label: 'Delta T' },
          { key: 'energy_class', label: 'Energy Class' },
          { key: 'kw_output', label: 'Output (kW)' },
          { key: 'max_operating_pressure_bar', label: 'Max Pressure (bar)' },
          { key: 'max_operating_temp_c', label: 'Max Temp (°C)' },
          { key: 'water_content_litres', label: 'Water Content (L)' },
          { key: 'flow_connection_size', label: 'Connection Size' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material & Finish',
        fields: [
          { key: 'product_type', label: 'Product Type' },
          { key: 'body_material', label: 'Material' },
          { key: 'finish', label: 'Finish' },
          { key: 'panel_type', label: 'Panel Type' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'width_mm', label: 'Width (mm)' },
          { key: 'height_mm', label: 'Height (mm)' },
          { key: 'depth_mm', label: 'Depth (mm)' },
          { key: 'weight_kg', label: 'Weight (kg)' },
          { key: 'sections', label: 'Sections' },
          { key: 'available_sizes', label: 'Available Sizes' },
        ],
      },
      {
        key: 'features',
        label: 'Features',
        fields: [
          { key: 'thermostat_type', label: 'Thermostat' },
          { key: 'valve_type', label: 'Valve Type' },
          { key: 'reversible', label: 'Reversible' },
          { key: 'dual_fuel', label: 'Dual Fuel' },
          { key: 'electric_element_watts', label: 'Electric Element (W)' },
          { key: 'smart_compatible', label: 'Smart Compatible' },
          { key: 'ip_rating', label: 'IP Rating' },
        ],
      },
      {
        key: 'installation',
        label: 'Installation',
        fields: [
          { key: 'mounting_type', label: 'Mounting' },
          { key: 'connection_type', label: 'Connection Type' },
          { key: 'brackets_included', label: 'Brackets Included' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'en_442_compliant', label: 'EN 442' },
          { key: 'pressure_tested_bar', label: 'Pressure Tested' },
        ],
      },
    ],
  },

  // ═══ SANITARY ═════════════════════════════════════════════════════════════
  sanitary: {
    displayName: 'Sanitary',
    themeColor: '#06b6d4',
    controlledVocab: [
      'toilet', 'basin', 'bathtub', 'shower_tray',
      'bidet', 'urinal', 'vanity_unit', 'shower_enclosure',
      'tap', 'faucet', 'mixer', 'shower_head', 'sanitary',
    ],
    sections: [
      {
        key: 'water_performance',
        label: 'Water Performance',
        fields: [
          { key: 'flow_rate_l_min', label: 'Flow Rate (L/min)' },
          { key: 'flush_volume_l', label: 'Flush Volume (L)' },
          { key: 'water_efficiency_label', label: 'Water Efficiency' },
          { key: 'water_saving_pct', label: 'Water Saving %' },
          { key: 'noise_class_db', label: 'Noise Class (dB)' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material & Finish',
        fields: [
          { key: 'product_type', label: 'Product Type' },
          { key: 'body_material', label: 'Material' },
          { key: 'finish', label: 'Finish' },
          { key: 'glaze_type', label: 'Glaze Technology' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'width_mm', label: 'Width (mm)' },
          { key: 'depth_mm', label: 'Depth (mm)' },
          { key: 'height_mm', label: 'Height (mm)' },
          { key: 'weight_kg', label: 'Weight (kg)' },
          { key: 'bowl_depth_mm', label: 'Bowl Depth (mm)' },
        ],
      },
      {
        key: 'installation',
        label: 'Installation',
        fields: [
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'trap_type', label: 'Trap Type' },
          { key: 'connection_size', label: 'Connection Size' },
          { key: 'waste_size_mm', label: 'Waste Size (mm)' },
          { key: 'concealed_cistern', label: 'Concealed Cistern' },
          { key: 'frame_compatibility', label: 'Frame Compatibility' },
          { key: 'tap_hole_config', label: 'Tap Holes' },
          { key: 'cartridge_type', label: 'Cartridge' },
        ],
      },
      {
        key: 'features',
        label: 'Features',
        fields: [
          { key: 'rimless', label: 'Rimless' },
          { key: 'soft_close_seat', label: 'Soft Close Seat' },
          { key: 'quick_release_seat', label: 'Quick Release Seat' },
          { key: 'overflow', label: 'Overflow' },
          { key: 'thermostatic', label: 'Thermostatic' },
          { key: 'anti_scald', label: 'Anti-Scald' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'accessibility', label: 'Accessibility' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
          { key: 'compatible_cleaners', label: 'Compatible Cleaners' },
        ],
      },
    ],
  },

  // ═══ KITCHEN ══════════════════════════════════════════════════════════════
  kitchen: {
    displayName: 'Kitchen',
    themeColor: '#f59e0b',
    controlledVocab: [
      'kitchen_cabinet', 'kitchen_worktop', 'kitchen_sink',
      'kitchen_tap', 'kitchen_hood', 'kitchen_appliance',
      'kitchen_handle', 'kitchen_organiser', 'kitchen',
    ],
    sections: [
      {
        key: 'material_specs',
        label: 'Material & Finish',
        fields: [
          { key: 'product_type', label: 'Product Type' },
          { key: 'body_material', label: 'Body Material' },
          { key: 'door_material', label: 'Door Material' },
          { key: 'finish', label: 'Finish' },
          { key: 'edge_treatment', label: 'Edge Treatment' },
          { key: 'worktop_thickness_mm', label: 'Worktop Thickness' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'width_mm', label: 'Width (mm)' },
          { key: 'height_mm', label: 'Height (mm)' },
          { key: 'depth_mm', label: 'Depth (mm)' },
          { key: 'weight_kg', label: 'Weight (kg)' },
          { key: 'bowl_dimensions', label: 'Bowl Dimensions' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance',
        fields: [
          { key: 'heat_resistance_c', label: 'Heat Resistance (°C)' },
          { key: 'scratch_resistance', label: 'Scratch Resistance' },
          { key: 'stain_resistance', label: 'Stain Resistance' },
          { key: 'noise_level_db', label: 'Noise Level (dB)' },
          { key: 'extraction_rate_m3_h', label: 'Extraction Rate (m³/h)' },
          { key: 'energy_class', label: 'Energy Class' },
        ],
      },
      {
        key: 'features',
        label: 'Features',
        fields: [
          { key: 'soft_close', label: 'Soft Close' },
          { key: 'drawer_system', label: 'Drawer System' },
          { key: 'hinge_type', label: 'Hinge Type' },
          { key: 'push_to_open', label: 'Push to Open' },
          { key: 'integrated_lighting', label: 'Integrated Lighting' },
          { key: 'modular', label: 'Modular' },
          { key: 'assembly_type', label: 'Assembly Type' },
        ],
      },
      {
        key: 'installation',
        label: 'Installation',
        fields: [
          { key: 'installation_type', label: 'Installation Type' },
          { key: 'mounting_method', label: 'Mounting Method' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'formaldehyde_class', label: 'Formaldehyde Class' },
          { key: 'eco_friendly', label: 'Eco Friendly' },
        ],
      },
      {
        key: 'care',
        label: 'Care',
        fields: [
          { key: 'care_instructions', label: 'Care Instructions' },
        ],
      },
    ],
  },

  // ═══ LIGHTING ═════════════════════════════════════════════════════════════
  lighting: {
    displayName: 'Lighting',
    themeColor: '#eab308',
    controlledVocab: [
      'lighting', 'pendant_light', 'ceiling_light', 'wall_light',
      'floor_lamp', 'table_lamp', 'spotlight', 'track_light',
      'recessed_light', 'outdoor_light', 'chandelier',
    ],
    sections: [
      {
        key: 'electrical_specs',
        label: 'Electrical Specifications',
        fields: [
          { key: 'wattage_w', label: 'Wattage (W)' },
          { key: 'lumens_lm', label: 'Lumens (lm)' },
          { key: 'color_temperature_k', label: 'Color Temp (K)' },
          { key: 'color_temperature_range_k', label: 'Tunable Range (K)' },
          { key: 'cri_ra', label: 'CRI (Ra)' },
          { key: 'beam_angle_deg', label: 'Beam Angle' },
          { key: 'dimmable', label: 'Dimmable' },
          { key: 'dimming_type', label: 'Dimming Type' },
          { key: 'led_integrated', label: 'LED Integrated' },
          { key: 'lamp_type', label: 'Lamp / Socket' },
          { key: 'voltage_v', label: 'Voltage (V)' },
          { key: 'energy_class', label: 'Energy Class' },
          { key: 'lifespan_hours', label: 'Lifespan (hours)' },
          { key: 'efficacy_lm_w', label: 'Efficacy (lm/W)' },
        ],
      },
      {
        key: 'material_specs',
        label: 'Material & Finish',
        fields: [
          { key: 'product_type', label: 'Product Type' },
          { key: 'body_material', label: 'Body Material' },
          { key: 'shade_material', label: 'Shade Material' },
          { key: 'finish', label: 'Finish' },
        ],
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        fields: [
          { key: 'diameter_mm', label: 'Diameter (mm)' },
          { key: 'height_mm', label: 'Height (mm)' },
          { key: 'width_mm', label: 'Width (mm)' },
          { key: 'depth_mm', label: 'Depth / Projection (mm)' },
          { key: 'cable_length_mm', label: 'Cable Length (mm)' },
          { key: 'adjustable_drop', label: 'Adjustable Drop' },
          { key: 'weight_kg', label: 'Weight (kg)' },
          { key: 'cutout_diameter_mm', label: 'Cutout Diameter (mm)' },
        ],
      },
      {
        key: 'features',
        label: 'Features',
        fields: [
          { key: 'ip_rating', label: 'IP Rating' },
          { key: 'ik_rating', label: 'IK Rating' },
          { key: 'smart_compatible', label: 'Smart Compatible' },
          { key: 'sensor', label: 'Sensor' },
          { key: 'emergency', label: 'Emergency Function' },
          { key: 'adjustable_tilt', label: 'Adjustable Tilt' },
          { key: 'number_of_lights', label: 'Light Points' },
          { key: 'indoor_outdoor', label: 'Indoor / Outdoor' },
        ],
      },
      {
        key: 'installation',
        label: 'Installation',
        fields: [
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'ceiling_type', label: 'Ceiling Type' },
          { key: 'installation_zone', label: 'Bathroom Zone' },
        ],
      },
      {
        key: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications' },
          { key: 'fire_rating', label: 'Fire Rating' },
          { key: 'class_protection', label: 'Protection Class' },
        ],
      },
    ],
  },
};

// ─── Helper functions ───────────────────────────────────────────────────────

/**
 * Resolve an AI-extracted material_category slug (e.g. "floor_tile") to
 * the upload category key (e.g. "tiles") used in the DB and this registry.
 */
export function resolveUploadCategory(materialCategory: string | undefined | null): UploadCategory {
  if (!materialCategory) return 'general_materials';

  const lower = materialCategory.toLowerCase().trim();

  // Direct match
  if (lower in CATEGORY_DISPLAY_REGISTRY) return lower as UploadCategory;

  // Check controlled vocab
  for (const [catKey, config] of Object.entries(CATEGORY_DISPLAY_REGISTRY)) {
    if (config.controlledVocab.includes(lower)) return catKey as UploadCategory;
  }

  // Fuzzy fallback
  if (lower.includes('tile') || lower.includes('ceramic') || lower.includes('porcelain')) return 'tiles';
  if (lower.includes('wood') || lower.includes('parquet') || lower.includes('laminate') || lower.includes('vinyl')) return 'wood';
  if (lower.includes('paint') || lower.includes('wallpaper') || lower.includes('coating')) return 'paint_wall_decor';
  if (lower.includes('sofa') || lower.includes('chair') || lower.includes('table') || lower.includes('cabinet') || lower.includes('bed') || lower.includes('desk') || lower.includes('shelf')) return 'furniture';
  if (lower.includes('radiator') || lower.includes('boiler') || lower.includes('heating') || lower.includes('towel_rail') || lower.includes('fireplace')) return 'heating';
  if (lower.includes('toilet') || lower.includes('basin') || lower.includes('bath') || lower.includes('shower') || lower.includes('tap') || lower.includes('faucet') || lower.includes('bidet')) return 'sanitary';
  if (lower.includes('kitchen') || lower.includes('worktop') || lower.includes('hood')) return 'kitchen';
  if (lower.includes('light') || lower.includes('lamp') || lower.includes('chandelier') || lower.includes('spotlight')) return 'lighting';
  if (lower.includes('rug') || lower.includes('curtain') || lower.includes('cushion') || lower.includes('mirror') || lower.includes('vase') || lower.includes('decor')) return 'decor';
  if (lower.includes('stone') || lower.includes('marble') || lower.includes('granite') || lower.includes('quartz') || lower.includes('glass') || lower.includes('metal') || lower.includes('composite') || lower.includes('concrete')) return 'general_materials';

  return 'general_materials';
}

/**
 * Get the display config for a given product's metadata.
 * Reads material_category from product metadata/type and resolves it.
 */
export function getCategoryDisplayConfig(
  metadata?: Record<string, any>,
  productType?: string,
  productCategory?: string,
): CategoryDisplayConfig {
  const materialCategory = metadata?.material_category || productType || productCategory || '';
  const catKey = resolveUploadCategory(materialCategory);
  return CATEGORY_DISPLAY_REGISTRY[catKey];
}

/**
 * Collect all field keys that are defined in any section of a category config.
 * Used to identify "additional properties" — metadata keys not in the known sections.
 */
export function getKnownFieldKeys(config: CategoryDisplayConfig): Set<string> {
  const keys = new Set<string>();
  for (const section of config.sections) {
    for (const field of section.fields) {
      keys.add(field.key);
    }
  }
  return keys;
}
