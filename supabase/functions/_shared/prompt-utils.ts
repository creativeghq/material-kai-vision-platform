/**
 * Shared prompt loading utilities.
 * Loads prompts from the `prompts` table so all prompts are DB-driven
 * and editable via /admin/ai-configs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Load an agent system prompt from the database.
 * prompt_type = 'agent', category = agentType
 */
export async function getAgentSystemPrompt(
  supabase: SupabaseClient,
  agentType: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('prompts')
    .select('system_prompt')
    .eq('prompt_type', 'agent')
    .eq('category', agentType)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    console.error(`❌ CRITICAL: No prompt found for agent '${agentType}':`, error);
    throw new Error(`Agent prompt not found in database: ${agentType}. Please add it via /admin/ai-configs.`);
  }

  console.log(`✅ Loaded system prompt for agent '${agentType}' from database`);
  return data.system_prompt;
}

/**
 * Load a tool-specific system prompt from the database.
 * prompt_type = 'tool', category = toolName
 */
export async function getToolPrompt(
  supabase: SupabaseClient,
  toolName: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('prompts')
    .select('system_prompt')
    .eq('prompt_type', 'tool')
    .eq('category', toolName)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    console.error(`❌ CRITICAL: No prompt found for tool '${toolName}':`, error);
    throw new Error(`Tool prompt not found in database: ${toolName}. Please add it via /admin/ai-configs.`);
  }

  console.log(`✅ Loaded system prompt for tool '${toolName}' from database`);
  return data.system_prompt;
}

/**
 * Load a generation prompt from the database with a hardcoded fallback.
 * prompt_type = 'generation', category = promptName
 * Never throws — returns fallback if DB row is missing.
 */
export async function getGenerationPrompt(
  supabase: SupabaseClient,
  promptName: string,
  fallback: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('prompts')
    .select('system_prompt')
    .eq('prompt_type', 'generation')
    .eq('category', promptName)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    console.warn(`⚠️ No DB prompt for '${promptName}', using hardcoded fallback`);
    return fallback;
  }

  console.log(`✅ Loaded generation prompt '${promptName}' from database`);
  return data.system_prompt;
}
