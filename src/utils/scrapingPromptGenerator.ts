import { supabase } from '@/integrations/supabase/client';
import type { FieldMapping } from '@/components/experimental/scraper/FieldMappingStep';

/**
 * Fetches the scraping extraction prompt template from the database
 * NO FALLBACK - All prompts must exist in the database
 */
export async function fetchScrapingPromptTemplate(
  workspaceId: string,
): Promise<{ template: string; systemPrompt: string | null }> {
  const { data, error } = await supabase
    .from('prompts')
    .select('prompt_text, system_prompt')
    .eq('workspace_id', workspaceId)
    .eq('prompt_type', 'extraction')
    .eq('stage', 'scraping')
    .eq('category', 'materials')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('CRITICAL: Scraping prompt not found in database:', error);
    throw new Error(
      `Scraping prompt not found in database. Please add it via /admin/ai-configs. ` +
      `Required: prompt_type='extraction', stage='scraping', category='materials'. ` +
      `Error: ${error.message}`
    );
  }

  if (!data?.prompt_text) {
    throw new Error(
      'Scraping prompt exists but has empty prompt_text. Please update it via /admin/ai-configs.'
    );
  }

  return {
    template: data.prompt_text,
    systemPrompt: data.system_prompt,
  };
}

/**
 * Generates field definitions text from field mappings
 */
export function generateFieldDefinitions(fields: FieldMapping[]): string {
  if (fields.length === 0) {
    return 'No specific fields defined. Extract general material information.';
  }

  const fieldDefs = fields.map((field) => {
    const requiredTag = field.required ? ' (REQUIRED)' : ' (optional)';
    return `- **${field.label}** (${field.name}, type: ${field.type})${requiredTag}: ${field.description}`;
  });

  return fieldDefs.join('\n');
}

/**
 * Generates the complete extraction prompt by combining template and field mappings
 * NO FALLBACK - All prompts must exist in the database
 */
export async function generateExtractionPrompt(
  workspaceId: string,
  fields: FieldMapping[],
): Promise<{ prompt: string; systemPrompt: string | null }> {
  // Fetch the template from database - throws if not found
  const promptData = await fetchScrapingPromptTemplate(workspaceId);

  // Generate field definitions
  const fieldDefinitions = generateFieldDefinitions(fields);

  // Inject field definitions into template
  const finalPrompt = promptData.template.replace(
    '{{FIELD_DEFINITIONS}}',
    fieldDefinitions,
  );

  console.log('Loaded scraping prompt from database successfully');

  return {
    prompt: finalPrompt,
    systemPrompt: promptData.systemPrompt,
  };
}

/**
 * Generates a JSON schema from field mappings for structured extraction
 */
export function generateJsonSchema(fields: FieldMapping[]): Record<string, any> {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  fields.forEach((field) => {
    let fieldSchema: any = {
      description: field.description,
    };

    switch (field.type) {
      case 'text':
        fieldSchema.type = 'string';
        break;
      case 'number':
        fieldSchema.type = 'number';
        break;
      case 'array':
        fieldSchema.type = 'array';
        fieldSchema.items = { type: 'string' };
        break;
      case 'object':
        fieldSchema.type = 'object';
        break;
      case 'boolean':
        fieldSchema.type = 'boolean';
        break;
    }

    properties[field.name] = fieldSchema;

    if (field.required) {
      required.push(field.name);
    }
  });

  return {
    type: 'object',
    properties,
    required,
  };
}
