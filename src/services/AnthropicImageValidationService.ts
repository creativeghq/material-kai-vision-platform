/**
 * Anthropic Image Validation Service
 * Uses Claude 3.5 Sonnet Vision to validate images and match them to product groups
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/integrations/supabase/client";
import { BaseService, ServiceConfig } from "./base/BaseService";

interface ImageValidationRequest {
  image_id: string;
  image_url: string;
  product_groups?: string[];
  workspace_id: string;
}

interface ImageValidationResult {
  image_id: string;
  validation_status: "valid" | "invalid" | "needs_review";
  quality_score: number;
  product_associations: Array<{
    product_group: string;
    confidence: number;
    reasoning: string;
  }>;
  issues: string[];
  recommendations: string[];
  processing_time_ms: number;
}

/**
 * Anthropic Image Validation Service
 * Uses Claude 3.5 Sonnet Vision for advanced image analysis
 */
export class AnthropicImageValidationService extends BaseService<ServiceConfig> {
  private anthropicClient: Anthropic;
  private model: string = "claude-3-5-sonnet-20241022";
  private maxTokens: number = 2048;

  constructor() {
    super({
      name: "AnthropicImageValidationService",
      version: "1.0.0",
      environment: "production",
      enabled: true,
      timeout: 60000,
      retries: 2,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.anthropicClient = new Anthropic({ apiKey });
  }

  protected async doInitialize(): Promise<void> {
    console.log("AnthropicImageValidationService initialized");
  }

  /**
   * Validate a single image using Claude Vision
   */
  async validateImage(
    request: ImageValidationRequest
  ): Promise<ImageValidationResult> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      // Get image data from database
      const { data: imageData, error: imageError } = await supabase
        .from("document_images")
        .select("*")
        .eq("id", request.image_id)
        .single();

      if (imageError || !imageData) {
        throw new Error(`Image not found: ${request.image_id}`);
      }

      // Prepare product groups context
      const productGroupsContext =
        request.product_groups && request.product_groups.length > 0
          ? `\n\nProduct Groups to match against:\n${request.product_groups.map((g) => `- ${g}`).join("\n")}`
          : "";

      // Build Claude Vision prompt
      const prompt = `You are an expert material and product analyst. Analyze this image and provide:

1. **Quality Assessment**: Rate the image quality (0-1 scale) considering clarity, lighting, composition
2. **Content Analysis**: Describe what you see in the image
3. **Material Identification**: Identify any materials visible
4. **Product Associations**: Match the image to relevant product groups${productGroupsContext}
5. **Issues**: List any quality issues or concerns
6. **Recommendations**: Suggest improvements for better product matching

Respond in JSON format:
{
  "quality_score": <number 0-1>,
  "content_description": "<description>",
  "materials_identified": ["<material1>", "<material2>"],
  "product_associations": [
    {
      "product_group": "<group>",
      "confidence": <0-1>,
      "reasoning": "<why this matches>"
    }
  ],
  "issues": ["<issue1>", "<issue2>"],
  "recommendations": ["<recommendation1>", "<recommendation2>"]
}`;

      // Call Claude Vision API
      const response = await this.anthropicClient.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "url",
                  url: request.image_url,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      });

      // Parse response
      const responseText =
        response.content[0].type === "text" ? response.content[0].text : "{}";
      const analysisResult = JSON.parse(responseText);

      // Determine validation status
      const qualityScore = analysisResult.quality_score || 0;
      const validationStatus =
        qualityScore >= 0.7
          ? "valid"
          : qualityScore >= 0.5
            ? "needs_review"
            : "invalid";

      // Store validation result in database
      const { data: validation, error: insertError } = await supabase
        .from("image_validations")
        .insert([
          {
            image_id: request.image_id,
            workspace_id: request.workspace_id,
            validation_status: validationStatus,
            quality_score: qualityScore,
            issues: analysisResult.issues || [],
            recommendations: analysisResult.recommendations || [],
            validated_at: new Date().toISOString(),
            metadata: {
              content_description: analysisResult.content_description,
              materials_identified: analysisResult.materials_identified,
              model_used: this.model,
            },
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.warn(`Failed to store validation: ${insertError.message}`);
      }

      return {
        image_id: request.image_id,
        validation_status: validationStatus,
        quality_score: qualityScore,
        product_associations: analysisResult.product_associations || [],
        issues: analysisResult.issues || [],
        recommendations: analysisResult.recommendations || [],
        processing_time_ms: Date.now() - startTime,
      };
    }, "validateImage");
  }

  /**
   * Validate multiple images in batch
   */
  async validateImages(
    requests: ImageValidationRequest[]
  ): Promise<ImageValidationResult[]> {
    return this.executeOperation(async () => {
      const results: ImageValidationResult[] = [];

      for (const request of requests) {
        try {
          const result = await this.validateImage(request);
          results.push(result);
        } catch (error) {
          console.error(`Failed to validate image ${request.image_id}:`, error);
          results.push({
            image_id: request.image_id,
            validation_status: "invalid",
            quality_score: 0,
            product_associations: [],
            issues: [`Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`],
            recommendations: [],
            processing_time_ms: 0,
          });
        }
      }

      return results;
    }, "validateImages");
  }
}

