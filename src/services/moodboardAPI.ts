import { supabase } from '@/integrations/supabase/client';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';

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
          metadata,
          product_images(
            image_url,
            image_type,
            display_order
          )
        )
      `,
      )
      .eq('moodboard_id', moodboardId)
      .order('position', { ascending: true });

    if (error) throw error;

    // Transform data to include thumbnail_url from product_images
    return (data || []).map(item => ({
      ...item,
      material: item.material ? {
        ...item.material,
        category: item.material.metadata?.category || item.material.category_id || 'Uncategorized',
        thumbnail_url: item.material.product_images?.[0]?.image_url || null,
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
          metadata,
          product_images(
            image_url,
            image_type,
            display_order
          )
        )
      `,
      )
      .single();

    if (error) throw error;

    // Transform to include thumbnail_url
    return {
      ...result,
      material: result.material ? {
        ...result.material,
        category: result.material.metadata?.category || result.material.category_id || 'Uncategorized',
        thumbnail_url: result.material.product_images?.[0]?.image_url || null,
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
          metadata,
          product_images(
            image_url,
            image_type,
            display_order
          )
        )
      `,
      )
      .single();

    if (error) throw error;

    // Transform to include thumbnail_url
    return {
      ...result,
      material: result.material ? {
        ...result.material,
        category: result.material.metadata?.category || result.material.category_id || 'Uncategorized',
        thumbnail_url: result.material.product_images?.[0]?.image_url || null,
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
