/**
 * Grout Color Constants
 * Comprehensive list of grout colors with RGB values for AI-powered suggestions
 */

export interface GroutColor {
  name: string;
  code?: string; // Optional code for specific brands
  rgb: [number, number, number];
  hex: string;
  category: 'neutral' | 'warm' | 'cool' | 'dark' | 'light' | 'accent';
  description?: string;
}

/**
 * Standard grout colors used across all brands
 * These colors are commonly available from Mapei, Kerakoll, Isomat, and Technica
 */
export const STANDARD_GROUT_COLORS: GroutColor[] = [
  // Neutral/White tones
  { name: 'White', rgb: [255, 255, 255], hex: '#FFFFFF', category: 'light', description: 'Pure white' },
  { name: 'Ivory', rgb: [255, 255, 240], hex: '#FFFFF0', category: 'light', description: 'Soft off-white' },
  { name: 'Cream', rgb: [255, 253, 208], hex: '#FFFDD0', category: 'light', description: 'Warm cream' },
  { name: 'Vanilla', rgb: [243, 229, 171], hex: '#F3E5AB', category: 'light', description: 'Light vanilla' },

  // Light grays
  { name: 'Silver', rgb: [192, 192, 192], hex: '#C0C0C0', category: 'neutral', description: 'Light silver gray' },
  { name: 'Pearl Gray', rgb: [188, 184, 178], hex: '#BCB8B2', category: 'neutral', description: 'Soft pearl gray' },
  { name: 'Light Gray', rgb: [211, 211, 211], hex: '#D3D3D3', category: 'neutral', description: 'Light neutral gray' },
  { name: 'Mist Gray', rgb: [200, 200, 200], hex: '#C8C8C8', category: 'neutral', description: 'Misty gray' },

  // Medium grays
  { name: 'Gray', rgb: [128, 128, 128], hex: '#808080', category: 'neutral', description: 'Medium gray' },
  { name: 'Cement Gray', rgb: [145, 145, 145], hex: '#919191', category: 'neutral', description: 'Cement-like gray' },
  { name: 'Stone Gray', rgb: [150, 150, 150], hex: '#969696', category: 'neutral', description: 'Natural stone gray' },
  { name: 'Concrete', rgb: [140, 140, 140], hex: '#8C8C8C', category: 'neutral', description: 'Concrete gray' },

  // Dark grays
  { name: 'Anthracite', rgb: [40, 40, 40], hex: '#282828', category: 'dark', description: 'Deep anthracite' },
  { name: 'Charcoal', rgb: [54, 69, 79], hex: '#36454F', category: 'dark', description: 'Charcoal gray' },
  { name: 'Graphite', rgb: [66, 66, 66], hex: '#424242', category: 'dark', description: 'Graphite gray' },
  { name: 'Black', rgb: [0, 0, 0], hex: '#000000', category: 'dark', description: 'Pure black' },

  // Beige/Sand tones
  { name: 'Beige', rgb: [245, 245, 220], hex: '#F5F5DC', category: 'warm', description: 'Classic beige' },
  { name: 'Sand', rgb: [194, 178, 128], hex: '#C2B280', category: 'warm', description: 'Sandy beige' },
  { name: 'Sahara', rgb: [210, 180, 140], hex: '#D2B48C', category: 'warm', description: 'Desert sand' },
  { name: 'Almond', rgb: [239, 222, 205], hex: '#EFDECD', category: 'warm', description: 'Almond beige' },
  { name: 'Caramel', rgb: [175, 141, 95], hex: '#AF8D5F', category: 'warm', description: 'Caramel brown' },

  // Brown tones
  { name: 'Clay', rgb: [178, 140, 110], hex: '#B28C6E', category: 'warm', description: 'Natural clay' },
  { name: 'Terracotta', rgb: [204, 78, 92], hex: '#CC4E5C', category: 'warm', description: 'Terracotta red-brown' },
  { name: 'Chocolate', rgb: [123, 63, 0], hex: '#7B3F00', category: 'dark', description: 'Dark chocolate' },
  { name: 'Mocha', rgb: [135, 84, 64], hex: '#875440', category: 'warm', description: 'Mocha brown' },
  { name: 'Walnut', rgb: [92, 64, 51], hex: '#5C4033', category: 'dark', description: 'Walnut brown' },

  // Taupe/Greige
  { name: 'Taupe', rgb: [72, 60, 50], hex: '#483C32', category: 'neutral', description: 'Classic taupe' },
  { name: 'Greige', rgb: [133, 127, 116], hex: '#857F74', category: 'neutral', description: 'Gray-beige blend' },
  { name: 'Mushroom', rgb: [150, 130, 110], hex: '#96826E', category: 'neutral', description: 'Mushroom taupe' },

  // Green tones
  { name: 'Green', rgb: [0, 128, 0], hex: '#008000', category: 'accent', description: 'Medium green' },
  { name: 'Sage', rgb: [188, 184, 138], hex: '#BCB88A', category: 'cool', description: 'Sage green' },
  { name: 'Olive', rgb: [128, 128, 0], hex: '#808000', category: 'accent', description: 'Olive green' },
  { name: 'Mint', rgb: [189, 252, 201], hex: '#BDFCC9', category: 'cool', description: 'Mint green' },

  // Blue tones
  { name: 'Blue', rgb: [0, 0, 255], hex: '#0000FF', category: 'cool', description: 'Medium blue' },
  { name: 'Sky Blue', rgb: [135, 206, 235], hex: '#87CEEB', category: 'cool', description: 'Sky blue' },
  { name: 'Navy', rgb: [0, 0, 128], hex: '#000080', category: 'dark', description: 'Navy blue' },
  { name: 'Teal', rgb: [0, 128, 128], hex: '#008080', category: 'cool', description: 'Teal blue-green' },

  // Other accent colors
  { name: 'Burgundy', rgb: [128, 0, 32], hex: '#800020', category: 'accent', description: 'Deep burgundy' },
  { name: 'Terracotta Red', rgb: [226, 114, 91], hex: '#E2725B', category: 'warm', description: 'Terracotta red' },
  { name: 'Rust', rgb: [183, 65, 14], hex: '#B7410E', category: 'warm', description: 'Rust orange-brown' },
];

