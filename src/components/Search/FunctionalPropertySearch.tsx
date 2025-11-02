import React, { useState, useCallback } from 'react';
import {
  Search,
  Filter,
  X,
  Shield,
  Droplets,
  Thermometer,
  Hammer,
  Leaf,
  Waves,
  Palette,
  Star,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { type FunctionalMetadata } from '@/types/materials';

/** Filter criteria for functional properties search - Complete metadata coverage */
export interface FunctionalPropertyFilters {
  /** Text search within property values */
  searchQuery: string;
  /** Active functional metadata categories */
  activeCategories: string[];
  /** Specific property filters by category - COMPLETE COVERAGE */
  propertyFilters: {
    slipSafetyRatings?: {
      rValue?: string[];
      barefootRampTest?: string[];
      dcofRange?: [number, number];
      pendulumTestRange?: [number, number]; // wet/dry values
      safetyCertifications?: string[];
    };
    surfaceGlossReflectivity?: {
      glossLevel?: string[];
      glossValueRange?: [number, number];
      lightReflectanceRange?: [number, number];
      surfaceFinish?: string[];
      antiGlareRatingRange?: [number, number];
      mirrorFinish?: boolean;
    };
    mechanicalPropertiesExtended?: {
      mohsHardnessRange?: [number, number];
      peiRating?: number[];
      breakingStrengthRange?: [number, number];
      impactResistanceClass?: string[]; // low/medium/high
      mechanicalCertifications?: string[];
    };
    thermalProperties?: {
      thermalConductivityRange?: [number, number];
      heatResistanceRange?: [number, number];
      thermalExpansionRange?: [number, number];
      solarReflectanceRange?: [number, number];
      sriValueRange?: [number, number];
      radiantHeatingCompatible?: boolean;
      thermalShockResistance?: string[];
    };
    waterMoistureResistance?: {
      waterAbsorptionRange?: [number, number];
      waterAbsorptionClass?: string[]; // non-porous/semi-porous/porous
      frostResistance?: boolean;
      hydrophobicTreatment?: boolean;
      hydrophobicEffectivenessRange?: [number, number];
      moldMildewResistant?: boolean;
      moistureCertifications?: string[];
    };
    chemicalHygieneResistance?: {
      acidResistance?: string[]; // excellent/good/fair/poor
      alkaliResistance?: string[]; // excellent/good/fair/poor
      stainResistanceClass?: number[]; // 1-5
      antimicrobialTreatment?: boolean;
      antimicrobialEffectivenessRange?: [number, number];
      foodSafeCertified?: boolean;
      chemicalCertifications?: string[];
    };
    acousticElectricalProperties?: {
      nrcRange?: [number, number];
      soundAbsorptionRange?: [number, number];
      decibelReductionRange?: [number, number];
      impactInsulationClassRange?: [number, number];
      antiStatic?: boolean;
      conductive?: boolean;
      electricalResistanceRange?: [number, number];
      esdCertified?: boolean;
      acousticCertifications?: string[];
    };
    environmentalSustainability?: {
      greenguardLevel?: string[]; // certified/gold/none
      floorScore?: boolean;
      vocEmissionRange?: string[]; // A+, A, B, C rating categories
      preConsumerRecycledRange?: [number, number];
      postConsumerRecycledRange?: [number, number];
      totalRecycledContentRange?: [number, number];
      leedCreditsRange?: [number, number];
      breeamCreditsRange?: [number, number];
      carbonFootprintRange?: [number, number];
      geopolymerRatingRange?: [number, number];
      recyclable?: boolean;
      circularMaterialRatingRange?: [number, number];
      otherEcoCertifications?: string[];
    };
    dimensionalAesthetic?: {
      rectifiedEdges?: boolean;
      calibrationGrade?: string[];
      edgeGeometry?: string[]; // straight/beveled/rounded/custom
      textureDepthRange?: [number, number];
      textureRatingRange?: [number, number];
      textureType?: string[];
      shadeVariation?: string[]; // V1/V2/V3/V4
      colorUniformityRange?: [number, number];
      colorFastness?: string[];
      translucent?: boolean;
      backlitCapabilityRange?: [number, number];
      luminescent?: boolean;
      photoluminescentDurationRange?: [number, number];
    };
  };
}

interface FunctionalPropertySearchProps {
  /** Current filter state */
  filters: FunctionalPropertyFilters;
  /** Callback when filters change */
  onFiltersChange: (filters: FunctionalPropertyFilters) => void;
  /** Available materials with functional metadata */
  availableMaterials?: Array<{
    id: string;
    functionalMetadata?: FunctionalMetadata;
  }>;
  /** Display mode - compact for sidebar, expanded for full view */
  displayMode?: 'compact' | 'expanded';
  /** Loading state */
  isLoading?: boolean;
}

/** Category configuration with icons, display names, and search properties */
const FUNCTIONAL_CATEGORIES = {
  slipSafetyRatings: {
    icon: Shield,
    displayName: '🦶 Slip/Safety Ratings',
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    searchableProperties: [
      'rValue',
      'barefootRampTest',
      'dcof',
      'pendulumTestValue',
      'safetyCertifications',
    ],
  },
  surfaceGlossReflectivity: {
    icon: Star,
    displayName: '✨ Surface Gloss/Reflectivity',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    searchableProperties: [
      'glossLevel',
      'glossValue',
      'lightReflectance',
      'surfaceFinish',
      'reflectivityProperties',
      'antiGlareRating',
      'mirrorFinish',
    ],
  },
  mechanicalPropertiesExtended: {
    icon: Hammer,
    displayName: '🔧 Mechanical Properties',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    searchableProperties: [
      'mohsHardness',
      'peiRating',
      'breakingStrength',
      'impactResistance',
      'mechanicalCertifications',
    ],
  },
  thermalProperties: {
    icon: Thermometer,
    displayName: '🌡️ Thermal Properties',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    searchableProperties: [
      'thermalConductivity',
      'thermalExpansionCoefficient',
      'heatResistance',
      'coolRoofRating',
      'solarReflectance',
      'sriValue',
      'radiantHeatingCompatible',
      'thermalShockResistance',
    ],
  },
  waterMoistureResistance: {
    icon: Droplets,
    displayName: '💧 Water/Moisture Resistance',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 border-cyan-200',
    searchableProperties: [
      'waterAbsorption',
      'waterAbsorptionPercentage',
      'waterAbsorptionClassification',
      'frostResistance',
      'hydrophobicTreatment',
      'moldMildewResistant',
      'moistureCertifications',
    ],
  },
  chemicalHygieneResistance: {
    icon: Shield,
    displayName: '🧪 Chemical/Hygiene Resistance',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    searchableProperties: [
      'chemicalResistance',
      'acidResistance',
      'alkaliResistance',
      'stainResistance',
      'antimicrobialProperties',
      'antimicrobialTreatment',
      'foodSafeCertified',
      'chemicalCertifications',
    ],
  },
  acousticElectricalProperties: {
    icon: Waves,
    displayName: '🔊 Acoustic/Electrical Properties',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200',
    searchableProperties: [
      'acousticProperties',
      'nrc',
      'soundAbsorption',
      'decibelReduction',
      'impactInsulationClass',
      'electricalProperties',
      'antiStatic',
      'conductive',
      'electricalResistance',
      'esdCertified',
      'acousticCertifications',
    ],
  },
  environmentalSustainability: {
    icon: Leaf,
    displayName: '🌱 Environmental/Sustainability',
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    searchableProperties: [
      'vocEmissionRating',
      'greenguard',
      'floorScore',
      'recycledContent',
      'ecoLabels',
      'leedCredits',
      'breeamCredits',
      'sustainabilityMetrics',
      'carbonFootprint',
      'geopolymerRating',
      'recyclable',
      'circularMaterialRating',
    ],
  },
  dimensionalAesthetic: {
    icon: Palette,
    displayName: '📏 Dimensional/Aesthetic',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 border-pink-200',
    searchableProperties: [
      'edgeProperties',
      'rectifiedEdges',
      'calibrationGrade',
      'edgeGeometry',
      'textureProperties',
      'textureDepth',
      'textureRating',
      'textureType',
      'colorProperties',
      'shadeVariation',
      'colorUniformity',
      'colorFastness',
      'specialProperties',
      'translucent',
      'backlitCapability',
      'luminescent',
      'photoluminescentDuration',
    ],
  },
} as const;

export const FunctionalPropertySearch: React.FC<
  FunctionalPropertySearchProps
> = ({
  filters,
  onFiltersChange,
  displayMode = 'expanded',
  isLoading = false,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  /** Toggle category expansion */
  const toggleCategory = useCallback(
    (category: string) => {
      const newExpanded = new Set(expandedCategories);
      if (newExpanded.has(category)) {
        newExpanded.delete(category);
      } else {
        newExpanded.add(category);
      }
      setExpandedCategories(newExpanded);
    },
    [expandedCategories],
  );

  /** Handle search query change */
  const handleSearchChange = useCallback(
    (query: string) => {
      onFiltersChange({
        ...filters,
        searchQuery: query,
      });
    },
    [filters, onFiltersChange],
  );

  /** Handle category selection */
  const handleCategoryToggle = useCallback(
    (category: string, checked: boolean) => {
      const newActiveCategories = checked
        ? [...filters.activeCategories, category]
        : filters.activeCategories.filter((c) => c !== category);

      onFiltersChange({
        ...filters,
        activeCategories: newActiveCategories,
      });
    },
    [filters, onFiltersChange],
  );

  /** Clear all filters */
  const clearAllFilters = useCallback(() => {
    onFiltersChange({
      searchQuery: '',
      activeCategories: [],
      propertyFilters: {},
    });
  }, [onFiltersChange]);

  /** Render category-specific filter controls */
  const renderCategorySpecificFilters = useCallback(
    (categoryKey: string) => {
      const categoryFilters =
        filters.propertyFilters[
          categoryKey as keyof typeof filters.propertyFilters
        ];

      const updateCategoryFilter = (key: string, value: unknown) => {
        const newFilters = {
          ...filters,
          propertyFilters: {
            ...filters.propertyFilters,
            [categoryKey]: {
              ...categoryFilters,
              [key]: value,
            },
          },
        };
        onFiltersChange(newFilters);
      };

      switch (categoryKey) {
        case 'slipSafetyRatings': {
          const slipFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['slipSafetyRatings'];
          return (
            <div className="space-y-3">
              {/* R-Value Multi-Select */}
              <div className="space-y-1">
                <Label className="text-xs">R-Value (DIN 51130)</Label>
                <div className="flex flex-wrap gap-1">
                  {['R9', 'R10', 'R11', 'R12', 'R13'].map((rValue) => (
                    <Button
                      key={rValue}
                      variant={
                        slipFilters?.rValue?.includes(rValue)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = slipFilters?.rValue || [];
                        const updated = current.includes(rValue)
                          ? current.filter((v: string) => v !== rValue)
                          : [...current, rValue];
                        updateCategoryFilter('rValue', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = slipFilters?.rValue || [];
                          const updated = current.includes(rValue)
                            ? current.filter((v: string) => v !== rValue)
                            : [...current, rValue];
                          updateCategoryFilter('rValue', updated);
                        }
                      }}
                    >
                      {rValue}
                    </Button>
                  ))}
                </div>
              </div>

              {/* DCOF Range */}
              <div className="space-y-1">
                <Label className="text-xs">
                  DCOF Range (≥0.42 recommended)
                </Label>
                <Slider
                  value={slipFilters?.dcofRange || [0, 1]}
                  onValueChange={(value) =>
                    updateCategoryFilter('dcofRange', value as [number, number])
                  }
                  max={1}
                  min={0}
                  step={0.01}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {slipFilters?.dcofRange?.[0]?.toFixed(2) || '0.00'}
                  </span>
                  <span>
                    {slipFilters?.dcofRange?.[1]?.toFixed(2) || '1.00'}
                  </span>
                </div>
              </div>

              {/* Barefoot Ramp Test */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Barefoot Ramp Test (DIN 51097)
                </Label>
                <div className="flex flex-wrap gap-1">
                  {['A', 'B', 'C'].map((grade) => (
                    <Button
                      key={grade}
                      variant={
                        slipFilters?.barefootRampTest?.includes(grade)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = slipFilters?.barefootRampTest || [];
                        const updated = current.includes(grade)
                          ? current.filter((v: string) => v !== grade)
                          : [...current, grade];
                        updateCategoryFilter('barefootRampTest', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = slipFilters?.barefootRampTest || [];
                          const updated = current.includes(grade)
                            ? current.filter((v: string) => v !== grade)
                            : [...current, grade];
                          updateCategoryFilter('barefootRampTest', updated);
                        }
                      }}
                    >
                      Class {grade}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        case 'surfaceGlossReflectivity': {
          const glossFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['surfaceGlossReflectivity'];
          return (
            <div className="space-y-3">
              {/* Gloss Level */}
              <div className="space-y-1">
                <Label className="text-xs">Gloss Level</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    'super-polished',
                    'polished',
                    'satin',
                    'semi-polished',
                    'matte',
                    'velvet',
                    'anti-glare',
                  ].map((level) => (
                    <Button
                      key={level}
                      variant={
                        glossFilters?.glossLevel?.includes(level)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = glossFilters?.glossLevel || [];
                        const updated = current.includes(level)
                          ? current.filter((v: string) => v !== level)
                          : [...current, level];
                        updateCategoryFilter('glossLevel', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = glossFilters?.glossLevel || [];
                          const updated = current.includes(level)
                            ? current.filter((v: string) => v !== level)
                            : [...current, level];
                          updateCategoryFilter('glossLevel', updated);
                        }
                      }}
                    >
                      {level.replace('-', ' ')}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Gloss Value Range */}
              <div className="space-y-1">
                <Label className="text-xs">Gloss Value (0-100)</Label>
                <Slider
                  value={glossFilters?.glossValueRange || [0, 100]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'glossValueRange',
                      value as [number, number],
                    )
                  }
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{glossFilters?.glossValueRange?.[0] || 0}</span>
                  <span>{glossFilters?.glossValueRange?.[1] || 100}</span>
                </div>
              </div>

              {/* Light Reflectance Range */}
              <div className="space-y-1">
                <Label className="text-xs">Light Reflectance (%)</Label>
                <Slider
                  value={glossFilters?.lightReflectanceRange || [0, 100]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'lightReflectanceRange',
                      value as [number, number],
                    )
                  }
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{glossFilters?.lightReflectanceRange?.[0] || 0}%</span>
                  <span>
                    {glossFilters?.lightReflectanceRange?.[1] || 100}%
                  </span>
                </div>
              </div>

              {/* Mirror Finish Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={glossFilters?.mirrorFinish || false}
                  onCheckedChange={(checked) =>
                    updateCategoryFilter('mirrorFinish', !!checked)
                  }
                />
                <Label className="text-xs">Mirror Finish</Label>
              </div>
            </div>
          );
        }

        case 'mechanicalPropertiesExtended': {
          const mechanicalFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['mechanicalPropertiesExtended'];
          return (
            <div className="space-y-3">
              {/* Mohs Hardness Range */}
              <div className="space-y-1">
                <Label className="text-xs">Mohs Hardness (1-10)</Label>
                <Slider
                  value={mechanicalFilters?.mohsHardnessRange || [1, 10]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'mohsHardnessRange',
                      value as [number, number],
                    )
                  }
                  max={10}
                  min={1}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {mechanicalFilters?.mohsHardnessRange?.[0]?.toFixed(1) ||
                      '1.0'}
                  </span>
                  <span>
                    {mechanicalFilters?.mohsHardnessRange?.[1]?.toFixed(1) ||
                      '10.0'}
                  </span>
                </div>
              </div>

              {/* PEI Rating */}
              <div className="space-y-1">
                <Label className="text-xs">
                  PEI Rating (Abrasion Resistance)
                </Label>
                <div className="flex flex-wrap gap-1">
                  {[0, 1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={
                        mechanicalFilters?.peiRating?.includes(rating)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = mechanicalFilters?.peiRating || [];
                        const updated = current.includes(rating)
                          ? current.filter((v: number) => v !== rating)
                          : [...current, rating];
                        updateCategoryFilter('peiRating', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = mechanicalFilters?.peiRating || [];
                          const updated = current.includes(rating)
                            ? current.filter((v: number) => v !== rating)
                            : [...current, rating];
                          updateCategoryFilter('peiRating', updated);
                        }
                      }}
                    >
                      Class {rating}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Impact Resistance Classification */}
              <div className="space-y-1">
                <Label className="text-xs">Impact Resistance</Label>
                <div className="flex flex-wrap gap-1">
                  {['low', 'medium', 'high'].map((level) => (
                    <Button
                      key={level}
                      variant={
                        mechanicalFilters?.impactResistanceClass?.includes(
                          level,
                        )
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current =
                          mechanicalFilters?.impactResistanceClass || [];
                        const updated = current.includes(level)
                          ? current.filter((v: string) => v !== level)
                          : [...current, level];
                        updateCategoryFilter('impactResistanceClass', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current =
                            mechanicalFilters?.impactResistanceClass || [];
                          const updated = current.includes(level)
                            ? current.filter((v: string) => v !== level)
                            : [...current, level];
                          updateCategoryFilter(
                            'impactResistanceClass',
                            updated,
                          );
                        }
                      }}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        case 'thermalProperties': {
          const thermalFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['thermalProperties'];
          return (
            <div className="space-y-3">
              {/* Thermal Conductivity Range */}
              <div className="space-y-1">
                <Label className="text-xs">Thermal Conductivity (W/m·K)</Label>
                <Slider
                  value={thermalFilters?.thermalConductivityRange || [0, 50]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'thermalConductivityRange',
                      value as [number, number],
                    )
                  }
                  max={50}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {thermalFilters?.thermalConductivityRange?.[0]?.toFixed(
                      1,
                    ) || '0.0'}
                  </span>
                  <span>
                    {thermalFilters?.thermalConductivityRange?.[1]?.toFixed(
                      1,
                    ) || '50.0'}
                  </span>
                </div>
              </div>

              {/* Heat Resistance Range */}
              <div className="space-y-1">
                <Label className="text-xs">Heat Resistance (°C)</Label>
                <Slider
                  value={thermalFilters?.heatResistanceRange || [0, 1000]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'heatResistanceRange',
                      value as [number, number],
                    )
                  }
                  max={1000}
                  min={0}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{thermalFilters?.heatResistanceRange?.[0] || 0}°C</span>
                  <span>
                    {thermalFilters?.heatResistanceRange?.[1] || 1000}°C
                  </span>
                </div>
              </div>

              {/* Radiant Heating Compatible Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={thermalFilters?.radiantHeatingCompatible || false}
                  onCheckedChange={(checked) =>
                    updateCategoryFilter('radiantHeatingCompatible', !!checked)
                  }
                />
                <Label className="text-xs">Radiant Heating Compatible</Label>
              </div>
            </div>
          );
        }

        case 'waterMoistureResistance': {
          const waterFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['waterMoistureResistance'];
          return (
            <div className="space-y-3">
              {/* Water Absorption Range */}
              <div className="space-y-1">
                <Label className="text-xs">Water Absorption (%)</Label>
                <Slider
                  value={waterFilters?.waterAbsorptionRange || [0, 20]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'waterAbsorptionRange',
                      value as [number, number],
                    )
                  }
                  max={20}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {waterFilters?.waterAbsorptionRange?.[0]?.toFixed(1) ||
                      '0.0'}
                    %
                  </span>
                  <span>
                    {waterFilters?.waterAbsorptionRange?.[1]?.toFixed(1) ||
                      '20.0'}
                    %
                  </span>
                </div>
              </div>

              {/* Water Absorption Classification */}
              <div className="space-y-1">
                <Label className="text-xs">Absorption Classification</Label>
                <div className="flex flex-wrap gap-1">
                  {['non-porous', 'semi-porous', 'porous'].map(
                    (classification) => (
                      <Button
                        key={classification}
                        variant={
                          waterFilters?.waterAbsorptionClass?.includes(
                            classification,
                          )
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => {
                          const current =
                            waterFilters?.waterAbsorptionClass || [];
                          const updated = current.includes(classification)
                            ? current.filter(
                                (v: string) => v !== classification,
                              )
                            : [...current, classification];
                          updateCategoryFilter('waterAbsorptionClass', updated);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const current =
                              waterFilters?.waterAbsorptionClass || [];
                            const updated = current.includes(classification)
                              ? current.filter(
                                  (v: string) => v !== classification,
                                )
                              : [...current, classification];
                            updateCategoryFilter(
                              'waterAbsorptionClass',
                              updated,
                            );
                          }
                        }}
                      >
                        {classification}
                      </Button>
                    ),
                  )}
                </div>
              </div>

              {/* Boolean Properties */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={waterFilters?.frostResistance || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('frostResistance', !!checked)
                    }
                  />
                  <Label className="text-xs">Frost Resistant</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={waterFilters?.hydrophobicTreatment || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('hydrophobicTreatment', !!checked)
                    }
                  />
                  <Label className="text-xs">Hydrophobic Treatment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={waterFilters?.moldMildewResistant || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('moldMildewResistant', !!checked)
                    }
                  />
                  <Label className="text-xs">Mold/Mildew Resistant</Label>
                </div>
              </div>
            </div>
          );
        }

        case 'chemicalHygieneResistance': {
          const chemicalFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['chemicalHygieneResistance'];
          return (
            <div className="space-y-3">
              {/* Acid Resistance */}
              <div className="space-y-1">
                <Label className="text-xs">Acid Resistance</Label>
                <div className="flex flex-wrap gap-1">
                  {['excellent', 'good', 'fair', 'poor'].map((level) => (
                    <Button
                      key={level}
                      variant={
                        chemicalFilters?.acidResistance?.includes(level)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = chemicalFilters?.acidResistance || [];
                        const updated = current.includes(level)
                          ? current.filter((v: string) => v !== level)
                          : [...current, level];
                        updateCategoryFilter('acidResistance', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = chemicalFilters?.acidResistance || [];
                          const updated = current.includes(level)
                            ? current.filter((v: string) => v !== level)
                            : [...current, level];
                          updateCategoryFilter('acidResistance', updated);
                        }
                      }}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Stain Resistance Class */}
              <div className="space-y-1">
                <Label className="text-xs">Stain Resistance Class (1-5)</Label>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={
                        chemicalFilters?.stainResistanceClass?.includes(rating)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current =
                          chemicalFilters?.stainResistanceClass || [];
                        const updated = current.includes(rating)
                          ? current.filter((v: number) => v !== rating)
                          : [...current, rating];
                        updateCategoryFilter('stainResistanceClass', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current =
                            chemicalFilters?.stainResistanceClass || [];
                          const updated = current.includes(rating)
                            ? current.filter((v: number) => v !== rating)
                            : [...current, rating];
                          updateCategoryFilter('stainResistanceClass', updated);
                        }
                      }}
                    >
                      Class {rating}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Boolean Properties */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={chemicalFilters?.antimicrobialTreatment || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('antimicrobialTreatment', !!checked)
                    }
                  />
                  <Label className="text-xs">Antimicrobial Treatment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={chemicalFilters?.foodSafeCertified || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('foodSafeCertified', !!checked)
                    }
                  />
                  <Label className="text-xs">Food Safe Certified</Label>
                </div>
              </div>
            </div>
          );
        }

        case 'acousticElectricalProperties': {
          const acousticFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['acousticElectricalProperties'];
          return (
            <div className="space-y-3">
              {/* NRC Range */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Noise Reduction Coefficient (NRC)
                </Label>
                <Slider
                  value={acousticFilters?.nrcRange || [0, 1]}
                  onValueChange={(value) =>
                    updateCategoryFilter('nrcRange', value as [number, number])
                  }
                  max={1}
                  min={0}
                  step={0.05}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {acousticFilters?.nrcRange?.[0]?.toFixed(2) || '0.00'}
                  </span>
                  <span>
                    {acousticFilters?.nrcRange?.[1]?.toFixed(2) || '1.00'}
                  </span>
                </div>
              </div>

              {/* Boolean Properties */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={acousticFilters?.antiStatic || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('antiStatic', !!checked)
                    }
                  />
                  <Label className="text-xs">Anti-Static</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={acousticFilters?.conductive || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('conductive', !!checked)
                    }
                  />
                  <Label className="text-xs">Conductive</Label>
                </div>
              </div>
            </div>
          );
        }

        case 'environmentalSustainability': {
          const envFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['environmentalSustainability'];
          return (
            <div className="space-y-3">
              {/* VOC Emission Rating */}
              <div className="space-y-1">
                <Label className="text-xs">VOC Emission Rating</Label>
                <div className="flex flex-wrap gap-1">
                  {['A+', 'A', 'B', 'C'].map((rating) => (
                    <Button
                      key={rating}
                      variant={
                        envFilters?.vocEmissionRange?.includes(rating)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current = envFilters?.vocEmissionRange || [];
                        const updated = current.includes(rating)
                          ? current.filter((v: string) => v !== rating)
                          : [...current, rating];
                        updateCategoryFilter('vocEmissionRange', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current = envFilters?.vocEmissionRange || [];
                          const updated = current.includes(rating)
                            ? current.filter((v: string) => v !== rating)
                            : [...current, rating];
                          updateCategoryFilter('vocEmissionRange', updated);
                        }
                      }}
                    >
                      {rating}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Total Recycled Content Range */}
              <div className="space-y-1">
                <Label className="text-xs">Total Recycled Content (%)</Label>
                <Slider
                  value={envFilters?.totalRecycledContentRange || [0, 100]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'totalRecycledContentRange',
                      value as [number, number],
                    )
                  }
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {envFilters?.totalRecycledContentRange?.[0] || 0}%
                  </span>
                  <span>
                    {envFilters?.totalRecycledContentRange?.[1] || 100}%
                  </span>
                </div>
              </div>

              {/* LEED Credits Range */}
              <div className="space-y-1">
                <Label className="text-xs">LEED Credits</Label>
                <Slider
                  value={envFilters?.leedCreditsRange || [0, 10]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'leedCreditsRange',
                      value as [number, number],
                    )
                  }
                  max={10}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{envFilters?.leedCreditsRange?.[0] || 0}</span>
                  <span>{envFilters?.leedCreditsRange?.[1] || 10}</span>
                </div>
              </div>

              {/* Environmental Certifications */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={
                      !!envFilters?.greenguardLevel &&
                      envFilters.greenguardLevel.length > 0
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateCategoryFilter('greenguardLevel', ['certified']);
                      } else {
                        updateCategoryFilter('greenguardLevel', []);
                      }
                    }}
                  />
                  <Label className="text-xs">Greenguard Certified</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={envFilters?.floorScore || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('floorScore', !!checked)
                    }
                  />
                  <Label className="text-xs">FloorScore Certified</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={envFilters?.recyclable || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('recyclable', !!checked)
                    }
                  />
                  <Label className="text-xs">Recyclable</Label>
                </div>
              </div>
            </div>
          );
        }

        case 'dimensionalAesthetic': {
          const dimensionalFilters =
            categoryFilters as FunctionalPropertyFilters['propertyFilters']['dimensionalAesthetic'];
          return (
            <div className="space-y-3">
              {/* Texture Depth Range */}
              <div className="space-y-1">
                <Label className="text-xs">Texture Depth (mm)</Label>
                <Slider
                  value={dimensionalFilters?.textureDepthRange || [0, 10]}
                  onValueChange={(value) =>
                    updateCategoryFilter(
                      'textureDepthRange',
                      value as [number, number],
                    )
                  }
                  max={10}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {dimensionalFilters?.textureDepthRange?.[0]?.toFixed(1) ||
                      '0.0'}
                    mm
                  </span>
                  <span>
                    {dimensionalFilters?.textureDepthRange?.[1]?.toFixed(1) ||
                      '10.0'}
                    mm
                  </span>
                </div>
              </div>

              {/* Shade Variation */}
              <div className="space-y-1">
                <Label className="text-xs">Shade Variation</Label>
                <div className="flex flex-wrap gap-1">
                  {['V1', 'V2', 'V3', 'V4'].map((variation) => (
                    <Button
                      key={variation}
                      variant={
                        dimensionalFilters?.shadeVariation?.includes(variation)
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => {
                        const current =
                          dimensionalFilters?.shadeVariation || [];
                        const updated = current.includes(variation)
                          ? current.filter((v: string) => v !== variation)
                          : [...current, variation];
                        updateCategoryFilter('shadeVariation', updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const current =
                            dimensionalFilters?.shadeVariation || [];
                          const updated = current.includes(variation)
                            ? current.filter((v: string) => v !== variation)
                            : [...current, variation];
                          updateCategoryFilter('shadeVariation', updated);
                        }
                      }}
                    >
                      {variation}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Texture Type */}
              <div className="space-y-1">
                <Label className="text-xs">Texture Type</Label>
                <div className="flex flex-wrap gap-1">
                  {['smooth', 'textured', 'structured', 'natural', 'grip'].map(
                    (texture) => (
                      <Button
                        key={texture}
                        variant={
                          dimensionalFilters?.textureType?.includes(texture)
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => {
                          const current = dimensionalFilters?.textureType || [];
                          const updated = current.includes(texture)
                            ? current.filter((v: string) => v !== texture)
                            : [...current, texture];
                          updateCategoryFilter('textureType', updated);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const current =
                              dimensionalFilters?.textureType || [];
                            const updated = current.includes(texture)
                              ? current.filter((v: string) => v !== texture)
                              : [...current, texture];
                            updateCategoryFilter('textureType', updated);
                          }
                        }}
                      >
                        {texture}
                      </Button>
                    ),
                  )}
                </div>
              </div>

              {/* Edge Properties */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={dimensionalFilters?.rectifiedEdges || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('rectifiedEdges', !!checked)
                    }
                  />
                  <Label className="text-xs">Rectified Edges</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={dimensionalFilters?.translucent || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('translucent', !!checked)
                    }
                  />
                  <Label className="text-xs">Translucent</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={
                      !!dimensionalFilters?.backlitCapabilityRange &&
                      dimensionalFilters.backlitCapabilityRange[0] > 0
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateCategoryFilter('backlitCapabilityRange', [1, 10]);
                      } else {
                        updateCategoryFilter('backlitCapabilityRange', [0, 0]);
                      }
                    }}
                  />
                  <Label className="text-xs">Backlit Capability</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={dimensionalFilters?.luminescent || false}
                    onCheckedChange={(checked) =>
                      updateCategoryFilter('luminescent', !!checked)
                    }
                  />
                  <Label className="text-xs">Luminescent</Label>
                </div>
              </div>
            </div>
          );
        }

        default:
          return (
            <div className="text-xs text-muted-foreground italic">
              Advanced filters for {categoryKey} category will be available
              here.
            </div>
          );
      }
    },
    [filters, onFiltersChange],
  );

  /** Render category filter section */
  const renderCategoryFilter = useCallback(
    (categoryKey: string) => {
      const category =
        FUNCTIONAL_CATEGORIES[
          categoryKey as keyof typeof FUNCTIONAL_CATEGORIES
        ];
      if (!category) return null;

      const Icon = category.icon;
      const isExpanded = expandedCategories.has(categoryKey);
      const isActive = filters.activeCategories.includes(categoryKey);

      return (
        <Card key={categoryKey} className={`${category.bgColor} border`}>
          <Collapsible
            open={isExpanded}
            onOpenChange={() => toggleCategory(categoryKey)}
          >
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isActive}
                      onCheckedChange={(checked) =>
                        handleCategoryToggle(categoryKey, !!checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                        }
                      }}
                    />
                    <Icon className={`h-4 w-4 ${category.color}`} />
                    <span className="text-sm font-medium">
                      {category.displayName}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 p-3">
                <div className="text-xs text-muted-foreground mb-3">
                  Searchable properties:{' '}
                  {category.searchableProperties.join(', ')}
                </div>
                {renderCategorySpecificFilters(categoryKey)}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      );
    },
    [
      expandedCategories,
      filters.activeCategories,
      toggleCategory,
      handleCategoryToggle,
    ],
  );

  if (displayMode === 'compact') {
    return (
      <Card className="w-full">
        <CardHeader className="p-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Functional Property Search
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search properties..."
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 text-sm"
            />
          </div>

          {/* Active Categories */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Active Categories ({filters.activeCategories.length})
            </Label>
            <div className="flex flex-wrap gap-1">
              {filters.activeCategories.map((categoryKey) => {
                const category =
                  FUNCTIONAL_CATEGORIES[
                    categoryKey as keyof typeof FUNCTIONAL_CATEGORIES
                  ];
                if (!category) return null;
                return (
                  <Badge
                    key={categoryKey}
                    variant="secondary"
                    className="text-xs"
                  >
                    {category.displayName}
                    <X
                      className="h-3 w-3 ml-1 cursor-pointer"
                      onClick={() => handleCategoryToggle(categoryKey, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCategoryToggle(categoryKey, false);
                        }
                      }}
                    />
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Clear Filters */}
          {(filters.searchQuery || filters.activeCategories.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  clearAllFilters();
                }
              }}
              className="w-full text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All Filters
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Functional Property Search & Filters
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Search and filter materials by their functional properties across 9
            metadata categories
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search functional properties (e.g., 'slip resistant', 'R11', 'antimicrobial')..."
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {filters.activeCategories.length} categories selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setShowAdvancedFilters(!showAdvancedFilters);
                  }
                }}
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                {showAdvancedFilters ? 'Hide' : 'Show'} Advanced Filters
              </Button>
            </div>
            {(filters.searchQuery || filters.activeCategories.length > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    clearAllFilters();
                  }
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Category Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Functional Metadata Categories
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select which functional property categories to include in your
            search
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(FUNCTIONAL_CATEGORIES).map((categoryKey) =>
              renderCategoryFilter(categoryKey),
            )}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Advanced Property Filters</CardTitle>
            <p className="text-sm text-muted-foreground">
              Fine-tune your search with specific property value ranges and
              criteria for active categories
            </p>
          </CardHeader>
          <CardContent>
            {filters.activeCategories.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Select one or more functional metadata categories above to
                access advanced property filters
              </div>
            ) : (
              <div className="space-y-6">
                {filters.activeCategories.map((categoryKey) => {
                  const category =
                    FUNCTIONAL_CATEGORIES[
                      categoryKey as keyof typeof FUNCTIONAL_CATEGORIES
                    ];
                  if (!category) return null;

                  const Icon = category.icon;
                  return (
                    <div key={categoryKey} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Icon className={`h-4 w-4 ${category.color}`} />
                        <h3 className="font-medium text-sm">
                          {category.displayName}
                        </h3>
                        <Badge variant="outline" className="text-xs">
                          {category.searchableProperties.length} properties
                        </Badge>
                      </div>
                      <div className="pl-6">
                        {renderCategorySpecificFilters(categoryKey)}
                      </div>
                    </div>
                  );
                })}

                {/* Filter Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    Apply filters to refine search results across selected
                    categories
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const resetFilters = { ...filters };
                        resetFilters.propertyFilters = {};
                        onFiltersChange(resetFilters);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const resetFilters = { ...filters };
                          resetFilters.propertyFilters = {};
                          onFiltersChange(resetFilters);
                        }
                      }}
                      className="text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reset Property Filters
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onFiltersChange(filters)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onFiltersChange(filters);
                        }
                      }}
                      className="text-xs"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results Summary */}
      {isLoading && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                Searching functional properties...
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FunctionalPropertySearch;
