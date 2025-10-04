// Get your Jina AI API key for free: https://jina.ai/?sui=apikey

export interface JinaEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    total_tokens: number;
  };
}

export interface JinaClassificationResponse {
  data: Array<{
    object: string;
    index: number;
    prediction: string;
    score: number;
    predictions?: Array<{
      label: string;
      score: number;
    }>;
  }>;
  usage: {
    total_tokens: number;
  };
}

export interface JinaReaderResponse {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
    images?: Record<string, string>;
    links?: Record<string, string>;
    usage: {
      tokens: number;
    };
  };
}

export interface JinaSearchResponse {
  code: number;
  status: number;
  data: Array<{
    title: string;
    description: string;
    url: string;
    content: string;
    usage: {
      tokens: number;
    };
  }>;
}

export interface JinaRerankResponse {
  model: string;
  usage: {
    total_tokens: number;
  };
  results: Array<{
    index: number;
    relevance_score: number;
    document?: {
      text: string;
    };
  }>;
}

export interface JinaSegmentResponse {
  num_tokens: number;
  tokenizer: string;
  usage: {
    tokens: number;
  };
  num_chunks?: number;
  chunk_positions?: number[][];
  chunks?: string[];
  tokens?: Array<Array<[string, number[]]>>;
}

export interface MaterialData {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, unknown>;
  sourceUrl: string;
  supplier?: string;
  confidence?: number;
}

class JinaAIService {
  private baseUrl = 'https://api.jina.ai/v1';
  private readerUrl = 'https://r.jina.ai';
  private searchUrl = 'https://s.jina.ai';
  private segmentUrl = 'https://segment.jina.ai';

  private async getApiKey(): Promise<string> {
    // SECURITY: API key must be retrieved from server-side environment variables
    // This service should only be used in server-side contexts (API routes, Edge Functions)
    if (typeof window !== 'undefined') {
      throw new Error('JinaAI service cannot be used in client-side code for security reasons');
    }

    const apiKey = process.env.JINA_API_KEY;
    if (!apiKey) {
      throw new Error('JINA_API_KEY environment variable not configured. Get yours at https://jina.ai/?sui=apikey');
    }
    return apiKey;
  }

  private getHeaders(additionalHeaders: Record<string, string> = {}) {
    return {
      'Authorization': `Bearer ${this.getApiKey()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...additionalHeaders,
    };
  }

  // Embeddings API
  async generateEmbeddings(
    input: string[],
    model: string = 'jina-embeddings-v3',
    options: {
      task?: 'retrieval.query' | 'retrieval.passage' | 'text-matching' | 'classification' | 'separation';
      dimensions?: number;
      normalized?: boolean;
    } = {},
  ): Promise<JinaEmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        input,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina Embeddings API error: ${response.status}`);
    }

