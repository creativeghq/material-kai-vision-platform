/**
 * Demo Agent
 * Admin-only agent for showcasing platform capabilities with realistic demo data
 */

import { Agent, createTool } from '@mastra/core';
import { z } from 'zod';

// Import demo data
import cementTilesData from '@/data/demo/cement-tiles.json';
import greenWoodData from '@/data/demo/green-wood.json';
import design3DData from '@/data/demo/3d-design.json';

/**
 * Demo Product Search Tool
 * Returns demo products based on specific commands
 */
const demoProductSearchTool = createTool({
  id: 'demo-product-search',
  description: 'Search and return demo products for showcasing platform capabilities',
  inputSchema: z.object({
    query: z.string().describe('The search query or command'),
    category: z.string().optional().describe('Product category filter'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    type: z.string().optional(),
    data: z.array(z.any()).optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const query = context.query.toLowerCase();
    
    // Command: "Return for me Cement Based tiles color grey"
    if (query.includes('cement') && query.includes('tile') && query.includes('grey')) {
      return {
        success: true,
        type: 'product_list',
        data: cementTilesData.results,
        message: 'Found 5 cement-based tiles in grey color',
      };
    }
    
    // Command: "I want Green Egger" - wood materials in green
    if ((query.includes('green') && query.includes('egger')) || 
        (query.includes('wood') && query.includes('green'))) {
      return {
        success: true,
        type: 'product_list',
        data: greenWoodData.results,
        message: 'Found 5 Egger wood materials in green',
      };
    }
    
    return {
      success: false,
      message: 'No demo data matches this query. Try: "cement tiles grey" or "green egger"',
    };
  },
});

/**
 * Demo 3D Design Tool
 * Returns a complete 3D design with materials
 */
const demo3DDesignTool = createTool({
  id: 'demo-3d-design',
  description: 'Generate a demo 3D interior design with materials from catalog',
  inputSchema: z.object({
    prompt: z.string().describe('Design prompt or description'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    type: z.string().optional(),
    data: z.any().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const prompt = context.prompt.toLowerCase();
    
    // Command: "Design the interior of a home"
    if (prompt.includes('design') && (prompt.includes('interior') || prompt.includes('home'))) {
      return {
        success: true,
        type: '3d_design',
        data: design3DData.design,
        message: 'Generated modern living room interior design with 6 materials from catalog',
      };
    }
    
    return {
      success: false,
      message: 'Please provide a design prompt like "Design the interior of a home"',
    };
  },
});

/**
 * Demo Heat Pump Data Tool
 * Returns heat pump specifications from PDF
 */
const demoHeatPumpTool = createTool({
  id: 'demo-heat-pump',
  description: 'Retrieve heat pump specifications and models',
  inputSchema: z.object({
    query: z.string().describe('Heat pump query'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    type: z.string().optional(),
    data: z.any().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const query = context.query.toLowerCase();
    
    // Command: "I want heatpumps"
    if (query.includes('heat') && (query.includes('pump') || query.includes('pumps'))) {
      return {
        success: true,
        type: 'heat_pump_table',
        data: {
          models: [
            {
              model: 'EcoHeat Pro 8',
              heating_capacity: '8 kW',
              cooling_capacity: '7 kW',
              energy_efficiency: 'A+++',
              noise_level: '32 dB(A)',
              price_retail: 2800,
              price_wholesale: 2100,
              stock: 65,
            },
            {
              model: 'EcoHeat Pro 12',
              heating_capacity: '12 kW',
              cooling_capacity: '10 kW',
              energy_efficiency: 'A+++',
              noise_level: '35 dB(A)',
              price_retail: 3200,
              price_wholesale: 2400,
              stock: 45,
            },
            {
              model: 'EcoHeat Pro 16',
              heating_capacity: '16 kW',
              cooling_capacity: '14 kW',
              energy_efficiency: 'A++',
              noise_level: '38 dB(A)',
              price_retail: 3800,
              price_wholesale: 2850,
              stock: 28,
            },
            {
              model: 'EcoHeat Ultra 20',
              heating_capacity: '20 kW',
              cooling_capacity: '18 kW',
              energy_efficiency: 'A++',
              noise_level: '40 dB(A)',
              price_retail: 4500,
              price_wholesale: 3400,
              stock: 15,
            },
          ],
          specifications: {
            refrigerant: 'R32',
            power_supply: '230V/50Hz',
            warranty: '5 years',
            certifications: ['ErP', 'CE', 'ISO 9001'],
            factory: 'EcoClimate Systems',
            origin: 'Germany',
          },
        },
        message: 'Retrieved 4 heat pump models with specifications',
      };
    }
    
    return {
      success: false,
      message: 'Please ask about heat pumps',
    };
  },
});

/**
 * Demo Agent Instance
 */
export const demoAgent = new Agent({
  name: 'demo-agent',
  description: 'Showcase platform capabilities with realistic demo data',
  instructions: `You are a Demo Agent designed to showcase the Material Kai Vision Platform's capabilities.

**Your Role:**
- Demonstrate product search and display functionality
- Show 3D design generation with material integration
- Display heat pump specifications in table format
- Provide realistic, professional responses

**Available Commands:**
1. "Return for me Cement Based tiles color grey" → Show 5 cement tiles in grey
2. "I want Green Egger" → Show 5 Egger wood materials in green
3. "I want heatpumps" → Display heat pump models in table format
4. "Design the interior of a home" → Generate 3D design with materials

**Response Format:**
- Always return structured data that can be displayed as product cards
- Include all metadata: SKU, pricing, stock, images, specifications
- For 3D designs, include the design image and all materials used
- For heat pumps, format as a comparison table

**Important:**
- This is demo data for showcasing purposes
- All products are realistic examples from our catalog
- Maintain professional tone and detailed information`,
  
  model: 'anthropic/claude-sonnet-4-20250514',
  
  tools: {
    demoProductSearch: demoProductSearchTool,
    demo3DDesign: demo3DDesignTool,
    demoHeatPump: demoHeatPumpTool,
  },
});

export default demoAgent;

