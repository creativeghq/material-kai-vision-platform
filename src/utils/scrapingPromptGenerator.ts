import { supabase } from '@/integrations/supabase/client';
import type { FieldMapping } from '@/components/experimental/scraper/FieldMappingStep';

/**
 * Fetches the scraping extraction prompt template from the database
 */
export async function fetchScrapingPromptTemplate(
  workspaceId: string,
): Promise<{ template: string; systemPrompt: string | null } | null> {
  try {
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
      console.error('Error fetching scraping prompt template:', error);
      return null;
    }

    return {
      template: data.prompt_text || '',
      systemPrompt: data.system_prompt,
    };
  } catch (error) {
    console.error('Error in fetchScrapingPromptTemplate:', error);
    return null;
  }
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
 */
export async function generateExtractionPrompt(
  workspaceId: string,
  fields: FieldMapping[],
): Promise<{ prompt: string; systemPrompt: string | null } | null> {
  try {
    // Fetch the template from database
    const promptData = await fetchScrapingPromptTemplate(workspaceId);

    if (!promptData) {
      // Fallback to default template if DB fetch fails
      console.warn('Using fallback prompt template');
      return {
        prompt: generateFallbackPrompt(fields),
        systemPrompt: 'You are a precise data extraction assistant. Focus on accuracy and structured output. Always return valid JSON.',
      };
    }

    // Generate field definitions
    const fieldDefinitions = generateFieldDefinitions(fields);

    // Inject field definitions into template
    const finalPrompt = promptData.template.replace(
      '{{FIELD_DEFINITIONS}}',
      fieldDefinitions,
    );

    return {
      prompt: finalPrompt,
      systemPrompt: promptData.systemPrompt,
    };
  } catch (error) {
    console.error('Error generating extraction prompt:', error);
    return {
      prompt: generateFallbackPrompt(fields),
      systemPrompt: 'You are a precise data extraction assistant. Focus on accuracy and structured output. Always return valid JSON.',
    };
  }
}

/**
 * Fallback prompt template if database fetch fails
 */
function generateFallbackPrompt(fields: FieldMapping[]): string {
  const fieldDefinitions = generateFieldDefinitions(fields);

  return `You are an expert at extracting structured material data from web pages.

Extract the following information from this webpage:

${fieldDefinitions}

Instructions:
- Extract data accurately based on the field descriptions provided
- Return data in valid JSON format matching the field names exactly
- If a field cannot be found, use null for that field
- For array fields, return an empty array [] if no data is found
- For number fields, extract only numeric values (remove currency symbols, commas, etc.)
- Ensure all extracted data is relevant and accurate

Return the data as a JSON object with the exact field names specified above.`;
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

