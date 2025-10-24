import React from 'react';
import {
  Shield,
  Sparkles,
  Hammer,
  Thermometer,
  Droplets,
  Beaker,
  Volume2,
  Leaf,
  Ruler,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FunctionalMetadata,
} from '@/types/materials';

interface FunctionalMetadataDisplayProps {
  /** Functional metadata to display */
  functionalMetadata: FunctionalMetadata;
  /** Whether to show a compact view */
  compact?: boolean;
  /** Callback when a specific category is clicked for detailed view */
  onCategoryClick?: (category: string) => void;
}

/**
 * Component for displaying comprehensive functional metadata for materials
 * Organized by the 9 functional metadata categories
 */
export const FunctionalMetadataDisplay: React.FC<FunctionalMetadataDisplayProps> = ({
  functionalMetadata,
  compact = false,
  onCategoryClick,
}) => {
  // Helper function to render safety ratings
  const renderSlipSafetyRatings = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).rValue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">R-Value:</span>
          <Badge variant="outline">{(data as any).rValue}</Badge>
        </div>
      )}
      {(data as any).barefootRampTest && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Barefoot Test:</span>
          <Badge variant="outline">Class {(data as any).barefootRampTest}</Badge>
        </div>
      )}
      {(data as any).dcof && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">DCOF:</span>
          <span className="text-sm font-medium">{(data as any).dcof.toFixed(2)}</span>
        </div>
      )}
      {(data as any).pendulumTestValue && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">PTV:</span>
          {(data as any).pendulumTestValue.wet && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Wet:</span>
              <span className="text-xs">{(data as any).pendulumTestValue.wet}</span>
            </div>
          )}
          {(data as any).pendulumTestValue.dry && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Dry:</span>
              <span className="text-xs">{(data as any).pendulumTestValue.dry}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render surface gloss properties
  const renderSurfaceGloss = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).glossLevel && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Gloss Level:</span>
          <Badge variant="secondary">{(data as any).glossLevel}</Badge>
        </div>
      )}
      {(data as any).glossValue !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Gloss Value:</span>
          <span className="text-sm font-medium">{(data as any).glossValue}%</span>
        </div>
      )}
      {(data as any).lightReflectance !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Light Reflectance:</span>
          <span className="text-sm font-medium">{(data as any).lightReflectance}%</span>
        </div>
      )}
    </div>
  );

  // Helper function to render mechanical properties
  const renderMechanicalProperties = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).mohsHardness && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Mohs Hardness:</span>
          <Badge variant="outline">{(data as any).mohsHardness}/10</Badge>
        </div>
      )}
      {(data as any).peiRating !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">PEI Rating:</span>
          <Badge variant="outline">Class {(data as any).peiRating}</Badge>
        </div>
      )}
      {(data as any).breakingStrength && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Breaking Strength:</span>
          <span className="text-sm font-medium">{(data as any).breakingStrength} N/mm²</span>
        </div>
      )}
      {(data as any).impactResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Impact Resistance:</span>
          <Badge variant="secondary">{(data as any).impactResistance.classification}</Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render thermal properties
  const renderThermalProperties = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).thermalConductivity && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Thermal Conductivity:</span>
          <span className="text-sm font-medium">{(data as any).thermalConductivity} W/m·K</span>
        </div>
      )}
      {(data as any).heatResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Heat Resistance:</span>
          <span className="text-sm font-medium">{(data as any).heatResistance}°C</span>
        </div>
      )}
      {(data as any).radiantHeatingCompatible !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Radiant Heating:</span>
          <Badge variant={(data as any).radiantHeatingCompatible ? 'default' : 'secondary'}>
            {(data as any).radiantHeatingCompatible ? 'Compatible' : 'Not Compatible'}
          </Badge>
        </div>
      )}
      {(data as any).coolRoofRating && (data as any).coolRoofRating.sriValue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cool Roof SRI:</span>
          <span className="text-sm font-medium">{(data as any).coolRoofRating.sriValue}</span>
        </div>
      )}
    </div>
  );

  // Helper function to render water resistance
  const renderWaterResistance = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).waterAbsorption && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Water Absorption:</span>
            <Badge variant="outline">{(data as any).waterAbsorption.classification}</Badge>
          </div>
          {(data as any).waterAbsorption.percentage !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Percentage:</span>
              <span className="text-xs">{(data as any).waterAbsorption.percentage}%</span>
            </div>
          )}
        </div>
      )}
      {(data as any).frostResistance !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Frost Resistance:</span>
          <Badge variant={(data as any).frostResistance ? 'default' : 'secondary'}>
            {(data as any).frostResistance ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
      {(data as any).moldMildewResistant !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Mold/Mildew Resistant:</span>
          <Badge variant={(data as any).moldMildewResistant ? 'default' : 'secondary'}>
            {(data as any).moldMildewResistant ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render chemical resistance
  const renderChemicalResistance = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).chemicalResistance && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Chemical Resistance:</span>
          {(data as any).chemicalResistance.acidResistance && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Acid:</span>
              <Badge variant="outline">{(data as any).chemicalResistance.acidResistance}</Badge>
            </div>
          )}
          {(data as any).chemicalResistance.alkaliResistance && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Alkali:</span>
              <Badge variant="outline">{(data as any).chemicalResistance.alkaliResistance}</Badge>
            </div>
          )}
        </div>
      )}
      {(data as any).stainResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Stain Resistance:</span>
          <Badge variant="outline">Class {(data as any).stainResistance.class}</Badge>
        </div>
      )}
      {(data as any).antimicrobialProperties?.antimicrobialTreatment && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Antimicrobial:</span>
          <Badge variant="default">Yes</Badge>
        </div>
      )}
      {(data as any).foodSafeCertified !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Food Safe:</span>
          <Badge variant={(data as any).foodSafeCertified ? 'default' : 'secondary'}>
            {(data as any).foodSafeCertified ? 'Certified' : 'Not Certified'}
          </Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render acoustic properties
  const renderAcousticProperties = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).acousticProperties && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Acoustic:</span>
          {(data as any).acousticProperties.nrc && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">NRC:</span>
              <span className="text-xs">{(data as any).acousticProperties.nrc}</span>
            </div>
          )}
          {(data as any).acousticProperties.decibelReduction && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">dB Reduction:</span>
              <span className="text-xs">{(data as any).acousticProperties.decibelReduction} dB</span>
            </div>
          )}
        </div>
      )}
      {(data as any).impactInsulationClass && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">IIC:</span>
          <span className="text-sm font-medium">{(data as any).impactInsulationClass}</span>
        </div>
      )}
      {(data as any).electricalProperties && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Electrical:</span>
          {(data as any).electricalProperties.antiStatic !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Anti-static:</span>
              <Badge variant={(data as any).electricalProperties.antiStatic ? 'default' : 'secondary'}>
                {(data as any).electricalProperties.antiStatic ? 'Yes' : 'No'}
              </Badge>
            </div>
          )}
          {(data as any).electricalProperties.conductive !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Conductive:</span>
              <Badge variant={(data as any).electricalProperties.conductive ? 'default' : 'secondary'}>
                {(data as any).electricalProperties.conductive ? 'Yes' : 'No'}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render environmental properties
  const renderEnvironmentalProperties = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).vocEmissionRating && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">VOC Emissions:</span>
          {(data as any).vocEmissionRating.greenguard && (data as any).vocEmissionRating.greenguard !== 'none' && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Greenguard:</span>
              <Badge variant="default">{(data as any).vocEmissionRating.greenguard}</Badge>
            </div>
          )}
          {(data as any).vocEmissionRating.floorScore && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">FloorScore:</span>
              <Badge variant="default">Certified</Badge>
            </div>
          )}
        </div>
      )}
      {(data as any).recycledContent && (data as any).recycledContent.total && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Recycled Content:</span>
          <span className="text-sm font-medium">{(data as any).recycledContent.total}%</span>
        </div>
      )}
      {(data as any).ecoLabels && (
        <div className="space-y-1">
          {(data as any).ecoLabels.leedCredits && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">LEED Credits:</span>
              <Badge variant="default">{(data as any).ecoLabels.leedCredits}</Badge>
            </div>
          )}
          {(data as any).ecoLabels.breeamCredits && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">BREEAM Credits:</span>
              <Badge variant="default">{(data as any).ecoLabels.breeamCredits}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render dimensional properties
  const renderDimensionalProperties = (data: unknown) => (
    <div className="space-y-2">
      {(data as any).edgeProperties?.rectifiedEdges !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Rectified Edges:</span>
          <Badge variant={(data as any).edgeProperties.rectifiedEdges ? 'default' : 'secondary'}>
            {(data as any).edgeProperties.rectifiedEdges ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
      {(data as any).colorProperties?.shadeVariation && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Shade Variation:</span>
          <Badge variant="outline">{(data as any).colorProperties.shadeVariation}</Badge>
        </div>
      )}
      {(data as any).textureProperties?.textureRating && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Texture Rating:</span>
          <span className="text-sm font-medium">{(data as any).textureProperties.textureRating}/10</span>
        </div>
      )}
      {(data as any).specialProperties?.translucent !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Translucent:</span>
          <Badge variant={(data as any).specialProperties.translucent ? 'default' : 'secondary'}>
            {(data as any).specialProperties.translucent ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
    </div>
  );

  // Category configuration with icons and rendering functions
  const categories = [
    {
      key: 'slipSafetyRatings',
      title: 'Slip & Safety',
      icon: Shield,
      data: functionalMetadata.slipSafetyRatings,
      renderFn: renderSlipSafetyRatings,
      color: 'text-red-600',
    },
    {
      key: 'surfaceGlossReflectivity',
      title: 'Surface & Gloss',
      icon: Sparkles,
      data: functionalMetadata.surfaceGlossReflectivity,
      renderFn: renderSurfaceGloss,
      color: 'text-purple-600',
    },
    {
      key: 'mechanicalPropertiesExtended',
      title: 'Mechanical',
      icon: Hammer,
      data: functionalMetadata.mechanicalPropertiesExtended,
      renderFn: renderMechanicalProperties,
      color: 'text-gray-600',
    },
    {
      key: 'thermalProperties',
      title: 'Thermal',
      icon: Thermometer,
      data: functionalMetadata.thermalProperties,
      renderFn: renderThermalProperties,
      color: 'text-orange-600',
    },
    {
      key: 'waterMoistureResistance',
      title: 'Water & Moisture',
      icon: Droplets,
      data: functionalMetadata.waterMoistureResistance,
      renderFn: renderWaterResistance,
      color: 'text-blue-600',
    },
    {
      key: 'chemicalHygieneResistance',
      title: 'Chemical & Hygiene',
      icon: Beaker,
      data: functionalMetadata.chemicalHygieneResistance,
      renderFn: renderChemicalResistance,
      color: 'text-green-600',
    },
    {
      key: 'acousticElectricalProperties',
      title: 'Acoustic & Electrical',
      icon: Volume2,
      data: functionalMetadata.acousticElectricalProperties,
      renderFn: renderAcousticProperties,
      color: 'text-indigo-600',
    },
    {
      key: 'environmentalSustainability',
      title: 'Environmental',
      icon: Leaf,
      data: functionalMetadata.environmentalSustainability,
      renderFn: renderEnvironmentalProperties,
      color: 'text-emerald-600',
    },
    {
      key: 'dimensionalAesthetic',
      title: 'Dimensional & Aesthetic',
      icon: Ruler,
      data: functionalMetadata.dimensionalAesthetic,
      renderFn: renderDimensionalProperties,
      color: 'text-pink-600',
    },
  ];

  // Filter out categories without data
  const categoriesWithData = categories.filter(category => category.data);

  if (categoriesWithData.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground text-center">
            No functional metadata available
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {categoriesWithData.map((category) => {
          const IconComponent = category.icon;
          return (
            <div
              key={category.key}
              className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onCategoryClick?.(category.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onCategoryClick?.(category.key);
                }
              }}
            >
              <IconComponent className={`h-4 w-4 ${category.color}`} />
              <span className="text-sm font-medium">{category.title}</span>
              <Badge variant="outline" className="ml-auto">
                Available
              </Badge>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Functional Properties</h3>
        {functionalMetadata.functionalMetadataSource && (
          <Badge variant="outline">
            Source: {functionalMetadata.functionalMetadataSource.replace('_', ' ')}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoriesWithData.map((category) => {
          const IconComponent = category.icon;
          return (
            <Card
              key={category.key}
              className={`cursor-pointer hover:shadow-md transition-shadow ${
                onCategoryClick ? 'hover:bg-muted/20' : ''
              }`}
              onClick={() => onCategoryClick?.(category.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onCategoryClick?.(category.key);
                }
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IconComponent className={`h-4 w-4 ${category.color}`} />
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {category.renderFn(category.data)}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {functionalMetadata.functionalMetadataUpdatedAt && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(functionalMetadata.functionalMetadataUpdatedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

export default FunctionalMetadataDisplay;
