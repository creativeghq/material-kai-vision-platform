import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.24.3';

interface ClassificationRequest {
  chunk_text: string;
  context?: string;
  pdf_title?: string;
}

interface ClassificationResult {
  content_type: string;
  confidence: number;
  reasoning: string;
  sub_categories?: string[];
}

interface ClassifyResponse {
  chunk_text: string;
  classification: ClassificationResult;
  processing_time_ms: number;
}

const buildClassificationPrompt = (request: ClassificationRequest): string => {
  const contextInfo = request.context
    ? `\nContext: ${request.context}`
    : '';
  const titleInfo = request.pdf_title
    ? `\nPDF Title: ${request.pdf_title}`
    : '';

  return `You are a content classification expert. Classify the following text chunk from a PDF document.

${titleInfo}${contextInfo}

Text to classify:
"${request.chunk_text}"

Classify this text into ONE of these categories:
1. PRODUCT - Describes actual product/material being sold or featured
2. SPECIFICATION - Technical specifications, dimensions, properties
3. INTRODUCTION - Introduction, overview, or general information
4. LEGAL_DISCLAIMER - Legal text, disclaimers, terms, conditions
5. TECHNICAL_DETAIL - Detailed technical information, processes, methods
6. MARKETING - Marketing copy, promotional content, benefits
7. OTHER - Anything else

Respond in JSON format:
{
  "content_type": "PRODUCT|SPECIFICATION|INTRODUCTION|LEGAL_DISCLAIMER|TECHNICAL_DETAIL|MARKETING|OTHER",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this classification was chosen",
  "sub_categories": ["optional", "sub", "categories"]
}`;
};

const parseClassificationResponse = (
  responseText: string,
): ClassificationResult => {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      content_type: parsed.content_type || 'OTHER',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
      sub_categories: parsed.sub_categories || [],
    };
  } catch (error) {
    console.error('Failed to parse classification response:', error);
    return {
      content_type: 'OTHER',
      confidence: 0,
      reasoning: 'Failed to parse response',
      sub_categories: [],
    };
  }
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const body = await req.json();
    const request: ClassificationRequest = body;

    if (!request.chunk_text) {
      return new Response(
        JSON.stringify({ error: 'chunk_text is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const startTime = Date.now();
    const client = new Anthropic({ apiKey });

    const prompt = buildClassificationPrompt(request);

    const response = await client.messages.create({
      model: 'claude-4-5-haiku-20250514',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const classification = parseClassificationResponse(responseText);

    const result: ClassifyResponse = {
      chunk_text: request.chunk_text,
      classification,
      processing_time_ms: Date.now() - startTime,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Classification error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
});

