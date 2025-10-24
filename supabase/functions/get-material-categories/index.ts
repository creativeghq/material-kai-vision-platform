import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface Database {
  public: {
    Tables: {
      material_categories: {
        Row: {
          id: string;
          category_key: string;
          name: string;
          display_name: string;
          description: string | null;
          parent_category_id: string | null;
          category_path: string;
          hierarchy_level: number;
          sort_order: number;
          display_group: string | null;
          is_active: boolean;
          is_composite: boolean;
          is_primary_category: boolean;
          ai_extraction_enabled: boolean;
          ai_confidence_threshold: number;
          processing_priority: number;
        };
        Insert: Omit<Database['public']['Tables']['material_categories']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['material_categories']['Insert']>;
      };
      material_properties: {
        Row: {
          id: string;
          property_key: string;
          name: string;
          display_name: string;
          description: string | null;
          data_type: string;
          validation_rules: any;
          default_value: any;
          ui_component: string | null;
          ui_props: any;
          display_order: number;
          is_required: boolean;
          is_searchable: boolean;
          is_filterable: boolean;
          is_ai_extractable: boolean;
        };
        Insert: Omit<Database['public']['Tables']['material_properties']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['material_properties']['Insert']>;
      };
      category_validation_rules: {
        Row: {
          id: string;
          category_id: string;
          property_id: string;
          is_required: boolean;
          is_inherited: boolean;
          validation_override: any;
          display_order: number;
          is_visible: boolean;
          ui_props_override: any;
        };
        Insert: Omit<Database['public']['Tables']['category_validation_rules']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['category_validation_rules']['Insert']>;
      };
    };
  };
}

export interface MaterialCategory {
  key: string;
  name: string;
  displayName: string;
  description?: string;
  hierarchyLevel: number;
  sortOrder: number;
  displayGroup?: string;
  isActive: boolean;
  isPrimaryCategory: boolean;
  aiExtractionEnabled: boolean;
  aiConfidenceThreshold: number;
  processingPriority: number;
  metaFields: string[];
}

export interface MaterialProperty {
  key: string;
  name: string;
  displayName: string;
  description?: string;
  dataType: string;
  validationRules?: any;
  defaultValue?: any;
  uiComponent?: string;
  uiProps?: any;
  displayOrder: number;
  isRequired: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isAiExtractable: boolean;
}

// Cache for categories (in-memory for this function instance)
let categoriesCache: MaterialCategory[] | null = null;
let propertiesCache: MaterialProperty[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  return cacheTimestamp !== null &&
         (Date.now() - cacheTimestamp) < CACHE_DURATION &&
         categoriesCache !== null &&
         propertiesCache !== null;
}

async function fetchCategoriesFromDB(supabase: any): Promise<MaterialCategory[]> {
  const { data: categories, error: catError } = await supabase
    .from('material_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (catError) {
    throw new Error(`Failed to fetch categories: ${catError.message}`);
  }

  const { data: properties, error: propError } = await supabase
    .from('material_properties')
    .select('*')
    .eq('is_ai_extractable', true)
    .order('display_order');

  if (propError) {
    throw new Error(`Failed to fetch properties: ${propError.message}`);
  }

  // Get category-property relationships
  const { data: validationRules, error: rulesError } = await supabase
    .from('category_validation_rules')
    .select(`
      category_id,
      property_id,
      material_properties!inner(property_key)
    `);

  if (rulesError) {
    throw new Error(`Failed to fetch validation rules: ${rulesError.message}`);
  }

  // Build category-to-properties mapping
  const categoryPropsMap = new Map<string, string[]>();
  validationRules.forEach((rule: any) => {
    const categoryId = rule.category_id;
    const propertyKey = rule.material_properties.property_key;

    if (!categoryPropsMap.has(categoryId)) {
      categoryPropsMap.set(categoryId, []);
    }
    categoryPropsMap.get(categoryId)!.push(propertyKey);
  });

  // Get all extractable property keys as fallback
  const allExtractableProps = properties.map((p: any) => p.property_key);

  // Transform to MaterialCategory format
  const materialCategories: MaterialCategory[] = categories.map((cat: any) => ({
    key: cat.category_key,
    name: cat.name,
    displayName: cat.display_name,
    description: cat.description,
    hierarchyLevel: cat.hierarchy_level,
    sortOrder: cat.sort_order,
    displayGroup: cat.display_group,
    isActive: cat.is_active,
    isPrimaryCategory: cat.is_primary_category,
    aiExtractionEnabled: cat.ai_extraction_enabled,
    aiConfidenceThreshold: cat.ai_confidence_threshold,
    processingPriority: cat.processing_priority,
    metaFields: categoryPropsMap.get(cat.id) || allExtractableProps,
  }));

  return materialCategories;
}

