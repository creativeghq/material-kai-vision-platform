import React from 'react';
import { Material } from '@/types/materials';
import { MaterialCatalogListing } from './MaterialCatalogListing';
import { MaterialValidation } from '@/utils/materialValidation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

/**
 * Sample materials data that demonstrates the full type system with extracted meta fields
 */
const sampleMaterials: Material[] = [
  {
    id: 'mat-001',
    name: 'Premium Carrara Marble Tile',
    category: 'MARBLE',
    description: 'High-quality Carrara marble with natural veining, perfect for luxury applications. Extracted from Italian quarries with excellent durability and aesthetic appeal.',
    properties: {
      density: 2.7,
      thermalConductivity: 2.9,
      flexuralModulus: 15.0,
    },
    standards: ['ASTM C503', 'EN 12058', 'ISO 10545'],
    createdAt: '2025-09-01T10:00:00Z',
    updatedAt: '2025-09-03T15:30:00Z',
    metadata: {
      finish: 'polished',
      size: '24x24"',
      installationMethod: 'thinset mortar',
      application: 'countertop',
      brand: 'Venetian Stone Co.',
      additionalProperties: {
        extractionMethod: 'gpt-4o-vision',
        extractionConfidence: 0.92,
        modelVersion: 'gpt-4o-2024-05-13',
        r11: 'R11-2.5',
      },
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400',
  },
  {
    id: 'mat-002',
    name: 'Industrial Grade Porcelain Tile',
    category: 'PORCELAIN',
    description: 'Heavy-duty porcelain tile designed for commercial and industrial applications. Excellent resistance to chemicals and high traffic.',
    properties: {
      density: 2.4,
      thermalConductivity: 1.3,
      yieldStrength: 45,
      tensileStrength: 60,
    },
    standards: ['ASTM C648', 'EN 14411', 'ISO 13006'],
    createdAt: '2025-09-02T14:20:00Z',
    updatedAt: '2025-09-03T16:45:00Z',
    metadata: {
      finish: 'matte',
      size: '30x30"',
      installationMethod: 'epoxy adhesive',
      application: 'commercial',
      brand: 'TechCeramics',
      additionalProperties: {
        extractionMethod: 'hybrid-analysis',
        extractionConfidence: 0.89,
        peiRating: 'PEI-5',
        frostResistant: true,
      },
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
  },
  {
    id: 'mat-003',
    name: 'Brushed Stainless Steel Panel',
    category: 'METAL',
    description: 'Grade 316 stainless steel with brushed finish, suitable for kitchen backsplashes and accent walls.',
    properties: {
      density: 8.0,
      thermalConductivity: 16.2,
      yieldStrength: 310,
      tensileStrength: 620,
    },
    standards: ['ASTM A240', 'EN 10088-2', 'JIS G4305'],
    createdAt: '2025-09-01T08:30:00Z',
    updatedAt: '2025-09-03T12:15:00Z',
    metadata: {
      finish: 'brushed',
      size: '12x12"',
      installationMethod: 'mechanical fasteners',
      application: 'backsplash',
      brand: 'MetalWorks Pro',
      additionalProperties: {
        extractionMethod: 'spectral-analysis',
        extractionConfidence: 0.95,
        metalTypesCount: 2,
        primaryMetal: 'stainless-steel',
        gradeType: '316-grade',
        corrosionResistance: 'excellent',
      },
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1558618047-3c8d8c7c1b92?w=400',
  },
  {
    id: 'mat-004',
    name: 'Natural Oak Wood Planks',
    category: 'WOOD',
    description: 'Solid white oak hardwood flooring with natural grain patterns. Sustainably harvested and kiln-dried.',
    properties: {
      density: 0.75,
      thermalConductivity: 0.17,
      flexuralModulus: 12.0,
    },
    standards: ['NWFA', 'ASTM D2394', 'EN 13489'],
    createdAt: '2025-08-30T16:45:00Z',
    updatedAt: '2025-09-03T11:20:00Z',
    metadata: {
      finish: 'natural',
      size: '18x18"',
      installationMethod: 'nail down',
      application: 'floor',
      brand: 'Forest Prime',
      additionalProperties: {
        extractionMethod: 'visual-analysis',
        extractionConfidence: 0.87,
        grainPattern: 'cathedral',
        moistureContent: '6-8%',
        jankahardness: 1360,
      },
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=400',
  },
  {
    id: 'mat-005',
    name: 'Recycled Glass Mosaic',
    category: 'RECYCLED_GLASS',
    description: 'Eco-friendly mosaic tiles made from 100% recycled glass. Available in various color combinations with excellent light reflection properties.',
    properties: {
      density: 2.5,
      thermalConductivity: 1.0,
    },
    standards: ['LEED Certified', 'Green Building Standard'],
    createdAt: '2025-09-01T13:15:00Z',
    updatedAt: '2025-09-03T14:30:00Z',
    metadata: {
      finish: 'polished',
      size: 'sheets',
      installationMethod: 'thinset mortar',
      application: 'wall',
      brand: 'EcoGlass',
      additionalProperties: {
        extractionMethod: 'chemical-analysis',
        extractionConfidence: 0.83,
        recycledContent: '100%',
        colorVariationsCount: 3,
        primaryColors: 'azure, emerald, amber',
        lightTransmission: 'high',
      },
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400',
  },
];

/**
 * Demo component that showcases the MaterialCatalogListing with validation
 */
export const MaterialCatalogDemo: React.FC = () => {
  // Validate sample materials
  const validationResults = MaterialValidation.validateMaterialBatch(sampleMaterials);

  const handleMaterialSelect = (material: Material) => {
    console.log('Material selected:', material);
    // In a real app, this would navigate to material details or add to cart/project
  };

  const handleMaterialEdit = (material: Material) => {
    console.log('Edit material:', material);
    // In a real app, this would open an edit modal or navigate to edit page
  };

  return (
    <div className="space-y-6 p-6">
      {/* Demo Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Material Catalog Demo</h1>
        <p className="text-muted-foreground">
          Demonstrating the full material catalog system with AI-extracted meta fields, 
          validation, filtering, and search capabilities.
        </p>
      </div>

      {/* Validation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Sample Data Validation Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{validationResults.summary.valid}</div>
              <div className="text-sm text-muted-foreground">Valid Materials</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{validationResults.summary.invalid}</div>
              <div className="text-sm text-muted-foreground">Invalid Materials</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{validationResults.summary.withWarnings}</div>
              <div className="text-sm text-muted-foreground">With Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{validationResults.summary.total}</div>
              <div className="text-sm text-muted-foreground">Total Materials</div>
            </div>
          </div>

          {/* Validation Issues */}
          {validationResults.overall.errors.length > 0 && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Validation Errors Found:</strong>
                <ul className="mt-2 space-y-1">
                  {validationResults.overall.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx} className="text-sm">
                      • {error.field}: {error.message}
                    </li>
                  ))}
                  {validationResults.overall.errors.length > 5 && (
                    <li className="text-sm text-muted-foreground">
                      ...and {validationResults.overall.errors.length - 5} more
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validationResults.overall.warnings.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Validation Warnings:</strong>
                <ul className="mt-2 space-y-1">
                  {validationResults.overall.warnings.slice(0, 3).map((warning, idx) => (
                    <li key={idx} className="text-sm">
                      • {warning.field}: {warning.message}
                    </li>
                  ))}
                  {validationResults.overall.warnings.length > 3 && (
                    <li className="text-sm text-muted-foreground">
                      ...and {validationResults.overall.warnings.length - 3} more
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validationResults.overall.errors.length === 0 && validationResults.overall.warnings.length === 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All sample materials passed validation successfully! 
                The type system and validation utilities are working correctly.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sample Material Features */}
      <Card>
        <CardHeader>
          <CardTitle>Featured Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">✨ AI-Extracted Meta Fields</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>• Finish types (polished, matte, brushed)</div>
                <div>• Size specifications (12x12&quot;, 24x24&quot;, etc.)</div>
                <div>• Installation methods (thinset, epoxy, fasteners)</div>
                <div>• Application areas (floor, wall, countertop)</div>
                <div>• R11 thermal ratings</div>
                <div>• Metal type classifications</div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">🔍 Advanced Filtering</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>• Search by name, description, standards</div>
                <div>• Filter by 50+ material categories</div>
                <div>• Filter by finish, size, installation</div>
                <div>• Filter by application areas</div>
                <div>• Multi-criteria filtering</div>
                <div>• Real-time filter updates</div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">📊 Data Quality</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>• Real-time validation</div>
                <div>• Category-specific constraints</div>
                <div>• Property range validation</div>
                <div>• Extraction confidence tracking</div>
                <div>• Data completeness assessment</div>
                <div>• Normalization and sanitization</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Material Catalog Listing */}
      <MaterialCatalogListing
        materials={sampleMaterials}
        loading={false}
        onMaterialSelect={handleMaterialSelect}
        onMaterialEdit={handleMaterialEdit}
        showImages={true}
        showMetaFields={true}
        allowFiltering={true}
        allowSorting={true}
        viewMode="grid"
      />

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">Material Type System</span>
              <Badge className="bg-green-100 text-green-800">Complete</Badge>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">AI Extraction Meta Fields</span>
              <Badge className="bg-green-100 text-green-800">Complete</Badge>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">React Frontend Components</span>
              <Badge className="bg-green-100 text-green-800">Complete</Badge>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">Validation System</span>
              <Badge className="bg-green-100 text-green-800">Complete</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              <span className="font-medium">Database Schema Updates</span>
              <Badge className="bg-blue-100 text-blue-800">Pending - Database Team</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              <span className="font-medium">Enhanced AI Extraction</span>
              <Badge className="bg-blue-100 text-blue-800">Pending - ML Team</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Filter Materials</h4>
            <p className="text-sm text-muted-foreground">
              Click the &quot;Filters&quot; button to access advanced filtering options.
              Filter by category, finish, size, installation method, and application area.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">2. Search Materials</h4>
            <p className="text-sm text-muted-foreground">
              Use the search field to find materials by name, description, or standards. 
              The search is intelligent and searches across all material properties.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">3. View Details</h4>
            <p className="text-sm text-muted-foreground">
              Click the info (i) button on any material card to expand and see detailed 
              properties, meta fields, physical characteristics, and standards.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">4. Switch View Modes</h4>
            <p className="text-sm text-muted-foreground">
              Toggle between grid and list view modes using the view controls. 
              Grid mode shows more materials at once, list mode shows more details.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaterialCatalogDemo;