/**
 * Model-specific parameter configurations for Replicate API
 * Addresses 422 Unprocessable Entity errors by providing correct parameter schemas for each model
 */

export interface ModelParameter {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'enum';
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}

export interface ModelConfig {
  modelId: string;
  displayName: string;
  category: 'interior-design' | 'material-analysis' | 'image-enhancement';
  parameters: Record<string, ModelParameter>;
  outputType: 'uri' | 'array' | 'object';
  description: string;
  status: 'working' | 'failing' | 'untested';
  version?: string;
  capabilities?: string[];
  imageInputParam?: string;
  name?: string;
  lastTested?: string;
}

/**
 * Interior Design Model Configurations
 * Based on actual API schema research from Replicate model pages
 */
export const INTERIOR_DESIGN_MODELS: Record<string, ModelConfig> = {
  // WORKING MODELS (3/7)
  'jschoormans/comfyui-interior-remodel': {
    modelId: 'jschoormans/comfyui-interior-remodel',
    displayName: 'ComfyUI Interior Remodel',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Interior design remodeling using ComfyUI workflow',
    version: 'jschoormans/comfyui-interior-remodel:latest',
    capabilities: ['image-to-image'],
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: 'Input image URL',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Text description of desired interior design',
      },
      seed: {
        type: 'integer',
        required: false,
        description: 'Random seed for reproducible results',
      },
    },
  },

  'julian-at/interiorly-gen1-dev': {
    modelId: 'julian-at/interiorly-gen1-dev',
    displayName: 'Interiorly Gen1 Dev',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Interior design generation model',
    version: 'julian-at/interiorly-gen1-dev:latest',
    capabilities: ['image-to-image'],
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: 'Input image URL',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Interior design prompt',
      },
      seed: {
        type: 'integer',
        required: false,
        description: 'Random seed',
      },
    },
  },

  'davisbrown/designer-architecture': {
    modelId: 'davisbrown/designer-architecture',
    displayName: 'Designer Architecture',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Architectural and interior design generation',
    version: 'davisbrown/designer-architecture:latest',
    capabilities: ['image-to-image'],
    parameters: {
      mask: {
        type: 'string',
        required: true,
        description: 'Mask image URL for inpainting',
      },
      seed: {
        type: 'integer',
        required: false,
        description: 'Random seed for reproducible results',
      },
      image: {
        type: 'string',
        required: true,
        description: 'Input image URL',
      },
      model: {
        type: 'enum',
        required: false,
        default: 'RealVisXL_V4.0',
        options: ['RealVisXL_V4.0', 'juggernaut_reborn'],
        description: 'Base model to use',
      },
      width: {
        type: 'integer',
        required: false,
        default: 1024,
        min: 256,
        max: 1536,
        description: 'Output image width',
      },
      height: {
        type: 'integer',
        required: false,
        default: 1024,
        min: 256,
        max: 1536,
        description: 'Output image height',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Design prompt',
      },
      go_fast: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Enable fast processing mode',
      },
      extra_lora: {
        type: 'string',
        required: false,
        description: 'Additional LoRA model URL',
      },
      lora_scale: {
        type: 'number',
        required: false,
        default: 1,
        min: -1,
        max: 2,
        description: 'LoRA model influence scale',
      },
      megapixels: {
        type: 'enum',
        required: false,
        default: '1',
        options: ['1', '0.25'],
        description: 'Output resolution in megapixels',
      },
    },
  },

  // FAILING MODELS (4/7) - CORRECTED PARAMETER SCHEMAS
  'adirik/interior-design': {
    modelId: 'adirik/interior-design',
    displayName: 'Adirik Interior Design',
    category: 'interior-design',
    status: 'failing',
    outputType: 'uri',
    version: 'adirik/interior-design:latest',
    capabilities: ['image-to-image'],
    imageInputParam: 'image',
    name: 'Adirik Interior Design',
    lastTested: '2025-07-17T06:46:12.820Z',
    description: 'Interior design transformation model',
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: 'Input image URL for transformation',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Interior design prompt',
      },
      negative_prompt: {
        type: 'string',
        required: true,
        default: 'lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional, realistic',
        description: 'Negative prompt to avoid unwanted elements',
      },
      guidance_scale: {
        type: 'number',
        required: true,
        default: 15,
        min: 1,
        max: 20,
        description: 'Guidance scale for generation',
      },
      prompt_strength: {
        type: 'number',
        required: true,
        default: 0.8,
        min: 0.1,
        max: 1.0,
        description: 'Strength of the prompt influence',
      },
      num_inference_steps: {
        type: 'integer',
        required: true,
        default: 50,
        min: 1,
        max: 100,
        description: 'Number of inference steps',
      },
    },
  },

  'erayyavuz/interior-ai': {
    modelId: 'erayyavuz/interior-ai',
    displayName: 'Eray Yavuz Interior AI',
    category: 'interior-design',
    status: 'failing',
    outputType: 'uri',
    version: 'erayyavuz/interior-ai:latest',
    capabilities: ['text-to-image'],
    imageInputParam: 'image',
    name: 'Eray Yavuz Interior AI',
    lastTested: '2025-07-17T03:43:23.553Z',
    description: 'AI-powered interior design generation',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Interior design description',
      },
    },
  },

  'jschoormans/interior-v2': {
    modelId: 'jschoormans/interior-v2',
    displayName: 'Interior V2',
    category: 'interior-design',
    status: 'failing',
    outputType: 'uri',
    version: 'jschoormans/interior-v2:latest',
    capabilities: ['text-to-image'],
    imageInputParam: 'image',
    name: 'Interior V2',
    lastTested: '2025-07-17T03:43:23.553Z',
    description: 'Interior design model version 2',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Design prompt',
      },
    },
  },

  'rocketdigitalai/interior-design-sdxl': {
    modelId: 'rocketdigitalai/interior-design-sdxl',
    displayName: 'Rocket Digital AI Interior Design SDXL',
    category: 'interior-design',
    status: 'failing',
    outputType: 'uri',
    description: 'SDXL-based interior design model',
    version: 'rocketdigitalai/interior-design-sdxl:latest',
    capabilities: ['text-to-image'],
    imageInputParam: 'image',
    name: 'Rocket Digital AI Interior Design SDXL',
    lastTested: '2025-07-17T03:43:23.553Z',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Interior design prompt',
      },
    },
  },
};

