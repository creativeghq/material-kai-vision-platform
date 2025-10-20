// Legacy Next.js API route - not used in Vite app
type NextApiRequest = any;
type NextApiResponse = any;

import { supabase } from '@/integrations/supabase/client';

interface CategoryExtractionRequest {
  content: string;
  documentId: string;
  extractionTypes?: string[];
  options?: {
    includeContext?: boolean;
    confidenceThreshold?: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { content, documentId, extractionTypes = ['material_category', 'product_category'], options = {} } = req.body as CategoryExtractionRequest;

    if (!content || !documentId) {
      return res.status(400).json({ error: 'Content and documentId are required' });
    }

    // Call Supabase Edge Function for category extraction
    const { data, error } = await supabase.functions.invoke('extract-categories', {
      body: {
        content,
        documentId,
        extractionTypes,
        options,
      },
    });

    if (error) {
      console.error('Category extraction error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        categories: [],
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      categories: [],
    });
  }
}
