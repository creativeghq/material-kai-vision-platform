/**
 * Metafield Service
 *
 * Handles extraction, storage, and retrieval of metafield values for:
 * - Materials
 * - Chunks
 * - Products
 * - Images
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  EntityMetafieldValue,
  DocumentChunk,
  Product,
  DocumentImage,
  MaterialMetafieldDefinition,
} from '@/types/unified-material-api';

export class MetafieldService {
  /**
   * Extract metafield values from text content using AI
   */
  static async extractMetafieldsFromText(
    text: string,
    applicableFields: MaterialMetafieldDefinition[],
  ): Promise<Record<string, unknown>> {
    try {
      // Call MIVAA gateway for AI extraction
      const response = await fetch('/api/supabase-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionName: 'mivaa-gateway',
          payload: {
            action: 'extract_metafields',
            text,
            fields: applicableFields.map(f => ({
              field_id: f.id,
              field_name: f.name,
              field_type: f.dataType,
              extraction_hints: f.display?.helpText || '',
            })),
            confidence_threshold: 0.6,
          },
        }),
      });

      if (!response.ok) throw new Error('Metafield extraction failed');
      const result = await response.json();
      return result.data?.extracted_fields || {};
    } catch (error) {
      console.error('Error extracting metafields:', error);
      return {};
    }
  }

  /**
   * Extract metafield values from image using visual analysis
   */
  static async extractMetafieldsFromImage(
    imageUrl: string,
    applicableFields: MaterialMetafieldDefinition[],
  ): Promise<Record<string, unknown>> {
    try {
      const response = await fetch('/api/supabase-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionName: 'mivaa-gateway',
          payload: {
            action: 'extract_image_metafields',
            image_url: imageUrl,
            fields: applicableFields.map(f => ({
              field_id: f.id,
              field_name: f.name,
              field_type: f.dataType,
            })),
            confidence_threshold: 0.6,
          },
        }),
      });

      if (!response.ok) throw new Error('Image metafield extraction failed');
      const result = await response.json();
      return result.data?.extracted_fields || {};
    } catch (error) {
      console.error('Error extracting image metafields:', error);
      return {};
    }
  }

  /**
   * Save metafield values for a chunk
   */
  static async saveChunkMetafields(
    chunkId: string,
    metafields: Record<string, unknown>,
    fieldDefinitions: Map<string, MaterialMetafieldDefinition>,
    extractionMethod: string = 'ai_extraction',
  ): Promise<void> {
    const values: Partial<EntityMetafieldValue>[] = [];

    for (const [fieldName, value] of Object.entries(metafields)) {
      const fieldDef = Array.from(fieldDefinitions.values()).find(f => f.name === fieldName);
      if (!fieldDef) continue;

      const metafieldValue = this.normalizeMetafieldValue(value, fieldDef.dataType);
      values.push({
        entityId: chunkId,
        fieldId: fieldDef.id,
        ...metafieldValue,
        confidenceScore: 0.8,
        extractionMethod,
      });
    }

    if (values.length === 0) return;

    const { error } = await supabase
      .from('chunk_metafield_values')
      .upsert(values, { onConflict: 'chunk_id,field_id' });

    if (error) throw error;
  }

  /**
   * Save metafield values for a product
   */
  static async saveProductMetafields(
    productId: string,
    metafields: Record<string, unknown>,
    fieldDefinitions: Map<string, MaterialMetafieldDefinition>,
    extractionMethod: string = 'ai_extraction',
  ): Promise<void> {
    const values: Partial<EntityMetafieldValue>[] = [];

    for (const [fieldName, value] of Object.entries(metafields)) {
      const fieldDef = Array.from(fieldDefinitions.values()).find(f => f.name === fieldName);
      if (!fieldDef) continue;

      const metafieldValue = this.normalizeMetafieldValue(value, fieldDef.dataType);
      values.push({
        entityId: productId,
        fieldId: fieldDef.id,
        ...metafieldValue,
        confidenceScore: 0.8,
        extractionMethod,
      });
    }

    if (values.length === 0) return;

    const { error } = await supabase
      .from('product_metafield_values')
      .upsert(values, { onConflict: 'product_id,field_id' });

    if (error) throw error;
  }

  /**
   * Save metafield values for an image
   */
  static async saveImageMetafields(
    imageId: string,
    metafields: Record<string, unknown>,
    fieldDefinitions: Map<string, MaterialMetafieldDefinition>,
    extractionMethod: string = 'visual_analysis',
  ): Promise<void> {
    const values: Partial<EntityMetafieldValue>[] = [];

    for (const [fieldName, value] of Object.entries(metafields)) {
      const fieldDef = Array.from(fieldDefinitions.values()).find(f => f.name === fieldName);
      if (!fieldDef) continue;

      const metafieldValue = this.normalizeMetafieldValue(value, fieldDef.dataType);
      values.push({
        entityId: imageId,
        fieldId: fieldDef.id,
        ...metafieldValue,
        confidenceScore: 0.8,
        extractionMethod,
      });
    }

    if (values.length === 0) return;

    const { error } = await supabase
      .from('image_metafield_values')
      .upsert(values, { onConflict: 'image_id,field_id' });

    if (error) throw error;
  }

  /**
   * Fetch metafield values for a chunk
   */
  static async getChunkMetafields(chunkId: string): Promise<EntityMetafieldValue[]> {
    const { data, error } = await supabase
      .from('chunk_metafield_values')
      .select('*')
      .eq('chunk_id', chunkId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Fetch metafield values for a product
   */
  static async getProductMetafields(productId: string): Promise<EntityMetafieldValue[]> {
    const { data, error } = await supabase
      .from('product_metafield_values')
      .select('*')
      .eq('product_id', productId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Fetch metafield values for an image
   */
  static async getImageMetafields(imageId: string): Promise<EntityMetafieldValue[]> {
    const { data, error } = await supabase
      .from('image_metafield_values')
      .select('*')
      .eq('image_id', imageId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Normalize metafield value based on data type
   */
  private static normalizeMetafieldValue(
    value: unknown,
    dataType: string,
  ): Partial<EntityMetafieldValue> {
    switch (dataType) {
      case 'number':
        return { valueNumber: Number(value) };
      case 'boolean':
        return { valueBoolean: Boolean(value) };
      case 'date':
        return { valueDate: new Date(String(value)).toISOString() };
      case 'json':
        return { valueJson: typeof value === 'object' ? value as Record<string, unknown> : {} };
      default:
        return { valueText: String(value) };
    }
  }

  /**
   * Search chunks by metafield values
   */
  static async searchChunksByMetafields(
    filters: Record<string, unknown>,
  ): Promise<DocumentChunk[]> {
    let query = supabase
      .from('document_chunks')
      .select(`
        *,
        chunk_metafield_values(*)
      `);

    // Apply filters based on metafield values
    for (const [fieldName, value] of Object.entries(filters)) {
      query = query.or(`chunk_metafield_values.value_text.ilike.%${value}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Search products by metafield values
   */
  static async searchProductsByMetafields(
    filters: Record<string, unknown>,
  ): Promise<Product[]> {
    let query = supabase
      .from('products')
      .select(`
        *,
        product_metafield_values(*)
      `);

    for (const [fieldName, value] of Object.entries(filters)) {
      query = query.or(`product_metafield_values.value_text.ilike.%${value}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Search images by metafield values
   */
  static async searchImagesByMetafields(
    filters: Record<string, unknown>,
  ): Promise<DocumentImage[]> {
    let query = supabase
      .from('document_images')
      .select(`
        *,
        image_metafield_values(*)
      `);

    for (const [fieldName, value] of Object.entries(filters)) {
      query = query.or(`image_metafield_values.value_text.ilike.%${value}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}

