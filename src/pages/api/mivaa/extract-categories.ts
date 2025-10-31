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

    // NOTE: This is a legacy Next.js API route not used in Vite app.
    // The extract-categories Edge Function has been removed.
    // Category extraction should be done through MIVAA API directly.
    return res.status(501).json({
      success: false,
      error: 'This legacy API route is no longer supported. Use MIVAA API directly.',
      categories: [],
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      categories: [],
    });
  }
}
