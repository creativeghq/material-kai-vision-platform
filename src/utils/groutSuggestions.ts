/**
 * Grout Suggestion Utility
 * AI-powered grout recommendations based on product colors and metadata
 */

import {
  STANDARD_GROUT_COLORS,
  BRAND_COLOR_CODES,
  findClosestGroutColor,
  type GroutColor,
} from '@/constants/groutColors';

export interface GroutSuggestion {
  brand: 'mapei' | 'kerakoll' | 'isomat' | 'technica';
  productName: string;
  colorName: string;
  colorCode?: string;
  confidence: number;
  reasoning: string;
}

export interface GroutRecommendations {
  mapei?: GroutSuggestion;
  kerakoll?: GroutSuggestion;
  isomat?: GroutSuggestion;
  technica?: GroutSuggestion;
  suggestedColors: string[];
}

/**
 * Parse color string to RGB values
 */
function parseColorToRGB(colorStr: string): [number, number, number] | null {
  const colorMap: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    ivory: [255, 255, 240],
    cream: [255, 253, 208],
    beige: [245, 245, 220],
    sand: [194, 178, 128],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    silver: [192, 192, 192],
    black: [0, 0, 0],
    anthracite: [40, 40, 40],
    charcoal: [54, 69, 79],
    brown: [165, 42, 42],
    chocolate: [123, 63, 0],
    clay: [178, 140, 110],
    taupe: [72, 60, 50],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    red: [255, 0, 0],
    terracotta: [204, 78, 92],
  };

  const normalized = colorStr.toLowerCase().trim();
  return colorMap[normalized] || null;
}

/**
 * Extract dominant color from product metadata
 */
function extractDominantColor(metadata: Record<string, any>): string | null {
  // Try various color fields
  const colorFields = [
    'color',
    'color_name',
    'colors',
    'dominant_color',
    'primary_color',
  ];

  for (const field of colorFields) {
    const value = metadata[field] || metadata.appearance?.[field];
    if (value) {
      if (Array.isArray(value)) {
        return value[0]; // Take first color
      }
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return null;
}

/**
 * Suggest grout color based on product color
 */
function suggestGroutColorForProduct(
  productColor: string | null,
  metadata: Record<string, any>,
): GroutColor[] {
  const suggestions: GroutColor[] = [];

  if (!productColor) {
    // Default suggestions for unknown colors
    return [
      STANDARD_GROUT_COLORS.find((c) => c.name === 'Gray')!,
      STANDARD_GROUT_COLORS.find((c) => c.name === 'White')!,
      STANDARD_GROUT_COLORS.find((c) => c.name === 'Beige')!,
    ];
  }

  // Parse product color to RGB
  const productRGB = parseColorToRGB(productColor);

  if (productRGB) {
    // Find closest matching grout color
    const closestColor = findClosestGroutColor(productRGB);
    suggestions.push(closestColor);

    // Add complementary suggestions based on color category
    if (closestColor.category === 'light') {
      // For light tiles, suggest light grays or matching tones
      suggestions.push(
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Light Gray')!,
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Silver')!,
      );
    } else if (closestColor.category === 'dark') {
      // For dark tiles, suggest dark grays
      suggestions.push(
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Anthracite')!,
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Charcoal')!,
      );
    } else if (closestColor.category === 'warm') {
      // For warm tiles, suggest warm tones
      suggestions.push(
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Sand')!,
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Beige')!,
      );
    } else {
      // Neutral suggestions
      suggestions.push(
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Gray')!,
        STANDARD_GROUT_COLORS.find((c) => c.name === 'Cement Gray')!,
      );
    }
  } else {
    // Fallback: suggest based on color name
    const matchingColor = STANDARD_GROUT_COLORS.find(
      (c) => c.name.toLowerCase() === productColor.toLowerCase(),
    );
    if (matchingColor) {
      suggestions.push(matchingColor);
    }
  }

  // Remove duplicates and limit to 3
  const uniqueSuggestions = suggestions.filter(
    (color, index, self) =>
      index === self.findIndex((c) => c.name === color.name),
  );

  return uniqueSuggestions.slice(0, 3);
}

/**
 * Generate grout recommendations for all brands
 */
export function generateGroutRecommendations(
  metadata: Record<string, any>,
): GroutRecommendations {
  const dominantColor = extractDominantColor(metadata);
  const suggestedColors = suggestGroutColorForProduct(dominantColor, metadata);

  const recommendations: GroutRecommendations = {
    suggestedColors: suggestedColors.map((c) => c.name),
  };

  // Generate brand-specific recommendations
  const brands: Array<'mapei' | 'kerakoll' | 'isomat' | 'technica'> = [
    'mapei',
    'kerakoll',
    'isomat',
    'technica',
  ];

  for (const brand of brands) {
    const primaryColor = suggestedColors[0];
    if (primaryColor) {
      const colorCode = BRAND_COLOR_CODES[brand][primaryColor.name];

      recommendations[brand] = {
        brand,
        productName: getProductNameForBrand(brand),
        colorName: primaryColor.name,
        colorCode,
        confidence: dominantColor ? 0.85 : 0.6,
        reasoning: dominantColor
          ? `Suggested based on product color: ${dominantColor}`
          : 'Default suggestion - no color information available',
      };
    }
  }

  return recommendations;
}

/**
 * Get standard product name for each brand
 */
function getProductNameForBrand(
  brand: 'mapei' | 'kerakoll' | 'isomat' | 'technica',
): string {
  const productNames = {
    mapei: 'ULTRACOLOR PLUS',
    kerakoll: 'FUGABELLA',
    isomat: 'MULTIFILL EPOXY',
    technica: 'GROUT PREMIUM',
  };

  return productNames[brand];
}

/**
 * Format grout suggestion for display
 */
export function formatGroutSuggestion(suggestion: GroutSuggestion): string {
  if (suggestion.colorCode) {
    return `${suggestion.productName} - ${suggestion.colorName} (${suggestion.colorCode})`;
  }
  return `${suggestion.productName} - ${suggestion.colorName}`;
}

