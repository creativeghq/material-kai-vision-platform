import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SuggestFieldsRequest {
  url: string;
  sampleHtml?: string;
}

Deno.serve(async (req) => {
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

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication failed');

    const { url, sampleHtml }: SuggestFieldsRequest = await req.json();
    if (!url) throw new Error('URL is required');

    // Fetch page content using Firecrawl if no sample provided
    let pageContent = sampleHtml;
    if (!pageContent) {
      const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
      if (!firecrawlKey) throw new Error('Firecrawl API key not configured');

      const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
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

    // Use Claude to analyze and suggest fields
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('Anthropic API key not configured');

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Analyze this webpage content and suggest relevant fields for data extraction.

URL: ${url}

Page Content (first 3000 chars):
${pageContent.substring(0, 3000)}

Based on the content, suggest 5-10 fields that would be useful to extract. For each field, provide:
- name: snake_case field name
- label: Human-readable label
- type: one of (text, number, array, object, boolean)
- description: What this field represents and how to extract it
- required: whether this field should be required

Return ONLY a JSON array of field objects, no other text.

Example format:
[
  {
    "name": "product_name",
    "label": "Product Name",
    "type": "text",
    "description": "The name or title of the product",
    "required": true
  }
]`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
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
});

