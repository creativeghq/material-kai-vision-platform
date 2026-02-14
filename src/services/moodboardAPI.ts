import { supabase } from '@/integrations/supabase/client';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';
import { flowEventService } from '@/services/flows/flowEventService';

export interface CreateMoodBoardData {
  title: string;
  description?: string;
  is_public?: boolean;
  view_preference?: 'grid' | 'list';
}

export interface UpdateMoodBoardData {
  title?: string;
  description?: string;
  is_public?: boolean;
  view_preference?: 'grid' | 'list';
}

export interface AddMoodBoardItemData {
  moodboard_id: string;
  material_id: string;
  notes?: string;
  position?: number;
}

class MoodBoardAPI {
  // Get all moodboards for the current user
  async getUserMoodBoards(): Promise<MoodBoard[]> {
    const { data, error } = await supabase
      .from('moodboards')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return data.map((board: any) => ({
      id: board.id,
      userId: board.user_id,
      title: board.title,
      description: board.description,
      isPublic: board.is_public,
      items: [], // Will be loaded separately when needed
      createdAt: new Date(board.created_at),
      updatedAt: new Date(board.updated_at),
    }));
  }

  // Get a specific moodboard by ID
  async getMoodBoard(id: string): Promise<MoodBoard | null> {
    const { data, error } = await supabase
      .from('moodboards')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      description: data.description,
      isPublic: data.is_public,
      items: [], // Will be loaded separately
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // Create a new moodboard
  async createMoodBoard(data: CreateMoodBoardData): Promise<MoodBoard> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: result, error } = await supabase
      .from('moodboards')
      .insert({
        user_id: user.id,
        title: data.title,
        description: data.description,
        is_public: data.is_public ?? false,
        view_preference: data.view_preference ?? 'grid',
      })
      .select()
      .single();

    if (error) throw error;

    flowEventService.emit('moodboard_created', {
      moodboard_id: result.id,
      title: result.title,
      user_id: user.id,
    });