/**
 * Brand-specific grout color codes
 * Maps common color names to brand-specific product codes
 */
export const BRAND_COLOR_CODES = {
  mapei: {
    'White': '100',
    'Ivory': '102',
    'Silver': '103',
    'Sand': '2',
    'Beige': '132',
    'Clay': '145',
    'Anthracite': '114',
    'Black': '120',
    'Green': '19',
    'Chocolate': '144',
    'Vanilla': '130',
    'Bahama Beige': '84',
    'Warm Gray': '165',
    'Pewter': '165',
    'Charcoal': '381',
  },
  kerakoll: {
    'White': '1',
    'Ivory': '2',
    'Silver': '5',
    'Sand': '43',
    'Taupe': '44',
    'Anthracite': '10',
    'Black': '20',
    'Green': '19',
    'Chocolate': '46',
    'Pearl Gray': '3',
    'Cement Gray': '4',
    'Graphite': '11',
  },
  isomat: {
    'White': '01',
    'Ivory': '02',
    'Silver': '03',
    'Sand': '04',
    'Beige': '05',
    'Gray': '06',
    'Anthracite': '07',
    'Black': '08',
    'Chocolate': '09',
    'Terracotta': '10',
  },
  technica: {
    'White': 'W-01',
    'Ivory': 'W-02',
    'Silver': 'G-01',
    'Sand': 'B-01',
    'Beige': 'B-02',
    'Gray': 'G-02',
    'Anthracite': 'G-03',
    'Black': 'B-03',
    'Chocolate': 'BR-01',
  },
};

/**
 * Get grout color by name
 */
export function getGroutColorByName(name: string): GroutColor | undefined {
  return STANDARD_GROUT_COLORS.find(
    (color) => color.name.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * Get grout colors by category
 */
export function getGroutColorsByCategory(category: GroutColor['category']): GroutColor[] {
  return STANDARD_GROUT_COLORS.filter((color) => color.category === category);
}

/**
 * Find closest grout color to RGB value
 */
export function findClosestGroutColor(rgb: [number, number, number]): GroutColor {
  let minDistance = Infinity;
  let closestColor = STANDARD_GROUT_COLORS[0];

  for (const color of STANDARD_GROUT_COLORS) {
    const distance = Math.sqrt(
      Math.pow(rgb[0] - color.rgb[0], 2) +
      Math.pow(rgb[1] - color.rgb[1], 2) +
      Math.pow(rgb[2] - color.rgb[2], 2),
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  return closestColor;
}