async function fetchPropertiesFromDB(supabase: any): Promise<MaterialProperty[]> {
  const { data: properties, error } = await supabase
    .from('material_properties')
    .select('*')
    .order('display_order');

  if (error) {
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }

  return properties.map((prop: any) => ({
    key: prop.property_key,
    name: prop.name,
    displayName: prop.display_name,
    description: prop.description,
    dataType: prop.data_type,
    validationRules: prop.validation_rules,
    defaultValue: prop.default_value,
    uiComponent: prop.ui_component,
    uiProps: prop.ui_props,
    displayOrder: prop.display_order,
    isRequired: prop.is_required,
    isSearchable: prop.is_searchable,
    isFilterable: prop.is_filterable,
    isAiExtractable: prop.is_ai_extractable,
  }));
}

Deno.serve(async (req: Request) => {
  // CORS handling
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      },
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const endpoint = url.pathname.split('/').pop();

    // Check cache first
    if (!isCacheValid()) {
      console.log('Cache miss, fetching from database...');
      categoriesCache = await fetchCategoriesFromDB(supabase);
      propertiesCache = await fetchPropertiesFromDB(supabase);
      cacheTimestamp = Date.now();
      console.log(`Cached ${categoriesCache.length} categories and ${propertiesCache.length} properties`);
    } else {
      console.log('Cache hit, using cached data');
    }

    // Handle different endpoints
    switch (endpoint) {
      case 'categories':
        return new Response(JSON.stringify({
          success: true,
          data: categoriesCache,
          cached: true,
          cacheAge: Date.now() - cacheTimestamp!,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });

      case 'properties':
        return new Response(JSON.stringify({
          success: true,
          data: propertiesCache,
          cached: true,
          cacheAge: Date.now() - cacheTimestamp!,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });

      case 'legacy-format':
        // Convert to legacy MATERIAL_CATEGORIES format for backward compatibility
        const legacyFormat = categoriesCache!.reduce((acc, cat) => {
          acc[cat.key] = {
            name: cat.name,
            metaFields: cat.metaFields,
          };
          return acc;
        }, {} as Record<string, { name: string; metaFields: string[] }>);

        return new Response(JSON.stringify({
          success: true,
          data: legacyFormat,
          cached: true,
          cacheAge: Date.now() - cacheTimestamp!,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });

      case 'refresh':
        // Force cache refresh
        categoriesCache = await fetchCategoriesFromDB(supabase);
        propertiesCache = await fetchPropertiesFromDB(supabase);
        cacheTimestamp = Date.now();

        return new Response(JSON.stringify({
          success: true,
          message: `Cache refreshed. Loaded ${categoriesCache.length} categories and ${propertiesCache.length} properties`,
          data: {
            categories: categoriesCache.length,
            properties: propertiesCache.length,
          },
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });

      default:
        // Default: return both categories and properties
        return new Response(JSON.stringify({
          success: true,
          data: {
            categories: categoriesCache,
            properties: propertiesCache,
          },
          cached: true,
          cacheAge: Date.now() - cacheTimestamp!,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
    }

  } catch (error) {
    console.error('Error in get-material-categories:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