    return {
      id: result.id,
      userId: result.user_id,
      title: result.title,
      description: result.description,
      isPublic: result.is_public,
      items: [],
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
    };
  }

  // Update a moodboard
  async updateMoodBoard(
    id: string,
    data: UpdateMoodBoardData,
  ): Promise<MoodBoard> {
    const { data: result, error } = await supabase
      .from('moodboards')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (data.is_public === true) {
      flowEventService.emit('moodboard_shared', {
        moodboard_id: result.id,
        title: result.title,
        shared_by: result.user_id,
      });
    }

    return {
      id: result.id,
      userId: result.user_id,
      title: result.title,
      description: result.description,
      isPublic: result.is_public,
      items: [],
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
    };
  }

  // Delete a moodboard
  async deleteMoodBoard(id: string): Promise<void> {
    const { error } = await supabase.from('moodboards').delete().eq('id', id);

    if (error) throw error;
  }

  // Get items in a moodboard
  async getMoodBoardItems(moodboardId: string): Promise<MoodBoardItem[]> {
    const { data, error } = await supabase
      .from('moodboard_items')
      .select(
        `
        *,
        material:products(
          id,
          name,
          category_id,
          properties,
          metadata
        )
      `,
      )
      .eq('moodboard_id', moodboardId)
      .order('position', { ascending: true });

    if (error) throw error;

    // Get product IDs to fetch images
    const productIds = (data || [])
      .map(item => item.material?.id)
      .filter((id): id is string => !!id);

    // Fetch images for all products using product_image_relationships
    const productImageMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: imageRelations } = await supabase
        .from('product_image_relationships')
        .select('product_id, image:document_images(image_url)')
        .in('product_id', productIds)
        .order('relevance_score', { ascending: false });

      if (imageRelations) {
        for (const rel of imageRelations) {
          const imgData = rel.image as any;
          if (!productImageMap[rel.product_id] && imgData?.image_url) {
            productImageMap[rel.product_id] = imgData.image_url;
          }
        }
      }
    }

    // Transform data to include thumbnail_url from product_image_relationships
    return (data || []).map(item => ({
      ...item,
      material: item.material ? {
        ...item.material,
        category: item.material.metadata?.category || item.material.category_id || 'Uncategorized',
        thumbnail_url: productImageMap[item.material.id] || null,
      } : null,
    }));
  }

  // Add material to moodboard
  async addMoodBoardItem(itemData: AddMoodBoardItemData): Promise<MoodBoardItem> {
    // Get the next position
    const { data: existingItems } = await supabase
      .from('moodboard_items')
      .select('position')
      .eq('moodboard_id', itemData.moodboard_id)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition =
      itemData.position ?? (existingItems?.[0]?.position ?? -1) + 1;

    const { data: result, error } = await supabase
      .from('moodboard_items')
      .insert({
        moodboard_id: itemData.moodboard_id,
        material_id: itemData.material_id,
        notes: itemData.notes,
        position: nextPosition,
      })
      .select(
        `
        *,
        material:products(
          id,
          name,
          category_id,
          properties,
          metadata
        )
      `,
      )
      .single();

    if (error) throw error;

    // Fetch image for the product using product_image_relationships
    let thumbnail_url: string | null = null;
    if (result.material?.id) {
      const { data: imageRelations } = await supabase
        .from('product_image_relationships')
        .select('image:document_images(image_url)')
        .eq('product_id', result.material.id)
        .order('relevance_score', { ascending: false })
        .limit(1);

      if (imageRelations && imageRelations.length > 0) {
        const imgData = imageRelations[0].image as any;
        thumbnail_url = imgData?.image_url || null;
      }
    }

    flowEventService.emit('moodboard_item_added', {
      moodboard_id: itemData.moodboard_id,
      item_id: result.id,
      product_id: itemData.material_id,
    });

    // Transform to include thumbnail_url
    return {
      ...result,
      material: result.material ? {
        ...result.material,
        category: result.material.metadata?.category || result.material.category_id || 'Uncategorized',
        thumbnail_url,
      } : null,
    };
  }

  // Update moodboard item
  async updateMoodBoardItem(
    id: string,
    updateData: { notes?: string; position?: number },
  ): Promise<MoodBoardItem> {
    const { data: result, error } = await supabase
      .from('moodboard_items')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        *,
        material:products(
          id,
          name,
          category_id,
          properties,
          metadata
        )
      `,
      )
      .single();

    if (error) throw error;

    // Fetch image for the product using product_image_relationships
    let thumbnail_url: string | null = null;
    if (result.material?.id) {
      const { data: imageRelations } = await supabase
        .from('product_image_relationships')
        .select('image:document_images(image_url)')
        .eq('product_id', result.material.id)
        .order('relevance_score', { ascending: false })
        .limit(1);

      if (imageRelations && imageRelations.length > 0) {
        const imgData = imageRelations[0].image as any;
        thumbnail_url = imgData?.image_url || null;
      }
    }

    // Transform to include thumbnail_url
    return {
      ...result,
      material: result.material ? {
        ...result.material,
        category: result.material.metadata?.category || result.material.category_id || 'Uncategorized',
        thumbnail_url,
      } : null,
    };
  }

  // Remove material from moodboard
  async removeMoodBoardItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('moodboard_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Get public moodboards
  async getPublicMoodBoards(limit?: number): Promise<MoodBoard[]> {
    let query = supabase
      .from('moodboards')
      .select('*')
      .eq('is_public', true)
      .order('updated_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data.map((board: any) => ({
      id: board.id,
      userId: board.user_id,
      title: board.title,
      description: board.description,
      isPublic: board.is_public,
      items: [],
      createdAt: new Date(board.created_at),
      updatedAt: new Date(board.updated_at),
    }));
  }
}

export const moodboardAPI = new MoodBoardAPI();