    return response.json();
  }

  // Classification API
  async classifyText(
    input: string[],
    labels: string[],
    model: string = 'jina-embeddings-v3',
  ): Promise<JinaClassificationResponse> {
    const response = await fetch(`${this.baseUrl}/classify`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        input,
        labels,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina Classification API error: ${response.status}`);
    }

    return response.json();
  }

  // Classification for images
  async classifyImages(
    images: string[], // base64 encoded images
    labels: string[],
    model: string = 'jina-clip-v2',
  ): Promise<JinaClassificationResponse> {
    const input = images.map(image => ({ image }));

    const response = await fetch(`${this.baseUrl}/classify`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        input,
        labels,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina Image Classification API error: ${response.status}`);
    }

    return response.json();
  }

  // Reader API
  async readUrl(
    url: string,
    options: {
      returnFormat?: 'markdown' | 'html' | 'text' | 'screenshot' | 'pageshot';
      withImages?: boolean;
      withLinks?: boolean;
      noCache?: boolean;
      targetSelector?: string;
      removeSelector?: string;
      timeout?: number;
    } = {},
  ): Promise<JinaReaderResponse> {
    const headers = this.getHeaders() as Record<string, string>;

    if (options.returnFormat) {
      headers['X-Return-Format'] = options.returnFormat;
    }
    if (options.withImages) {
      headers['X-With-Images-Summary'] = 'true';
    }
    if (options.withLinks) {
      headers['X-With-Links-Summary'] = 'true';
    }
    if (options.noCache) {
      headers['X-No-Cache'] = 'true';
    }
    if (options.targetSelector) {
      headers['X-Target-Selector'] = options.targetSelector;
    }
    if (options.removeSelector) {
      headers['X-Remove-Selector'] = options.removeSelector;
    }
    if (options.timeout) {
      headers['X-Timeout'] = options.timeout.toString();
    }

    const response = await fetch(this.readerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Jina Reader API error: ${response.status}`);
    }

    return response.json();
  }

  // Search API
  async searchWeb(
    query: string,
    options: {
      site?: string;
      withImages?: boolean;
      withLinks?: boolean;
      noCache?: boolean;
      num?: number;
      location?: string;
      language?: string;
    } = {},
  ): Promise<JinaSearchResponse> {
    const headers = this.getHeaders() as Record<string, string>;

    if (options.site) {
      headers['X-Site'] = options.site;
    }
    if (options.withImages) {
      headers['X-With-Images-Summary'] = 'true';
    }
    if (options.withLinks) {
      headers['X-With-Links-Summary'] = 'true';
    }
    if (options.noCache) {
      headers['X-No-Cache'] = 'true';
    }

    const body: Record<string, unknown> = { q: query };
    if (options.num) body.num = options.num;
    if (options.location) body.location = options.location;
    if (options.language) body.hl = options.language;

    const response = await fetch(this.searchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Jina Search API error: ${response.status}`);
    }

    return response.json();
  }

  // Reranker API
  async rerankDocuments(
    query: string,
    documents: string[],
    options: {
      model?: 'jina-reranker-v2-base-multilingual' | 'jina-colbert-v2' | 'jina-reranker-m0';
      topN?: number;
      returnDocuments?: boolean;
    } = {},
  ): Promise<JinaRerankResponse> {
    const model = options.model || 'jina-reranker-v2-base-multilingual';

    const response = await fetch(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: options.topN,
        return_documents: options.returnDocuments !== false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina Reranker API error: ${response.status}`);
    }

    return response.json();
  }

  // Segmenter API
  async segmentText(
    content: string,
    options: {
      tokenizer?: 'cl100k_base' | 'o200k_base' | 'p50k_base' | 'r50k_base' | 'p50k_edit' | 'gpt2';
      returnTokens?: boolean;
      returnChunks?: boolean;
      maxChunkLength?: number;
      head?: number;
      tail?: number;
    } = {},
  ): Promise<JinaSegmentResponse> {
    const response = await fetch(this.segmentUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        content,
        tokenizer: options.tokenizer || 'cl100k_base',
        return_tokens: options.returnTokens || false,
        return_chunks: options.returnChunks || false,
        max_chunk_length: options.maxChunkLength || 1000,
        head: options.head,
        tail: options.tail,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina Segmenter API error: ${response.status}`);
    }

    return response.json();
  }

  // High-level material extraction using Jina APIs
  async extractMaterialsFromUrl(
    url: string,
    options: {
      extractionPrompt?: string;
      classificationLabels?: string[];
      useSearch?: boolean;
      searchQuery?: string;
    } = {},
  ): Promise<MaterialData[]> {
    try {
      console.log('Starting Jina AI material extraction for:', url);

      let content = '';
      let pageTitle = '';
      let images: string[] = [];

      if (options.useSearch && options.searchQuery) {
        // Use search API to find relevant pages
        console.log('Using Jina Search API with query:', options.searchQuery);
        const searchResults = await this.searchWeb(options.searchQuery, {
          site: new URL(url).hostname,
          num: 5,
          withImages: true,
          withLinks: true,
        });

        // Process search results
        const materials: MaterialData[] = [];
        for (const result of searchResults.data) {
          const extractedMaterials = this.extractMaterialsFromContent(
            result.content,
            result.url,
            result.title,
            [],
          );
          materials.push(...extractedMaterials);
        }

        console.log(`Extracted ${materials.length} materials from search results`);
        return materials;
      } else {
        // Use reader API for single page
        console.log('Using Jina Reader API for:', url);
        const readerResult = await this.readUrl(url, {
          returnFormat: 'markdown',
          withImages: true,
          withLinks: true,
          timeout: 30,
        });

        content = readerResult.data.content;
        pageTitle = readerResult.data.title;
        images = Object.values(readerResult.data.images || {});

        console.log(`Retrieved content: ${content.length} characters`);
        console.log(`Found ${images.length} images`);
      }

      // Extract materials from content
      const materials = this.extractMaterialsFromContent(content, url, pageTitle, images);

      // Classify materials if labels provided
      if (options.classificationLabels && materials.length > 0) {
        console.log('Classifying materials with labels:', options.classificationLabels);
        const materialNames = materials.map(m => m.name);
        const classification = await this.classifyText(materialNames, options.classificationLabels);

        // Update materials with classification results
        classification.data.forEach((result, index) => {
          if (materials[index]) {
            materials[index].category = result.prediction;
            materials[index].confidence = result.score;
          }
        });
      }

      console.log(`Successfully extracted ${materials.length} materials`);
      return materials;

    } catch (error) {
      console.error('Jina AI material extraction error:', error);
      throw error;
    }
  }

  private extractMaterialsFromContent(
    content: string,
    sourceUrl: string,
    _pageTitle: string,
    images: string[],
  ): MaterialData[] {
    const materials: MaterialData[] = [];

    // Material keywords for detection
    const materialKeywords = [
      'tile', 'tiles', 'ceramic', 'porcelain', 'stone', 'marble', 'granite',
      'wood', 'timber', 'oak', 'pine', 'mahogany', 'bamboo', 'hardwood',
      'fabric', 'textile', 'cotton', 'linen', 'wool', 'silk',
      'metal', 'steel', 'aluminum', 'brass', 'copper', 'iron',
      'glass', 'acrylic', 'plastic', 'vinyl', 'leather',
      'concrete', 'brick', 'laminate', 'veneer', 'composite',
    ];

    // Price patterns
    const priceRegex = /[\$£€¥]\s*\d+(?:[.,]\d{2})?(?:\s*-\s*[\$£€¥]\s*\d+(?:[.,]\d{2})?)?/g;
    const dimensionRegex = /\d+\s*(?:x|×)\s*\d+(?:\s*(?:x|×)\s*\d+)?\s*(?:mm|cm|m|inch|in|ft)(?:es)?/gi;

    // Split content into potential product sections
    const lines = content.split('\n');
    let currentMaterial: Partial<MaterialData> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lowerLine = line.toLowerCase();

      if (!line) continue;

      // Detect potential material names (headings or emphasized text)
      const hasKeyword = materialKeywords.some(keyword => lowerLine.includes(keyword));
      const isHeading = line.startsWith('#') || line.includes('**') || line.length < 100;

      if (hasKeyword && isHeading) {
        // Save previous material if exists
        if (currentMaterial && currentMaterial.name) {
          materials.push(this.createMaterialFromPartial(currentMaterial, sourceUrl));
        }

        // Start new material
        currentMaterial = {
          name: line.replace(/[#*]/g, '').trim(),
          properties: {},
          images: [],
        };

        console.log(`Found potential material: ${currentMaterial.name}`);
        continue;
      }

      if (currentMaterial) {
        // Extract price
        const priceMatch = line.match(priceRegex);
        if (priceMatch && !currentMaterial.price) {
          currentMaterial.price = priceMatch[0];
        }

        // Extract dimensions
        const dimMatch = line.match(dimensionRegex);
        if (dimMatch && currentMaterial.properties) {
          currentMaterial.properties.dimensions = dimMatch[0];
        }

        // Extract description (first substantial text)
        if (!currentMaterial.description && line.length > 20 && line.length < 300 &&
            !priceRegex.test(line) && !dimensionRegex.test(line)) {
          currentMaterial.description = line;
        }

        // Look for image references
        if (line.includes('http') && (line.includes('.jpg') || line.includes('.png') ||
            line.includes('.jpeg') || line.includes('.webp'))) {
          const imageMatch = line.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp)/i);
          if (imageMatch && currentMaterial.images) {
            currentMaterial.images.push(imageMatch[0]);
          }
        }
      }
    }

    // Save last material
    if (currentMaterial && currentMaterial.name) {
      materials.push(this.createMaterialFromPartial(currentMaterial, sourceUrl));
    }

    // Add page images to materials that don't have images
    if (images.length > 0) {
      materials.forEach(material => {
        if (material.images.length === 0 && images.length > 0) {
          material.images.push(images[0]); // Add first available image
        }
      });
    }

    return materials;
  }

  private createMaterialFromPartial(partial: Partial<MaterialData>, sourceUrl: string): MaterialData {
    return {
      name: partial.name || 'Unknown Material',
      description: partial.description || '',
      category: this.categorizeFromName(partial.name?.toLowerCase() || ''),
      price: partial.price || '',
      images: partial.images || [],
      properties: {
        ...partial.properties,
        sourceUrl,
        extractedAt: new Date().toISOString(),
        extractedBy: 'jina-ai',
      },
      sourceUrl,
      supplier: this.extractSupplierFromUrl(sourceUrl),
      confidence: partial.confidence || 0.8,
    };
  }

  private categorizeFromName(name: string): string {
    const categoryMap: Record<string, string> = {
      'wood': 'Wood',
      'timber': 'Wood',
      'oak': 'Wood',
      'pine': 'Wood',
      'stone': 'Stone',
      'marble': 'Stone',
      'granite': 'Stone',
      'concrete': 'Concrete',
      'brick': 'Brick',
      'metal': 'Metal',
      'steel': 'Metal',
      'fabric': 'Textiles',
      'textile': 'Textiles',
      'leather': 'Leather',
      'tile': 'Ceramics',
      'tiles': 'Ceramics',
      'ceramic': 'Ceramics',
      'porcelain': 'Ceramics',
      'glass': 'Glass',
      'plastic': 'Plastics',
      'vinyl': 'Plastics',
    };

    for (const [key, value] of Object.entries(categoryMap)) {
      if (name.includes(key)) {
        return value;
      }
    }

    return 'Other';
  }

  private extractSupplierFromUrl(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }
}

export const jinaAIService = new JinaAIService();
