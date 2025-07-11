// Mock material database
import { Material, MaterialCategory } from '@/types/materials';

export const mockMaterials: Material[] = [
  {
    id: 'mat-001',
    name: 'Carrara White Marble',
    category: MaterialCategory.STONE,
    description: 'Premium Italian marble with distinctive gray veining. Perfect for luxury countertops and flooring.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'white',
      finish: 'polished',
      size: '12x24 inches',
      brand: 'Marble Masters',
      properties: {
        diffuse: '#F8F8FF',
        roughness: 0.1,
        metallic: 0.0,
        specular: '#FFFFFF'
      }
    },
    vectorEmbedding: [0.1, 0.2, 0.3], // Simplified vector
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: 'mat-002', 
    name: 'American Oak Hardwood',
    category: MaterialCategory.WOOD,
    description: 'Classic oak hardwood with natural grain patterns. Durable and timeless for flooring and furniture.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'brown',
      finish: 'natural',
      size: '5x3/4 inches',
      brand: 'Forest Pride',
      properties: {
        diffuse: '#DEB887',
        roughness: 0.6,
        metallic: 0.0
      }
    },
    vectorEmbedding: [0.4, 0.5, 0.6],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10')
  },
  {
    id: 'mat-003',
    name: 'Brushed Stainless Steel',
    category: MaterialCategory.METAL,
    description: 'Industrial-grade stainless steel with brushed finish. Corrosion-resistant and modern aesthetic.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'silver',
      finish: 'brushed',
      size: '4x8 feet',
      brand: 'SteelCraft Pro',
      properties: {
        diffuse: '#C0C0C0',
        roughness: 0.3,
        metallic: 0.9,
        specular: '#FFFFFF'
      }
    },
    vectorEmbedding: [0.7, 0.8, 0.9],
    createdAt: new Date('2024-01-08'),
    updatedAt: new Date('2024-01-08')
  },
  {
    id: 'mat-004',
    name: 'Subway Tile White',
    category: MaterialCategory.CERAMIC,
    description: 'Classic white subway tiles with beveled edges. Perfect for kitchen backsplashes and bathroom walls.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'white',
      finish: 'glossy',
      size: '3x6 inches',
      brand: 'CeramicArt',
      properties: {
        diffuse: '#FFFFFF',
        roughness: 0.1,
        metallic: 0.0
      }
    },
    vectorEmbedding: [0.2, 0.3, 0.4],
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05')
  },
  {
    id: 'mat-005',
    name: 'Polished Concrete',
    category: MaterialCategory.CONCRETE,
    description: 'Modern polished concrete with smooth finish. Industrial chic for floors and countertops.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'gray',
      finish: 'polished',
      size: 'custom',
      brand: 'Urban Concrete',
      properties: {
        diffuse: '#808080',
        roughness: 0.2,
        metallic: 0.0
      }
    },
    vectorEmbedding: [0.5, 0.6, 0.7],
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03')
  },
  {
    id: 'mat-006',
    name: 'Linen Canvas Fabric',
    category: MaterialCategory.FABRIC,
    description: 'Natural linen fabric with soft texture. Perfect for upholstery and window treatments.',
    imageUrl: '/placeholder.svg',
    metadata: {
      color: 'beige',
      finish: 'natural',
      size: '54 inches wide',
      brand: 'Textile House',
      properties: {
        diffuse: '#F5F5DC',
        roughness: 0.8,
        metallic: 0.0
      }
    },
    vectorEmbedding: [0.3, 0.4, 0.5],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }
];

// Mock API functions
export const materialCatalogAPI = {
  getAllMaterials: async (): Promise<Material[]> => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    return mockMaterials;
  },

  getMaterialsByCategory: async (category: MaterialCategory): Promise<Material[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockMaterials.filter(material => material.category === category);
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
  },

  addMaterial: async (material: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>): Promise<Material> => {
    await new Promise(resolve => setTimeout(resolve, 600));
    const newMaterial: Material = {
      ...material,
      id: `mat-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockMaterials.push(newMaterial);
    return newMaterial;
  },

  updateMaterial: async (id: string, updates: Partial<Material>): Promise<Material | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const materialIndex = mockMaterials.findIndex(m => m.id === id);
    if (materialIndex === -1) return null;
    
    mockMaterials[materialIndex] = {
      ...mockMaterials[materialIndex],
      ...updates,
      updatedAt: new Date()
    };
    return mockMaterials[materialIndex];
  },

  deleteMaterial: async (id: string): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const materialIndex = mockMaterials.findIndex(m => m.id === id);
    if (materialIndex === -1) return false;
    
    mockMaterials.splice(materialIndex, 1);
    return true;
  }
};