/**
 * Parameter validation and transformation utilities
 */
export class ModelParameterValidator {
  /**
   * Validate and transform parameters for a specific model
   */
  static validateAndTransformParameters(
    modelId: string,
    inputParameters: Record<string, unknown>,
  ): Record<string, unknown> {
    const config = INTERIOR_DESIGN_MODELS[modelId];
    if (!config) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const validatedParams: Record<string, unknown> = {};
    const errors: string[] = [];

    // Check required parameters
    for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
      const inputValue = inputParameters[paramName];

      if (paramConfig.required && (inputValue === undefined || inputValue === null)) {
        errors.push(`Required parameter '${paramName}' is missing`);
        continue;
      }

      if (inputValue !== undefined && inputValue !== null) {
        // Validate and transform the parameter
        try {
          validatedParams[paramName] = this.validateParameter(paramName, inputValue, paramConfig);
        } catch (error) {
          errors.push(`Parameter '${paramName}': ${error.message}`);
        }
      } else if (paramConfig.default !== undefined) {
        // Use default value
        validatedParams[paramName] = paramConfig.default;
      }
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed: ${errors.join(', ')}`);
    }

    return validatedParams;
  }

  /**
   * Validate a single parameter
   */
  private static validateParameter(
    name: string,
    value: unknown,
    config: ModelParameter,
  ): unknown {
    switch (config.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Expected string, got ${typeof value}`);
        }
        if (config.options && !config.options.includes(value)) {
          throw new Error(`Must be one of: ${config.options.join(', ')}`);
        }
        return value;

      case 'integer':
        const intValue = parseInt(value);
        if (isNaN(intValue)) {
          throw new Error(`Expected integer, got ${typeof value}`);
        }
        if (config.min !== undefined && intValue < config.min) {
          throw new Error(`Must be >= ${config.min}`);
        }
        if (config.max !== undefined && intValue > config.max) {
          throw new Error(`Must be <= ${config.max}`);
        }
        return intValue;

      case 'number':
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          throw new Error(`Expected number, got ${typeof value}`);
        }
        if (config.min !== undefined && numValue < config.min) {
          throw new Error(`Must be >= ${config.min}`);
        }
        if (config.max !== undefined && numValue > config.max) {
          throw new Error(`Must be <= ${config.max}`);
        }
        return numValue;

      case 'boolean':
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true';
        }
        throw new Error(`Expected boolean, got ${typeof value}`);

      case 'enum':
        if (!config.options) {
          throw new Error('Enum parameter missing options');
        }
        if (!config.options.includes(value)) {
          throw new Error(`Must be one of: ${config.options.join(', ')}`);
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Get available models by category
   */
  static getModelsByCategory(category: string): ModelConfig[] {
    return Object.values(INTERIOR_DESIGN_MODELS).filter(
      model => model.category === category,
    );
  }

  /**
   * Get working models only
   */
  static getWorkingModels(): ModelConfig[] {
    return Object.values(INTERIOR_DESIGN_MODELS).filter(
      model => model.status === 'working',
    );
  }

  /**
   * Get model configuration
   */
  static getModelConfig(modelId: string): ModelConfig | undefined {
    return INTERIOR_DESIGN_MODELS[modelId];
  }
}
