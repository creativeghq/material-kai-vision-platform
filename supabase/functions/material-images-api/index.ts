import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

interface StandardApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  metadata?: {
    total_count?: number;
    processing_time_ms?: number;
    [key: string]: any;
  };
}

interface MaterialImage {
  id: string;
  material_id: string;
  image_url: string;
  image_type: string;
  title?: string;
  description?: string;
  alt_text?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  width?: number;
  height?: number;
  storage_path?: string;
  storage_bucket: string;
  display_order: number;
  is_featured: boolean;
  metadata?: Record<string, any>;
  variants?: Record<string, string>;
  analysis_data?: Record<string, any>;
  tags?: string[];
  color_palette?: Record<string, any>;
  source_url?: string;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// GET /material-images-api - Get images for material(s)
async function handleGetMaterialImages(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  
  const material_id = params.get('material_id');
  const image_type = params.get('image_type');
  const is_featured = params.get('is_featured');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('material_images')
      .select(`
        *,
        material:materials_catalog(name, category)
      `);
    
    // Apply filters
    if (material_id) {
      query = query.eq('material_id', material_id);
    }
    
    if (image_type) {
      query = query.eq('image_type', image_type);
    }
    
    if (is_featured) {
      query = query.eq('is_featured', is_featured === 'true');
    }
    
    query = query.limit(limit).order('display_order').order('created_at', { ascending: false });
    
    const { data: images, error, count } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch material images: ${error.message}`);
    }
    
    const formattedImages: MaterialImage[] = (images || []).map(img => ({
      id: img.id,
      material_id: img.material_id,
      image_url: img.image_url,
      image_type: img.image_type,
      title: img.title,
      description: img.description,
      alt_text: img.alt_text,
      file_name: img.file_name,
      file_size: img.file_size,
      mime_type: img.mime_type,
      width: img.width,
      height: img.height,
      storage_path: img.storage_path,
      storage_bucket: img.storage_bucket,
      display_order: img.display_order,
      is_featured: img.is_featured,
      metadata: img.metadata,
      variants: img.variants,
      analysis_data: img.analysis_data,
      tags: img.tags,
      color_palette: img.color_palette,
      source_url: img.source_url,
      verified_by: img.verified_by,
      verified_at: img.verified_at,
      created_at: img.created_at,
      updated_at: img.updated_at,
      created_by: img.created_by
    }));
    
    // Store search results
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { error: storageError } = await supabase
        .from('search_analytics')
        .insert({
          user_id: url.searchParams.get('user_id'),
          input_data: {
            material_id: material_id,
            image_type: image_type,
            is_featured: is_featured,
            limit: limit,
            offset: offset,
          },
          result_data: {
            images: formattedImages,
            total_count: count || images?.length || 0,
          },
          confidence_score: formattedImages.length > 0 ? 1.0 : 0,
          processing_time_ms: Date.now() - startTime,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (storageError) {
        console.error('Failed to store search results:', storageError);
      } else {
        console.log('✅ Search results stored successfully');
      }
    } catch (storageError) {
      console.error('Error storing search results:', storageError);
    }

    const response: StandardApiResponse<MaterialImage[]> = {
      success: true,
      data: formattedImages,
      metadata: {
        total_count: count || images?.length || 0,
        processing_time_ms: Date.now() - startTime,
        filters: {
          material_id,
          image_type,
          is_featured
        }
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error fetching material images:', error);
    const response: StandardApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch material images',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// POST /material-images-api - Upload and associate new image
async function handleUploadMaterialImage(request: Request): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.material_id || (!body.image_data && !body.image_url)) {
      const response: StandardApiResponse<never> = {
        success: false,
        error: 'material_id and either image_data or image_url are required',
        metadata: {
          processing_time_ms: Date.now() - startTime
        }
      };
      
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization');
    let userId = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      userId = user?.id;
    }
    
    // Validate material exists
    const { data: material } = await supabase
      .from('materials_catalog')
      .select('id, name')
      .eq('id', body.material_id)
      .single();
    
    if (!material) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Material not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    let imageUrl = body.image_url;
    let storagePath = null;
    let fileSize = null;
    let mimeType = null;
    let fileName = body.file_name;
    
    // Handle image upload if image_data is provided
    if (body.image_data) {
      try {
        // Decode base64 image data
        const matches = body.image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid image data format');
        }
        
        mimeType = matches[1];
        const base64Data = matches[2];
        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        fileSize = imageBuffer.length;
        
        // Generate file name if not provided
        if (!fileName) {
          const extension = mimeType.split('/')[1] || 'jpg';
          fileName = `material-${body.material_id}-${Date.now()}.${extension}`;
        }
        
        // Generate storage path
        storagePath = `materials/${body.material_id}/${fileName}`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('material-images')
          .upload(storagePath, imageBuffer, {
            contentType: mimeType,
            upsert: false
          });
        
        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('material-images')
          .getPublicUrl(storagePath);
        
        imageUrl = publicUrl;
        
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        const response: StandardApiResponse<never> = {
          success: false,
          error: `Image upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
          metadata: {
            processing_time_ms: Date.now() - startTime
          }
        };
        
        return new Response(JSON.stringify(response), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Create image record
    const imageData = {
      material_id: body.material_id,
      image_url: imageUrl,
      image_type: body.image_type || 'primary',
      title: body.title,
      description: body.description,
      alt_text: body.alt_text,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      width: body.width,
      height: body.height,
      storage_path: storagePath,
      storage_bucket: 'material-images',
      display_order: body.display_order || 0,
      is_featured: body.is_featured || false,
      metadata: body.metadata || {},
      variants: body.variants || {},
      analysis_data: body.analysis_data || {},
      tags: body.tags || [],
      color_palette: body.color_palette || {},
      source_url: body.source_url,
      created_by: userId
    };
    
    const { data: savedImage, error: saveError } = await supabase
      .from('material_images')
      .insert(imageData)
      .select()
      .single();
    
    if (saveError) {
      // If image was uploaded but database insert failed, clean up
      if (storagePath) {
        await supabase.storage.from('material-images').remove([storagePath]);
      }
      throw new Error(`Failed to save image record: ${saveError.message}`);
    }
    
    const response: StandardApiResponse<MaterialImage> = {
      success: true,
      data: {
        id: savedImage.id,
        material_id: savedImage.material_id,
        image_url: savedImage.image_url,
        image_type: savedImage.image_type,
        title: savedImage.title,
        description: savedImage.description,
        alt_text: savedImage.alt_text,
        file_name: savedImage.file_name,
        file_size: savedImage.file_size,
        mime_type: savedImage.mime_type,
        width: savedImage.width,
        height: savedImage.height,
        storage_path: savedImage.storage_path,
        storage_bucket: savedImage.storage_bucket,
        display_order: savedImage.display_order,
        is_featured: savedImage.is_featured,
        metadata: savedImage.metadata,
        variants: savedImage.variants,
        analysis_data: savedImage.analysis_data,
        tags: savedImage.tags,
        color_palette: savedImage.color_palette,
        source_url: savedImage.source_url,
        verified_by: savedImage.verified_by,
        verified_at: savedImage.verified_at,
        created_at: savedImage.created_at,
        updated_at: savedImage.updated_at,
        created_by: savedImage.created_by
      },
      message: 'Material image uploaded and associated successfully',
      metadata: {
        processing_time_ms: Date.now() - startTime,
        upload_method: body.image_data ? 'base64_upload' : 'url_association'
      }
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error uploading material image:', error);
    const response: StandardApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload material image',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// PUT /material-images-api/:id - Update image metadata
async function handleUpdateMaterialImage(request: Request, imageId: string): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    
    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    const allowedFields = [
      'title', 'description', 'alt_text', 'image_type', 'display_order',
      'is_featured', 'metadata', 'variants', 'analysis_data', 'tags', 'color_palette'
    ];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });
    
    const { data: updatedImage, error: updateError } = await supabase
      .from('material_images')
      .update(updateData)
      .eq('id', imageId)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Failed to update image: ${updateError.message}`);
    }
    
    const response: StandardApiResponse<MaterialImage> = {
      success: true,
      data: {
        id: updatedImage.id,
        material_id: updatedImage.material_id,
        image_url: updatedImage.image_url,
        image_type: updatedImage.image_type,
        title: updatedImage.title,
        description: updatedImage.description,
        alt_text: updatedImage.alt_text,
        file_name: updatedImage.file_name,
        file_size: updatedImage.file_size,
        mime_type: updatedImage.mime_type,
        width: updatedImage.width,
        height: updatedImage.height,
        storage_path: updatedImage.storage_path,
        storage_bucket: updatedImage.storage_bucket,
        display_order: updatedImage.display_order,
        is_featured: updatedImage.is_featured,
        metadata: updatedImage.metadata,
        variants: updatedImage.variants,
        analysis_data: updatedImage.analysis_data,
        tags: updatedImage.tags,
        color_palette: updatedImage.color_palette,
        source_url: updatedImage.source_url,
        verified_by: updatedImage.verified_by,
        verified_at: updatedImage.verified_at,
        created_at: updatedImage.created_at,
        updated_at: updatedImage.updated_at,
        created_by: updatedImage.created_by
      },
      message: 'Material image updated successfully',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error updating material image:', error);
    const response: StandardApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update material image',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// DELETE /material-images-api/:id - Delete material image
async function handleDeleteMaterialImage(request: Request, imageId: string): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // Get image details before deletion
    const { data: image, error: fetchError } = await supabase
      .from('material_images')
      .select('storage_path, storage_bucket')
      .eq('id', imageId)
      .single();
    
    if (fetchError) {
      throw new Error(`Failed to fetch image for deletion: ${fetchError.message}`);
    }
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from('material_images')
      .delete()
      .eq('id', imageId);
    
    if (deleteError) {
      throw new Error(`Failed to delete image record: ${deleteError.message}`);
    }
    
    // Delete from storage if it exists
    if (image?.storage_path && image?.storage_bucket) {
      const { error: storageDeleteError } = await supabase.storage
        .from(image.storage_bucket)
        .remove([image.storage_path]);
      
      if (storageDeleteError) {
        console.warn(`Failed to delete image from storage: ${storageDeleteError.message}`);
        // Don't fail the operation if storage deletion fails
      }
    }
    
    const response: StandardApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
      message: 'Material image deleted successfully',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error deleting material image:', error);
    const response: StandardApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete material image',
      metadata: {
        processing_time_ms: Date.now() - startTime
      }
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Extract image ID if present
    const imageId = pathSegments[1];
    
    switch (req.method) {
      case 'GET':
        return await handleGetMaterialImages(req);
      
      case 'POST':
        return await handleUploadMaterialImage(req);
      
      case 'PUT':
        if (!imageId) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Image ID is required for updates'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return await handleUpdateMaterialImage(req, imageId);
      
      case 'DELETE':
        if (!imageId) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Image ID is required for deletion'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return await handleDeleteMaterialImage(req, imageId);
      
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed'
        }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Material Images API error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});