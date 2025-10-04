import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Sparkles,
  Hammer,
  Thermometer,
  Droplets,
  Beaker,
  Volume2,
  Leaf,
  Ruler
} from 'lucide-react';
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
  const renderSlipSafetyRatings = (data: any) => (
    <div className="space-y-2">
      {data.rValue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">R-Value:</span>
          <Badge variant="outline">{data.rValue}</Badge>
        </div>
      )}
      {data.barefootRampTest && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Barefoot Test:</span>
          <Badge variant="outline">Class {data.barefootRampTest}</Badge>
        </div>
      )}
      {data.dcof && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">DCOF:</span>
          <span className="text-sm font-medium">{data.dcof.toFixed(2)}</span>
        </div>
      )}
      {data.pendulumTestValue && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">PTV:</span>
          {data.pendulumTestValue.wet && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Wet:</span>
              <span className="text-xs">{data.pendulumTestValue.wet}</span>
            </div>
          )}
          {data.pendulumTestValue.dry && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Dry:</span>
              <span className="text-xs">{data.pendulumTestValue.dry}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render surface gloss properties
  const renderSurfaceGloss = (data: any) => (
    <div className="space-y-2">
      {data.glossLevel && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Gloss Level:</span>
          <Badge variant="secondary">{data.glossLevel}</Badge>
        </div>
      )}
      {data.glossValue !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Gloss Value:</span>
          <span className="text-sm font-medium">{data.glossValue}%</span>
        </div>
      )}
      {data.lightReflectance !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Light Reflectance:</span>
          <span className="text-sm font-medium">{data.lightReflectance}%</span>
        </div>
      )}
    </div>
  );

  // Helper function to render mechanical properties
  const renderMechanicalProperties = (data: any) => (
    <div className="space-y-2">
      {data.mohsHardness && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Mohs Hardness:</span>
          <Badge variant="outline">{data.mohsHardness}/10</Badge>
        </div>
      )}
      {data.peiRating !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">PEI Rating:</span>
          <Badge variant="outline">Class {data.peiRating}</Badge>
        </div>
      )}
      {data.breakingStrength && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Breaking Strength:</span>
          <span className="text-sm font-medium">{data.breakingStrength} N/mm²</span>
        </div>
      )}
      {data.impactResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Impact Resistance:</span>
          <Badge variant="secondary">{data.impactResistance.classification}</Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render thermal properties
  const renderThermalProperties = (data: any) => (
    <div className="space-y-2">
      {data.thermalConductivity && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Thermal Conductivity:</span>
          <span className="text-sm font-medium">{data.thermalConductivity} W/m·K</span>
        </div>
      )}
      {data.heatResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Heat Resistance:</span>
          <span className="text-sm font-medium">{data.heatResistance}°C</span>
        </div>
      )}
      {data.radiantHeatingCompatible !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Radiant Heating:</span>
          <Badge variant={data.radiantHeatingCompatible ? "default" : "secondary"}>
            {data.radiantHeatingCompatible ? 'Compatible' : 'Not Compatible'}
          </Badge>
        </div>
      )}
      {data.coolRoofRating && data.coolRoofRating.sriValue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cool Roof SRI:</span>
          <span className="text-sm font-medium">{data.coolRoofRating.sriValue}</span>
        </div>
      )}
    </div>
  );

  // Helper function to render water resistance
  const renderWaterResistance = (data: any) => (
    <div className="space-y-2">
      {data.waterAbsorption && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Water Absorption:</span>
            <Badge variant="outline">{data.waterAbsorption.classification}</Badge>
          </div>
          {data.waterAbsorption.percentage !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Percentage:</span>
              <span className="text-xs">{data.waterAbsorption.percentage}%</span>
            </div>
          )}
        </div>
      )}
      {data.frostResistance !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Frost Resistance:</span>
          <Badge variant={data.frostResistance ? "default" : "secondary"}>
            {data.frostResistance ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
      {data.moldMildewResistant !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Mold/Mildew Resistant:</span>
          <Badge variant={data.moldMildewResistant ? "default" : "secondary"}>
            {data.moldMildewResistant ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render chemical resistance
  const renderChemicalResistance = (data: any) => (
    <div className="space-y-2">
      {data.chemicalResistance && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Chemical Resistance:</span>
          {data.chemicalResistance.acidResistance && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Acid:</span>
              <Badge variant="outline">{data.chemicalResistance.acidResistance}</Badge>
            </div>
          )}
          {data.chemicalResistance.alkaliResistance && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Alkali:</span>
              <Badge variant="outline">{data.chemicalResistance.alkaliResistance}</Badge>
            </div>
          )}
        </div>
      )}
      {data.stainResistance && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Stain Resistance:</span>
          <Badge variant="outline">Class {data.stainResistance.class}</Badge>
        </div>
      )}
      {data.antimicrobialProperties?.antimicrobialTreatment && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Antimicrobial:</span>
          <Badge variant="default">Yes</Badge>
        </div>
      )}
      {data.foodSafeCertified !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Food Safe:</span>
          <Badge variant={data.foodSafeCertified ? "default" : "secondary"}>
            {data.foodSafeCertified ? 'Certified' : 'Not Certified'}
          </Badge>
        </div>
      )}
    </div>
  );

  // Helper function to render acoustic properties
  const renderAcousticProperties = (data: any) => (
    <div className="space-y-2">
      {data.acousticProperties && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Acoustic:</span>
          {data.acousticProperties.nrc && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">NRC:</span>
              <span className="text-xs">{data.acousticProperties.nrc}</span>
            </div>
          )}
          {data.acousticProperties.decibelReduction && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">dB Reduction:</span>
              <span className="text-xs">{data.acousticProperties.decibelReduction} dB</span>
            </div>
          )}
        </div>
      )}
      {data.impactInsulationClass && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">IIC:</span>
          <span className="text-sm font-medium">{data.impactInsulationClass}</span>
        </div>
      )}
      {data.electricalProperties && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Electrical:</span>
          {data.electricalProperties.antiStatic !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Anti-static:</span>
              <Badge variant={data.electricalProperties.antiStatic ? "default" : "secondary"}>
                {data.electricalProperties.antiStatic ? 'Yes' : 'No'}
              </Badge>
            </div>
          )}
          {data.electricalProperties.conductive !== undefined && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Conductive:</span>
              <Badge variant={data.electricalProperties.conductive ? "default" : "secondary"}>
                {data.electricalProperties.conductive ? 'Yes' : 'No'}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render environmental properties
  const renderEnvironmentalProperties = (data: any) => (
    <div className="space-y-2">
      {data.vocEmissionRating && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">VOC Emissions:</span>
          {data.vocEmissionRating.greenguard && data.vocEmissionRating.greenguard !== 'none' && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">Greenguard:</span>
              <Badge variant="default">{data.vocEmissionRating.greenguard}</Badge>
            </div>
          )}
          {data.vocEmissionRating.floorScore && (
            <div className="flex items-center justify-between ml-2">
              <span className="text-xs text-muted-foreground">FloorScore:</span>
              <Badge variant="default">Certified</Badge>
            </div>
          )}
        </div>
      )}
      {data.recycledContent && data.recycledContent.total && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Recycled Content:</span>
          <span className="text-sm font-medium">{data.recycledContent.total}%</span>
        </div>
      )}
      {data.ecoLabels && (
        <div className="space-y-1">
          {data.ecoLabels.leedCredits && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">LEED Credits:</span>
              <Badge variant="default">{data.ecoLabels.leedCredits}</Badge>
            </div>
          )}
          {data.ecoLabels.breeamCredits && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">BREEAM Credits:</span>
              <Badge variant="default">{data.ecoLabels.breeamCredits}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Helper function to render dimensional properties
  const renderDimensionalProperties = (data: any) => (
    <div className="space-y-2">
      {data.edgeProperties?.rectifiedEdges !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Rectified Edges:</span>
          <Badge variant={data.edgeProperties.rectifiedEdges ? "default" : "secondary"}>
            {data.edgeProperties.rectifiedEdges ? 'Yes' : 'No'}
          </Badge>
        </div>
      )}
      {data.colorProperties?.shadeVariation && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Shade Variation:</span>
          <Badge variant="outline">{data.colorProperties.shadeVariation}</Badge>
        </div>
      )}
      {data.textureProperties?.textureRating && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Texture Rating:</span>
          <span className="text-sm font-medium">{data.textureProperties.textureRating}/10</span>
        </div>
      )}
      {data.specialProperties?.translucent !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Translucent:</span>
          <Badge variant={data.specialProperties.translucent ? "default" : "secondary"}>
            {data.specialProperties.translucent ? 'Yes' : 'No'}
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
      color: 'text-red-600'
    },
    {
      key: 'surfaceGlossReflectivity',
      title: 'Surface & Gloss',
      icon: Sparkles,
      data: functionalMetadata.surfaceGlossReflectivity,
      renderFn: renderSurfaceGloss,
      color: 'text-purple-600'
    },
    {
      key: 'mechanicalPropertiesExtended',
      title: 'Mechanical',
      icon: Hammer,
      data: functionalMetadata.mechanicalPropertiesExtended,
      renderFn: renderMechanicalProperties,
      color: 'text-gray-600'
    },
    {
      key: 'thermalProperties',
      title: 'Thermal',
      icon: Thermometer,
      data: functionalMetadata.thermalProperties,
      renderFn: renderThermalProperties,
      color: 'text-orange-600'
    },
    {
      key: 'waterMoistureResistance',
      title: 'Water & Moisture',
      icon: Droplets,
      data: functionalMetadata.waterMoistureResistance,
      renderFn: renderWaterResistance,
      color: 'text-blue-600'
    },
    {
      key: 'chemicalHygieneResistance',
      title: 'Chemical & Hygiene',
      icon: Beaker,
      data: functionalMetadata.chemicalHygieneResistance,
      renderFn: renderChemicalResistance,
      color: 'text-green-600'
    },
    {
      key: 'acousticElectricalProperties',
      title: 'Acoustic & Electrical',
      icon: Volume2,
      data: functionalMetadata.acousticElectricalProperties,
      renderFn: renderAcousticProperties,
      color: 'text-indigo-600'
    },
    {
      key: 'environmentalSustainability',
      title: 'Environmental',
      icon: Leaf,
      data: functionalMetadata.environmentalSustainability,
      renderFn: renderEnvironmentalProperties,
      color: 'text-emerald-600'
    },
    {
      key: 'dimensionalAesthetic',
      title: 'Dimensional & Aesthetic',
      icon: Ruler,
      data: functionalMetadata.dimensionalAesthetic,
      renderFn: renderDimensionalProperties,
      color: 'text-pink-600'
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