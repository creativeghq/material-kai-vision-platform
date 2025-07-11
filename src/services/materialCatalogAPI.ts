import { Material, MaterialCategories } from '@/types/materials';

// Mock data for demonstration
export const mockMaterials: Material[] = [
  {
    id: '1',
    name: 'Italian Carrara Marble',
    category: 'concrete' as const,
    description: 'Premium white marble with subtle gray veining',
    imageUrl: 'https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?w=400',
    metadata: {
      color: 'white',
      finish: 'polished',
      brand: 'Carrara Co.',
      properties: {
        hardness: 3,
        density: 2.7
      }
    },
    properties: {
      hardness: 3,
      density: 2.7
    },
    chemical_composition: { CaCO3: 95 },
    safety_data: {},
    standards: ['ASTM C503'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '2',
    name: 'American White Oak',
    category: 'wood' as const,
    description: 'High-quality hardwood with distinctive grain patterns',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    metadata: {
      color: 'light brown',
      finish: 'natural',
      brand: 'Forest Pride',
      properties: {
        hardness: 7,
        grain: 'straight'
      }
    },
    properties: {
      hardness: 7,
      density: 0.75
    },
    chemical_composition: { cellulose: 45, lignin: 25 },
    safety_data: {},
    standards: ['ASTM D143'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '3',
    name: 'Brushed Aluminum',
    category: 'metals' as const,
    description: 'Lightweight metal with brushed finish for modern applications',
    imageUrl: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400',
    metadata: {
      color: 'silver',
      finish: 'brushed',
      brand: 'MetalWorks',
      properties: {
        hardness: 5,
        corrosionResistance: 'excellent'
      }
    },
    properties: {
      density: 2.7,
      thermal_conductivity: 205
    },
    chemical_composition: { Al: 99 },
    safety_data: {},
    standards: ['ASTM B221'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '4',
    name: 'Porcelain Tile',
    category: 'ceramics' as const,
    description: 'Durable ceramic tile with matte finish',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    metadata: {
      color: 'gray',
      finish: 'matte',
      brand: 'CeramicCorp',
      properties: {
        waterAbsorption: 'low',
        frostResistance: 'high'
      }
    },
    properties: {
      hardness: 6,
      water_absorption: 0.5
    },
    chemical_composition: { SiO2: 50, Al2O3: 20 },
    safety_data: {},
    standards: ['ISO 13006'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '5',
    name: 'Linen Fabric',
    category: 'textiles' as const,
    description: 'Natural fiber fabric with organic texture',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    metadata: {
      color: 'beige',
      finish: 'natural',
      brand: 'Natural Textiles',
      properties: {
        weave: 'plain',
        weight: 'medium'
      }
    },
    properties: {
      thread_count: 150,
      weight: 180
    },
    chemical_composition: { cellulose: 70 },
    safety_data: {},
    standards: ['ASTM D3775'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '6',
    name: 'Acrylic Plastic',
    category: 'plastics' as const,
    description: 'Clear, lightweight plastic with excellent optical clarity',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    metadata: {
      color: 'clear',
      finish: 'glossy',
      brand: 'PlasticTech',
      properties: {
        transparency: 'high',
        flexibility: 'medium'
      }
    },
    properties: {
      density: 1.18,
      melting_point: 160
    },
    chemical_composition: { PMMA: 100 },
    safety_data: {},
    standards: ['ASTM D792'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// API functions
export const materialCatalogAPI = {
  getAllMaterials: async (): Promise<Material[]> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockMaterials;
  },

  getMaterialsByCategory: async (category: string): Promise<Material[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockMaterials.filter(material => 
      category === 'all' || material.category === category
    );
  },

  searchMaterials: async (query: string): Promise<Material[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const lowercaseQuery = query.toLowerCase();
    return mockMaterials.filter(material => 
      material.name.toLowerCase().includes(lowercaseQuery) ||
      material.description?.toLowerCase().includes(lowercaseQuery) ||
      material.metadata.brand?.toLowerCase().includes(lowercaseQuery) ||
      material.metadata.color?.toLowerCase().includes(lowercaseQuery)
    );
  },

  getMaterialById: async (id: string): Promise<Material | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return mockMaterials.find(material => material.id === id) || null;
  }
};