import React, { useCallback } from 'react';
import {
  Shield,
  Droplets,
  Thermometer,
  Hammer,
  Leaf,
  Waves,
  Palette,
  Star,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';

import { type FunctionalPropertyFilters } from './FunctionalPropertySearch';

interface FunctionalCategoryFiltersProps {
  /** Current filter state */
  filters: FunctionalPropertyFilters;
  /** Callback when filters change */
  onFiltersChange: (filters: FunctionalPropertyFilters) => void;
  /** Which category to show filters for */
  category: string;
}

export const FunctionalCategoryFilters = ({
  filters,
  onFiltersChange,
  category,
}: FunctionalCategoryFiltersProps): React.ReactElement => {
  /** Update specific property filter */
  const updatePropertyFilter = useCallback((
    categoryKey: string,
    propertyKey: string,
    value: unknown
  ) => {
    const newFilters = {
      ...filters,
      propertyFilters: {
        ...filters.propertyFilters,
        [categoryKey]: {
          ...filters.propertyFilters[categoryKey as keyof typeof filters.propertyFilters],
          [propertyKey]: value,
        },
      },
    };
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  /** Render filters based on category */
  const renderCategorySpecificFilters = () => {
    switch (category) {
      case 'slipSafetyRatings':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-600" />
              <Label className="font-medium">🦶 Slip/Safety Ratings</Label>
            </div>
            
            {/* R-Value Selection */}
            <div className="space-y-2">
              <Label className="text-sm">R-Value (DIN 51130)</Label>
              <div className="flex flex-wrap gap-2">
                {['R9', 'R10', 'R11', 'R12', 'R13'].map(rValue => (
                  <Button
                    key={rValue}
                    variant={filters.propertyFilters.slipSafetyRatings?.rValue?.includes(rValue) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.slipSafetyRatings?.rValue || [];
                      const newValues = currentValues.includes(rValue)
                        ? currentValues.filter(v => v !== rValue)
                        : [...currentValues, rValue];
                      updatePropertyFilter('slipSafetyRatings', 'rValue', newValues);
                    }}
                    className="text-xs"
                  >
                    {rValue}
                  </Button>
                ))}
              </div>
            </div>

            {/* Barefoot Ramp Test */}
            <div className="space-y-2">
              <Label className="text-sm">Barefoot Ramp Test (DIN 51097)</Label>
              <div className="flex gap-2">
                {['A', 'B', 'C'].map(test => (
                  <Button
                    key={test}
                    variant={filters.propertyFilters.slipSafetyRatings?.barefootRampTest?.includes(test) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.slipSafetyRatings?.barefootRampTest || [];
                      const newValues = currentValues.includes(test)
                        ? currentValues.filter(v => v !== test)
                        : [...currentValues, test];
                      updatePropertyFilter('slipSafetyRatings', 'barefootRampTest', newValues);
                    }}
                    className="text-xs"
                  >
                    Class {test}
                  </Button>
                ))}
              </div>
            </div>

            {/* DCOF Range */}
            <div className="space-y-2">
              <Label className="text-sm">DCOF Range (≥0.42 recommended)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.slipSafetyRatings?.dcofRange || [0, 1]}
                  onValueChange={(value) => updatePropertyFilter('slipSafetyRatings', 'dcofRange', value as [number, number])}
                  max={1}
                  min={0}
                  step={0.01}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.slipSafetyRatings?.dcofRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.slipSafetyRatings?.dcofRange?.[1] || 1}</span>
                </div>
              </div>
            </div>

            {/* Pendulum Test Range */}
            <div className="space-y-2">
              <Label className="text-sm">Pendulum Test Range (PTV)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.slipSafetyRatings?.pendulumTestRange || [0, 100]}
                  onValueChange={(value) => updatePropertyFilter('slipSafetyRatings', 'pendulumTestRange', value as [number, number])}
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.slipSafetyRatings?.pendulumTestRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.slipSafetyRatings?.pendulumTestRange?.[1] || 100}</span>
                </div>
              </div>
            </div>

            {/* Safety Certifications */}
            <div className="space-y-2">
              <Label className="text-sm">Safety Certifications</Label>
              <div className="flex flex-wrap gap-2">
                {['ANSI A137.1', 'DIN 51130', 'DIN 51097', 'BS 7976', 'AS/NZS 4586'].map(cert => (
                  <Button
                    key={cert}
                    variant={filters.propertyFilters.slipSafetyRatings?.safetyCertifications?.includes(cert) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.slipSafetyRatings?.safetyCertifications || [];
                      const newValues = currentValues.includes(cert)
                        ? currentValues.filter(v => v !== cert)
                        : [...currentValues, cert];
                      updatePropertyFilter('slipSafetyRatings', 'safetyCertifications', newValues);
                    }}
                    className="text-xs"
                  >
                    {cert}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'surfaceGlossReflectivity':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-600" />
              <Label className="font-medium">✨ Surface Gloss/Reflectivity</Label>
            </div>
            
            {/* Gloss Level Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Gloss Level</Label>
              <div className="grid grid-cols-2 gap-2">
                {['super-polished', 'polished', 'satin', 'semi-polished', 'matte', 'velvet', 'anti-glare'].map(level => (
                  <Button
                    key={level}
                    variant={filters.propertyFilters.surfaceGlossReflectivity?.glossLevel?.includes(level) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.surfaceGlossReflectivity?.glossLevel || [];
                      const newValues = currentValues.includes(level)
                        ? currentValues.filter(v => v !== level)
                        : [...currentValues, level];
                      updatePropertyFilter('surfaceGlossReflectivity', 'glossLevel', newValues);
                    }}
                    className="text-xs capitalize"
                  >
                    {level.replace('-', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Gloss Value Range */}
            <div className="space-y-2">
              <Label className="text-sm">Gloss Value (0-100)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.surfaceGlossReflectivity?.glossValueRange || [0, 100]}
                  onValueChange={(value) => updatePropertyFilter('surfaceGlossReflectivity', 'glossValueRange', value as [number, number])}
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.surfaceGlossReflectivity?.glossValueRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.surfaceGlossReflectivity?.glossValueRange?.[1] || 100}</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'mechanicalPropertiesExtended':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Hammer className="h-4 w-4 text-blue-600" />
              <Label className="font-medium">🔧 Mechanical Properties</Label>
            </div>
            
            {/* Mohs Hardness Range */}
            <div className="space-y-2">
              <Label className="text-sm">Mohs Hardness (1-10)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.mechanicalPropertiesExtended?.mohsHardnessRange || [1, 10]}
                  onValueChange={(value) => updatePropertyFilter('mechanicalPropertiesExtended', 'mohsHardnessRange', value as [number, number])}
                  max={10}
                  min={1}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.mechanicalPropertiesExtended?.mohsHardnessRange?.[0] || 1}</span>
                  <span>{filters.propertyFilters.mechanicalPropertiesExtended?.mohsHardnessRange?.[1] || 10}</span>
                </div>
              </div>
            </div>

            {/* PEI Rating Selection */}
            <div className="space-y-2">
              <Label className="text-sm">PEI Rating (Class 0-5)</Label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5].map(rating => (
                  <Button
                    key={rating}
                    variant={filters.propertyFilters.mechanicalPropertiesExtended?.peiRating?.includes(rating) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.mechanicalPropertiesExtended?.peiRating || [];
                      const newValues = currentValues.includes(rating)
                        ? currentValues.filter(v => v !== rating)
                        : [...currentValues, rating];
                      updatePropertyFilter('mechanicalPropertiesExtended', 'peiRating', newValues);
                    }}
                    className="text-xs"
                  >
                    Class {rating}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'thermalProperties':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-orange-600" />
              <Label className="font-medium">🌡️ Thermal Properties</Label>
            </div>
            
            {/* Thermal Conductivity Range */}
            <div className="space-y-2">
              <Label className="text-sm">Thermal Conductivity Range (W/mK)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.thermalProperties?.thermalConductivityRange || [0, 10]}
                  onValueChange={(value) => updatePropertyFilter('thermalProperties', 'thermalConductivityRange', value as [number, number])}
                  max={10}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.thermalProperties?.thermalConductivityRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.thermalProperties?.thermalConductivityRange?.[1] || 10}</span>
                </div>
              </div>
            </div>

            {/* Heat Resistance Range */}
            <div className="space-y-2">
              <Label className="text-sm">Heat Resistance (°C)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.thermalProperties?.heatResistanceRange || [0, 500]}
                  onValueChange={(value) => updatePropertyFilter('thermalProperties', 'heatResistanceRange', value as [number, number])}
                  max={500}
                  min={0}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.thermalProperties?.heatResistanceRange?.[0] || 0}°C</span>
                  <span>{filters.propertyFilters.thermalProperties?.heatResistanceRange?.[1] || 500}°C</span>
                </div>
              </div>
            </div>

            {/* Radiant Heating Compatible */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="radiantHeating"
                checked={filters.propertyFilters.thermalProperties?.radiantHeatingCompatible || false}
                onCheckedChange={(checked) => updatePropertyFilter('thermalProperties', 'radiantHeatingCompatible', !!checked)}
              />
              <Label htmlFor="radiantHeating" className="text-sm">Radiant Heating Compatible</Label>
            </div>
          </div>
        );

      case 'waterMoistureResistance':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-cyan-600" />
              <Label className="font-medium">💧 Water/Moisture Resistance</Label>
            </div>
            
            {/* Water Absorption Range */}
            <div className="space-y-2">
              <Label className="text-sm">Water Absorption Range (%)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.waterMoistureResistance?.waterAbsorptionRange || [0, 20]}
                  onValueChange={(value) => updatePropertyFilter('waterMoistureResistance', 'waterAbsorptionRange', value as [number, number])}
                  max={20}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.waterMoistureResistance?.waterAbsorptionRange?.[0] || 0}%</span>
                  <span>{filters.propertyFilters.waterMoistureResistance?.waterAbsorptionRange?.[1] || 20}%</span>
                </div>
              </div>
            </div>

            {/* Frost Resistance */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="frostResistance"
                checked={filters.propertyFilters.waterMoistureResistance?.frostResistance || false}
                onCheckedChange={(checked) => updatePropertyFilter('waterMoistureResistance', 'frostResistance', !!checked)}
              />
              <Label htmlFor="frostResistance" className="text-sm">Frost Resistance</Label>
            </div>

            {/* Mold/Mildew Resistant */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="moldMildewResistant"
                checked={filters.propertyFilters.waterMoistureResistance?.moldMildewResistant || false}
                onCheckedChange={(checked) => updatePropertyFilter('waterMoistureResistance', 'moldMildewResistant', !!checked)}
              />
              <Label htmlFor="moldMildewResistant" className="text-sm">Mold/Mildew Resistant</Label>
            </div>
          </div>
        );

      case 'chemicalHygieneResistance':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-600" />
              <Label className="font-medium">🧪 Chemical/Hygiene Resistance</Label>
            </div>
            
            {/* Acid Resistance */}
            <div className="space-y-2">
              <Label className="text-sm">Acid Resistance Level</Label>
              <div className="flex flex-wrap gap-2">
                {['low', 'medium', 'high', 'excellent'].map(level => (
                  <Button
                    key={level}
                    variant={filters.propertyFilters.chemicalHygieneResistance?.acidResistance?.includes(level) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.chemicalHygieneResistance?.acidResistance || [];
                      const newValues = currentValues.includes(level)
                        ? currentValues.filter(v => v !== level)
                        : [...currentValues, level];
                      updatePropertyFilter('chemicalHygieneResistance', 'acidResistance', newValues);
                    }}
                    className="text-xs capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            {/* Alkali Resistance */}
            <div className="space-y-2">
              <Label className="text-sm">Alkali Resistance Level</Label>
              <div className="flex flex-wrap gap-2">
                {['low', 'medium', 'high', 'excellent'].map(level => (
                  <Button
                    key={level}
                    variant={filters.propertyFilters.chemicalHygieneResistance?.alkaliResistance?.includes(level) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.chemicalHygieneResistance?.alkaliResistance || [];
                      const newValues = currentValues.includes(level)
                        ? currentValues.filter(v => v !== level)
                        : [...currentValues, level];
                      updatePropertyFilter('chemicalHygieneResistance', 'alkaliResistance', newValues);
                    }}
                    className="text-xs capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            {/* Stain Resistance Class */}
            <div className="space-y-2">
              <Label className="text-sm">Stain Resistance Class</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map(classNum => (
                  <Button
                    key={classNum}
                    variant={filters.propertyFilters.chemicalHygieneResistance?.stainResistanceClass?.includes(classNum) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.chemicalHygieneResistance?.stainResistanceClass || [];
                      const newValues = currentValues.includes(classNum)
                        ? currentValues.filter(v => v !== classNum)
                        : [...currentValues, classNum];
                      updatePropertyFilter('chemicalHygieneResistance', 'stainResistanceClass', newValues);
                    }}
                    className="text-xs"
                  >
                    Class {classNum}
                  </Button>
                ))}
              </div>
            </div>

            {/* Food Safe Certified */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="foodSafeCertified"
                checked={filters.propertyFilters.chemicalHygieneResistance?.foodSafeCertified || false}
                onCheckedChange={(checked) => updatePropertyFilter('chemicalHygieneResistance', 'foodSafeCertified', !!checked)}
              />
              <Label htmlFor="foodSafeCertified" className="text-sm">Food Safe Certified</Label>
            </div>
          </div>
        );

      case 'acousticElectricalProperties':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-indigo-600" />
              <Label className="font-medium">🔊 Acoustic/Electrical Properties</Label>
            </div>
            
            {/* NRC Range */}
            <div className="space-y-2">
              <Label className="text-sm">Noise Reduction Coefficient (NRC)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.acousticElectricalProperties?.nrcRange || [0, 1]}
                  onValueChange={(value) => updatePropertyFilter('acousticElectricalProperties', 'nrcRange', value as [number, number])}
                  max={1}
                  min={0}
                  step={0.01}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.acousticElectricalProperties?.nrcRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.acousticElectricalProperties?.nrcRange?.[1] || 1}</span>
                </div>
              </div>
            </div>

            {/* Anti-Static */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="antiStatic"
                checked={filters.propertyFilters.acousticElectricalProperties?.antiStatic || false}
                onCheckedChange={(checked) => updatePropertyFilter('acousticElectricalProperties', 'antiStatic', !!checked)}
              />
              <Label htmlFor="antiStatic" className="text-sm">Anti-Static Properties</Label>
            </div>

            {/* Conductive */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="conductive"
                checked={filters.propertyFilters.acousticElectricalProperties?.conductive || false}
                onCheckedChange={(checked) => updatePropertyFilter('acousticElectricalProperties', 'conductive', !!checked)}
              />
              <Label htmlFor="conductive" className="text-sm">Electrically Conductive</Label>
            </div>
          </div>
        );

      case 'environmentalSustainability':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-600" />
              <Label className="font-medium">🌱 Environmental/Sustainability</Label>
            </div>
            
            {/* Greenguard Level */}
            <div className="space-y-2">
              <Label className="text-sm">Greenguard Certification</Label>
              <div className="flex flex-wrap gap-2">
                {['certified', 'gold', 'none'].map(level => (
                  <Button
                    key={level}
                    variant={filters.propertyFilters.environmentalSustainability?.greenguardLevel?.includes(level) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.environmentalSustainability?.greenguardLevel || [];
                      const newValues = currentValues.includes(level)
                        ? currentValues.filter(v => v !== level)
                        : [...currentValues, level];
                      updatePropertyFilter('environmentalSustainability', 'greenguardLevel', newValues);
                    }}
                    className="text-xs capitalize"
                  >
                    {level === 'none' ? 'Not Certified' : `Greenguard ${level}`}
                  </Button>
                ))}
              </div>
            </div>

            {/* Recycled Content Range */}
            <div className="space-y-2">
              <Label className="text-sm">Recycled Content (%)</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.environmentalSustainability?.totalRecycledContentRange || [0, 100]}
                  onValueChange={(value) => updatePropertyFilter('environmentalSustainability', 'totalRecycledContentRange', value as [number, number])}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.environmentalSustainability?.totalRecycledContentRange?.[0] || 0}%</span>
                  <span>{filters.propertyFilters.environmentalSustainability?.totalRecycledContentRange?.[1] || 100}%</span>
                </div>
              </div>
            </div>

            {/* LEED Credits Range */}
            <div className="space-y-2">
              <Label className="text-sm">LEED Credits Available</Label>
              <div className="px-2">
                <Slider
                  value={filters.propertyFilters.environmentalSustainability?.leedCreditsRange || [0, 10]}
                  onValueChange={(value) => updatePropertyFilter('environmentalSustainability', 'leedCreditsRange', value as [number, number])}
                  max={10}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{filters.propertyFilters.environmentalSustainability?.leedCreditsRange?.[0] || 0}</span>
                  <span>{filters.propertyFilters.environmentalSustainability?.leedCreditsRange?.[1] || 10}</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'dimensionalAesthetic':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-pink-600" />
              <Label className="font-medium">📏 Dimensional/Aesthetic</Label>
            </div>
            
            {/* Rectified Edges */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rectifiedEdges"
                checked={filters.propertyFilters.dimensionalAesthetic?.rectifiedEdges || false}
                onCheckedChange={(checked) => updatePropertyFilter('dimensionalAesthetic', 'rectifiedEdges', !!checked)}
              />
              <Label htmlFor="rectifiedEdges" className="text-sm">Rectified Edges</Label>
            </div>

            {/* Texture Rated */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="textureRatingRange"
                checked={!!(filters.propertyFilters.dimensionalAesthetic?.textureRatingRange?.length)}
                onCheckedChange={(checked) => updatePropertyFilter('dimensionalAesthetic', 'textureRatingRange', !!checked)}
              />
              <Label htmlFor="textureRatingRange" className="text-sm">Texture Rated</Label>
            </div>

            {/* Shade Variation */}
            <div className="space-y-2">
              <Label className="text-sm">Shade Variation</Label>
              <div className="flex flex-wrap gap-2">
                {['V1', 'V2', 'V3', 'V4'].map(variation => (
                  <Button
                    key={variation}
                    variant={filters.propertyFilters.dimensionalAesthetic?.shadeVariation?.includes(variation) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const currentValues = filters.propertyFilters.dimensionalAesthetic?.shadeVariation || [];
                      const newValues = currentValues.includes(variation)
                        ? currentValues.filter(v => v !== variation)
                        : [...currentValues, variation];
                      updatePropertyFilter('dimensionalAesthetic', 'shadeVariation', newValues);
                    }}
                    className="text-xs"
                  >
                    {variation}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                V1: Uniform • V2: Slight • V3: Moderate • V4: Substantial
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="p-4 text-sm text-muted-foreground">
            Category filters for &quot;{category}&quot; are not yet implemented.
          </div>
        );
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="p-4">
        <CardTitle className="text-sm">Category-Specific Filters</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {renderCategorySpecificFilters()}
      </CardContent>
    </Card>
  );
};

export default FunctionalCategoryFilters;