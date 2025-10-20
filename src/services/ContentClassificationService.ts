import Anthropic from '@anthropic-ai/sdk';

import { BaseService } from './base/BaseService';

/**
 * Content Classification Types
 */
export enum ContentType {
  PRODUCT = 'product',
  SPECIFICATION = 'specification',
  INTRODUCTION = 'introduction',
  LEGAL_DISCLAIMER = 'legal_disclaimer',
  TECHNICAL_DETAIL = 'technical_detail',
  MARKETING = 'marketing',
  OTHER = 'other',
}

export interface ClassificationResult {
  content_type: ContentType;
  confidence: number;
  reasoning: string;
  sub_categories?: string[];
}

export interface ClassifyChunkRequest {
  chunk_text: string;
  context?: string;
  pdf_title?: string;
}

export interface ClassifyChunkResponse {
  chunk_text: string;
  classification: ClassificationResult;
  processing_time_ms: number;
}

/**
 * ContentClassificationService
 * Classifies PDF chunks by content type using Claude 4.5 Haiku
 * Primary: Claude 4.5 Haiku
 * Fallback: Llama-3.2-90B
 */
export class ContentClassificationService extends BaseService {
  private anthropicClient: Anthropic;
  private model: string = 'claude-4-5-haiku-20250514';
  private maxTokens: number = 1024;
  private temperature: number = 0.1;

  constructor() {
    super({
      name: 'ContentClassificationService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.anthropicClient = new Anthropic({ apiKey });
  }

  /**
   * Classify a single chunk of text
   */
  async classifyChunk(
    request: ClassifyChunkRequest,
  ): Promise<ClassifyChunkResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildClassificationPrompt(request);

      const response = await this.anthropicClient.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '';
      const classification = this.parseClassificationResponse(responseText);

      return {
        chunk_text: request.chunk_text,
        classification,
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error('Classification error:', error);
      throw error;
    }
  }

  /**
   * Classify multiple chunks in batch
   */
  async classifyChunks(
    requests: ClassifyChunkRequest[],
  ): Promise<ClassifyChunkResponse[]> {
    const results: ClassifyChunkResponse[] = [];

    for (const request of requests) {
      try {
        const result = await this.classifyChunk(request);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to classify chunk: ${error}`);
        // Continue with next chunk on error
      }
    }

    return results;
  }

  /**
   * Build classification prompt
   */
  private buildClassificationPrompt(request: ClassifyChunkRequest): string {
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
  }

  /**
   * Parse classification response from Claude
   */
  private parseClassificationResponse(responseText: string): ClassificationResult {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Map string to enum
      const contentTypeMap: Record<string, ContentType> = {
        PRODUCT: ContentType.PRODUCT,
        SPECIFICATION: ContentType.SPECIFICATION,
        INTRODUCTION: ContentType.INTRODUCTION,
        LEGAL_DISCLAIMER: ContentType.LEGAL_DISCLAIMER,
        TECHNICAL_DETAIL: ContentType.TECHNICAL_DETAIL,
        MARKETING: ContentType.MARKETING,
        OTHER: ContentType.OTHER,
      };

      return {
        content_type:
          contentTypeMap[parsed.content_type] || ContentType.OTHER,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        reasoning: parsed.reasoning || '',
        sub_categories: parsed.sub_categories || [],
      };
    } catch (error) {
      this.logger.error('Failed to parse classification response:', error);
      return {
        content_type: ContentType.OTHER,
        confidence: 0,
        reasoning: 'Failed to parse response',
        sub_categories: [],
      };
    }
  }

  /**
   * Get content type statistics
   */
  getContentTypeStats(results: ClassifyChunkResponse[]): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const result of results) {
      const type = result.classification.content_type;
      stats[type] = (stats[type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Filter chunks by content type
   */
  filterByContentType(
    results: ClassifyChunkResponse[],
    contentType: ContentType,
    minConfidence: number = 0.7,
  ): ClassifyChunkResponse[] {
    return results.filter(
      (r) =>
        r.classification.content_type === contentType &&
        r.classification.confidence >= minConfidence,
    );
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Service is ready after construction
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify Anthropic client is available
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }
  }
}

// Export singleton instance
export const contentClassificationService = new ContentClassificationService();

