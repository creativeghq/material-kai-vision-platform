import { supabase } from '@/integrations/supabase/client';
import { Material } from '@/types/materials';
import type { Database } from '@/integrations/supabase/types';

type DatabaseMaterial = Database['public']['Tables']['materials_catalog']['Row'];

const transformDatabaseMaterial = (dbMaterial: DatabaseMaterial): Material => ({
  id: dbMaterial.id,
  name: dbMaterial.name,
  category: dbMaterial.category,
  description: dbMaterial.description || '',
  thumbnail_url: dbMaterial.thumbnail_url,
  properties: dbMaterial.properties as any || {},
  metadata: {
    brand: '',
    color: '',
    finish: '',
    size: '',
    properties: {}
  },
  standards: dbMaterial.standards || [],
  chemical_composition: dbMaterial.chemical_composition as any || {},
  safety_data: dbMaterial.safety_data as any || {},
  embedding: dbMaterial.embedding ? JSON.parse(dbMaterial.embedding) : [],
  created_by: dbMaterial.created_by,
  created_at: dbMaterial.created_at || '',
  updated_at: dbMaterial.updated_at || '',
  createdAt: new Date(dbMaterial.created_at || ''),
  updatedAt: new Date(dbMaterial.updated_at || '')
});

export const realMaterialCatalogAPI = {
  getAllMaterials: async (): Promise<Material[]> => {
    const { data, error } = await supabase
      .from('materials_catalog')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(transformDatabaseMaterial);
  },

  getMaterialsByCategory: async (category: string): Promise<Material[]> => {
    let query = supabase
      .from('materials_catalog')
      .select('*')
      .order('created_at', { ascending: false });

    if (category !== 'all') {
      query = query.eq('category', category as any);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(transformDatabaseMaterial);
  },

  searchMaterials: async (query: string): Promise<Material[]> => {
    const { data, error } = await supabase
      .from('materials_catalog')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(transformDatabaseMaterial);
  },

  getMaterialById: async (id: string): Promise<Material | null> => {
    const { data, error } = await supabase
      .from('materials_catalog')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? transformDatabaseMaterial(data) : null;
  },

  deleteMaterial: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('materials_catalog')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  updateMaterial: async (id: string, updates: Partial<Material>): Promise<Material | null> => {
    const dbUpdates: any = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    if (updates.embedding) {
      dbUpdates.embedding = JSON.stringify(updates.embedding);
    }

    const { data, error } = await supabase
      .from('materials_catalog')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data ? transformDatabaseMaterial(data) : null;
  },

  createMaterial: async (materialData: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>): Promise<Material> => {
    const dbMaterial: any = {
      name: materialData.name,
      category: materialData.category,
      description: materialData.description,
      thumbnail_url: materialData.thumbnail_url,
      properties: materialData.properties,
      standards: materialData.standards,
      chemical_composition: materialData.chemical_composition,
      safety_data: materialData.safety_data,
      created_by: materialData.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (materialData.embedding) {
      dbMaterial.embedding = JSON.stringify(materialData.embedding);
    }

    const { data, error } = await supabase
      .from('materials_catalog')
      .insert([dbMaterial])
      .select()
      .single();

    if (error) throw error;
    return transformDatabaseMaterial(data);
  }
};