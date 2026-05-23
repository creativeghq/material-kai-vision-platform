import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { generateWithClaude } from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

interface SuggestFieldsRequest {
  url: string;
  sampleHtml?: string;
}

/**
 * Suggest Fields API
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('suggest-fields', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

    const { url, sampleHtml }: SuggestFieldsRequest = await req.json();
    if (!url) throw new Error('URL is required');

    // Fetch page content using Firecrawl if no sample provided
    let pageContent = sampleHtml;
    if (!pageContent) {
      const firecrawlKey = () => Deno.env.get('FIRECRAWL_API_KEY') || '';
      if (!firecrawlKey()) throw new Error('Firecrawl API key not configured');

      const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          timeout: 15000,
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch page content');

      const data = await response.json();
      pageContent = data.data?.markdown || '';
    }

    // Load prompt from database (editable via /admin/ai-configs)
    const fieldSuggesterPrompt = await getToolPrompt(supabase, 'field_suggester');

    // Use Claude to analyze and suggest fields (via unified AI SDK client)
    const prompt = `${fieldSuggesterPrompt}

URL: ${url}

Page Content (first 3000 chars):
${pageContent.substring(0, 3000)}`;

    const aiResult = await generateWithClaude(prompt, {
      task: 'suggest_fields',
      maxTokens: 2000,
    });

    const responseText = aiResult.text;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const suggestedFields = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({
        success: true,
        fields: suggestedFields,
        url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error suggesting fields:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to suggest fields',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));
