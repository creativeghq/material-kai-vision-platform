import { supabase } from '@/integrations/supabase/client';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';
import { flowEventService } from '@/services/flows/flowEventService';
import { quotesService } from '@/modules/quotes/services/QuotesService';
import { getProductName } from '@/utils/productMetadata';
import { moodboardPath, generationPathFromUrl } from '@/utils/storagePaths';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';

export interface CreateMoodBoardData {
  title: string;
  description?: string;
  is_public?: boolean;
  view_preference?: 'grid' | 'list';
  project_id?: string | null;
  room_id?: string | null;
}

export interface UpdateMoodBoardData {
  title?: string;
  description?: string;
  is_public?: boolean;
  view_preference?: 'grid' | 'list';
}

export interface AddMoodBoardItemData {
  moodboard_id: string;
  material_id?: string | null;
  notes?: string;
  position?: number;
  media_url?: string;
  media_type?: 'image' | 'video' | 'vr_world';
  media_title?: string;
}

class MoodBoardAPI {
  // Get all moodboards for the current user, with preview images for each
  async getUserMoodBoards(): Promise<MoodBoard[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('moodboards')
      .select(`
        *,
        moodboard_items(
          id,
          material_id,
          position,
          notes,
          added_at,
          material:products(id, name, category_id, properties, metadata)
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Batch fetch preview images for the first 4 items of each moodboard
    const allProductIds = new Set<string>();
    for (const board of data || []) {
      for (const item of (board.moodboard_items || []).slice(0, 4)) {
        if (item.material_id) allProductIds.add(item.material_id);
      }
    }

    const productImageMap: Record<string, string> = {};
    if (allProductIds.size > 0) {
      const { data: imageRelations } = await supabase
        .from('image_product_associations')
        .select('product_id, overall_score, image:document_images(image_url)')
        .in('product_id', [...allProductIds])
        .order('overall_score', { ascending: false });

      if (imageRelations) {
        for (const rel of imageRelations) {
          const imgData = rel.image as any;
          if (!productImageMap[rel.product_id] && imgData?.image_url) {
            productImageMap[rel.product_id] = imgData.image_url;
          }
        }
      }
    }

    return (data || []).map((board: any) => {
      const rawItems: Array<{
        id: string;
        material_id: string;
        position: number;
        notes?: string;
        added_at: string;
        material?: { id: string; name?: string; category_id?: string; properties?: any; metadata?: any } | null;
      }> = (board.moodboard_items || []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );

      const items: MoodBoardItem[] = rawItems.map(item => ({
        id: item.id,
        moodboard_id: board.id,
        material_id: item.material_id,
        notes: item.notes,
        position: item.position ?? 0,
        added_at: item.added_at,
        material: item.material
          ? {
              id: item.material.id,
              name: getProductName(item.material),
              category:
                item.material.metadata?.category ||
                item.material.metadata?.material_category ||
                item.material.category_id ||
                'Uncategorized',
              thumbnail_url: productImageMap[item.material.id] || undefined,
              properties: item.material.properties || {},
              metadata: item.material.metadata || {},
            }
          : {
              id: item.material_id,
              name: 'Unnamed Product',
              category: 'Uncategorized',
              thumbnail_url: productImageMap[item.material_id] || undefined,
              properties: {},
            },
      }));

      return {
        id: board.id,
        userId: board.user_id,
        title: board.title,
        description: board.description,
        isPublic: board.is_public,
        items,
        createdAt: new Date(board.created_at),
        updatedAt: new Date(board.updated_at),
        status: board.status ?? 'active',
        deletionScheduledAt: board.deletion_scheduled_at ?? null,
      };
    });
  }

  /** Cancel a scheduled dormancy deletion — clears the warning/deletion markers and touches the
   *  board so the idle clock restarts. The in-app "Keep active" rescue for an at-risk board. */
  async keepActive(id: string): Promise<void> {
    const { error } = await supabase
      .from('moodboards')
      .update({ dormancy_warned_at: null, dormancy_reminder_at: null, deletion_scheduled_at: null, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    if (error) throw error;
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
      projectId: (data as any).project_id ?? null,
      roomId: (data as any).room_id ?? null,
      status: (data as any).status ?? 'active',
      deletionScheduledAt: (data as any).deletion_scheduled_at ?? null,
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
        project_id: data.project_id ?? null,
        room_id: data.room_id ?? null,
      } as any)
      .select()
      .single();

    if (error) throw error;

    flowEventService.emit('moodboard_created', {
      moodboard_id: result.id,
      title: result.title,
      user_id: user.id,
      // Moodboards are user-scoped (no workspace_id column), so resolve the user's active workspace
      // — without it flow-engine matches only is_global flows and a tenant's own automation never fires.
      workspace_id: getActiveWorkspaceId(user.id),
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
      projectId: (result as any).project_id ?? null,
      roomId: (result as any).room_id ?? null,
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
        workspace_id: getActiveWorkspaceId(result.user_id),
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
      projectId: (result as any).project_id ?? null,
      roomId: (result as any).room_id ?? null,
    };
  }

  /**
   * Mark a moodboard completed (or reopen it). Completing it is a lifecycle flag
   * only — items and sheets are untouched — but it lets the daily storage-retention
   * sweep purge the moodboard's regenerable sheet PDFs (which rebuild on open),
   * so a finished board stops holding storage. Reopening clears the flag.
   */
  async setMoodBoardStatus(id: string, status: 'active' | 'completed'): Promise<void> {
    const { error } = await supabase
      .from('moodboards')
      .update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      } as never)
      .eq('id', id);
    if (error) throw error;
  }

  // Delete a moodboard
  // FKs on moodboard_items.moodboard_id and moodboard_presentation_sheets.moodboard_id
  // are ON DELETE CASCADE, so every child row is removed in one transaction.
  // Storage files (moodboard images in generation-images, sheet PDFs in pdf-documents)
  // are NOT deleted synchronously — there is no AFTER DELETE storage trigger. Once the
  // rows are gone the files are unreferenced and storage-orphan-cleanup-cron garbage-
  // collects them (generation-images 14d grace, pdf-documents 72h) via
  // build_storage_reference_set / find_orphan_storage_objects.
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

    // Fetch best image for each product via image_product_associations
    const productImageMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: imageRelations } = await supabase
        .from('image_product_associations')
        .select('product_id, overall_score, image:document_images(image_url)')
        .in('product_id', productIds)
        .order('overall_score', { ascending: false });

      if (imageRelations) {
        for (const rel of imageRelations) {
          const imgData = rel.image as any;
          if (!productImageMap[rel.product_id] && imgData?.image_url) {
            productImageMap[rel.product_id] = imgData.image_url;
          }
        }
      }
    }

    // Transform data to include thumbnail_url
    return (data || []).map(item => ({
      ...item,
      material: item.material ? {
        ...item.material,
        name: getProductName(item.material),
        category:
          item.material.metadata?.category ||
          item.material.metadata?.material_category ||
          item.material.category_id ||
          'Uncategorized',
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
        material_id: itemData.material_id ?? null,
        notes: itemData.notes,
        position: nextPosition,
        ...(itemData.media_url ? { media_url: itemData.media_url } : {}),
        ...(itemData.media_type ? { media_type: itemData.media_type } : {}),
        ...(itemData.media_title ? { media_title: itemData.media_title } : {}),
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

    // Fetch best image for the product via image_product_associations
    let thumbnail_url: string | null = null;
    if (result.material?.id) {
      const { data: imageRelations } = await supabase
        .from('image_product_associations')
        .select('image:document_images(image_url)')
        .eq('product_id', result.material.id)
        .order('overall_score', { ascending: false })
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
        name: getProductName(result.material),
        category:
          result.material.metadata?.category ||
          result.material.metadata?.material_category ||
          result.material.category_id ||
          'Uncategorized',
        thumbnail_url,
      } : null,
    };
  }

  // Add chat-generated/attached media to a moodboard (copy-on-promote).
  // Chat media lives under the per-session prefix
  // `generation-images/u/{user_id}/sessions/{conversation_id}/...`, which is
  // prefix-deleted when the originating chat is deleted. To make the image
  // survive that, we COPY the bytes into a moodboard-owned folder
  // (`u/{user_id}/moodboards/{moodboard_id}/...`, outside any session prefix)
  // and store the copy's URL on the moodboard_items row. The original stays in
  // the chat. Non-generation-images URLs (external pins, VR splat URLs) are
  // stored as-is — they have their own lifecycle.
  async addMediaFromChat(params: {
    moodboard_id: string;
    source_url: string;
    media_type: 'image' | 'video' | 'vr_world';
    media_title?: string;
    notes?: string;
  }): Promise<MoodBoardItem> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let mediaUrl = params.source_url;
    const srcPath = generationPathFromUrl(params.source_url);
    // Only copy real generation-images objects that aren't already moodboard-owned.
    if (srcPath && !srcPath.startsWith(`u/${user.id}/moodboards/`)) {
      const ext = srcPath.split('.').pop()?.split('?')[0] || 'jpg';
      const itemId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const destPath = moodboardPath(user.id, params.moodboard_id, `${itemId}.${ext}`);
      const { error: copyErr } = await supabase.storage
        .from('generation-images')
        .copy(srcPath, destPath);
      if (!copyErr) {
        mediaUrl = supabase.storage.from('generation-images').getPublicUrl(destPath).data.publicUrl;
      }
      // Best-effort: if the copy fails we keep the original URL. The orphan cron
      // still protects it while the source chat is alive.
    }

    return this.addMoodBoardItem({
      moodboard_id: params.moodboard_id,
      material_id: null,
      media_url: mediaUrl,
      media_type: params.media_type,
      media_title: params.media_title,
      notes: params.notes,
    });
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

    // Fetch best image for the product via image_product_associations
    let thumbnail_url: string | null = null;
    if (result.material?.id) {
      const { data: imageRelations } = await supabase
        .from('image_product_associations')
        .select('image:document_images(image_url)')
        .eq('product_id', result.material.id)
        .order('overall_score', { ascending: false })
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
        name: getProductName(result.material),
        category:
          result.material.metadata?.category ||
          result.material.metadata?.material_category ||
          result.material.category_id ||
          'Uncategorized',
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

  /**
   * Mark a 3D generation as saved to a moodboard.
   * This prevents it from being deleted by the cleanup cron after 15 days.
   */
  async markGenerationSaved(generationId: string): Promise<void> {
    const { error } = await supabase
      .from('generation_3d')
      .update({ saved_to_moodboard_at: new Date().toISOString() })
      .eq('id', generationId);

    if (error) throw error;
  }

  /**
   * Request a quote from someone else's (shared) moodboard.
   *
   * The signed-in viewer becomes the requester: we build a quote owned by them
   * from the board's products, submit it (→ a `quote_requests` row), then record
   * a `moodboard_quote_requests` link so the board's CREATOR gets the lead (this
   * is what populates the "Quote reqs" stat on their profile). The creator is
   * notified through the `moodboard_quote_requested` Flow — no hardcoded
   * notification insert. Actual pricing is governed by the marketplace resale
   * pyramid.
   *
   * Throws with a user-facing message on the guarded cases (not signed in, own
   * board, empty board) so the caller can toast it directly.
   */
  async requestQuoteFromMoodboard(
    moodboardId: string,
  ): Promise<{ quote_id: string; quote_request_id: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in to request a quote.');

    const { data: board, error: boardErr } = await supabase
      .from('moodboards')
      .select('id, title, user_id, is_public')
      .eq('id', moodboardId)
      .maybeSingle();
    if (boardErr) throw boardErr;
    if (!board) throw new Error('Moodboard not found.');
    if (board.user_id === user.id) {
      throw new Error("You can't request a quote from your own moodboard.");
    }

    const { data: items, error: itemsErr } = await supabase
      .from('moodboard_items')
      .select('material_id, notes, media_title, media_url')
      .eq('moodboard_id', moodboardId);
    if (itemsErr) throw itemsErr;
    const allItems = items || [];
    if (allItems.length === 0) {
      throw new Error('This moodboard is empty.');
    }

    // Build + submit a quote owned by the requester from EVERY board item — catalog products as
    // product lines, media-only (AI / Pinterest / VR) as custom lines — so a purely-inspirational
    // board (no catalog products) can still generate a lead instead of a hidden CTA.
    const quote = await quotesService.createQuote({
      name: `Quote request: ${board.title}`,
      notes: `Requested from shared moodboard "${board.title}"`,
    });
    for (const item of allItems) {
      if (item.material_id) {
        await quotesService.addItem({
          quote_id: quote.id,
          product_id: item.material_id as string,
          quantity: 1,
          notes: item.notes || '',
          added_from: 'moodboard',
        });
      } else {
        await quotesService.addCustomItem({
          quote_id: quote.id,
          custom_product_name: (item as any).media_title || 'Inspiration item',
          custom_image_url: (item as any).media_url || undefined,
          quantity: 1,
          notes: item.notes || '',
        });
      }
    }
    await quotesService.submitQuote(quote.id, `From moodboard: ${board.title}`);

    const { data: qr, error: qrErr } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (qrErr) throw qrErr;
    if (!qr) throw new Error('Could not create the quote request. Please try again.');

    const { error: linkErr } = await supabase
      .from('moodboard_quote_requests')
      .insert({
        moodboard_id: board.id,
        moodboard_creator_id: board.user_id,
        requester_id: user.id,
        quote_request_id: qr.id,
        status: 'pending',
      });
    if (linkErr) throw linkErr;

    // Notify the moodboard creator via the Flows engine (the seeded
    // `moodboard_quote_requested` system flow turns this into a notification).
    const requesterName =
      (user.user_metadata?.full_name as string | undefined) || user.email || 'A member';
    flowEventService.emit('moodboard_quote_requested', {
      user_id: board.user_id, // recipient — consumed by create_notification
      type: 'moodboard_quote',
      title: `Quote requested from "${board.title}"`,
      body: `${requesterName} requested a quote based on your moodboard "${board.title}".`,
      action_url: '/profile',
      moodboard_id: board.id,
      moodboard_title: board.title,
      requester_id: user.id,
      requester_name: requesterName,
      quote_request_id: qr.id,
    });

    return { quote_id: quote.id, quote_request_id: qr.id };
  }
}

export const moodboardAPI = new MoodBoardAPI();
