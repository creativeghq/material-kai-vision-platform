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

  'adirik/interior-design': {
    modelId: 'adirik/interior-design',
    displayName: 'Adirik Interior Design',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Interior design transformation using ControlNet depth',
    capabilities: ['image-to-image'],
    imageInputParam: 'image',
    parameters: {
      image: { type: 'string', required: true, description: 'Input room image URL' },
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      negative_prompt: { type: 'string', required: false, description: 'Things to avoid' },
      num_inference_steps: { type: 'integer', required: false, default: 25, min: 1, max: 100 },
      guidance_scale: { type: 'number', required: false, default: 7.5, min: 1, max: 20 },
      prompt_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1, description: 'Strength of prompt influence on image' },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'erayyavuz/interior-ai': {
    modelId: 'erayyavuz/interior-ai',
    displayName: 'Interior AI',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Lifelike interior designs from text descriptions and image references',
    version: 'e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9',
    capabilities: ['image-to-image'],
    imageInputParam: 'input', // NOTE: this model uses 'input', not 'image'
    parameters: {
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      input: { type: 'string', required: true, description: 'Reference room image URL' }, // 'input', not 'image'
      negative_prompt: { type: 'string', required: false, description: 'Elements to avoid' },
      num_inference_steps: { type: 'integer', required: false, default: 50, min: 1, max: 500 },
      guidance_scale: { type: 'number', required: false, default: 7.5, min: 1, max: 50 },
      strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1 },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'doobls-ai/interor-2': {
    modelId: 'doobls-ai/interor-2',
    displayName: 'Interior 2 (Flux)',
    category: 'interior-design',
    status: 'working',
    outputType: 'array',
    description: 'Flux LoRA interior design — fast generation with image-to-image support',
    version: '91f2ef63c76a73d2ec4c67cf7b2a9672e074046cf4fde1d98e46a5829f7ea68b',
    capabilities: ['image-to-image', 'text-to-image'],
    imageInputParam: 'image',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      image: { type: 'string', required: false, description: 'Input room image URL for img2img' },
      prompt_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1 },
      aspect_ratio: { type: 'enum', required: false, default: '1:1', options: ['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21'] },
      num_inference_steps: { type: 'integer', required: false, default: 28, min: 1, max: 50 },
      guidance_scale: { type: 'number', required: false, default: 3, min: 0, max: 10 },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'rihan-a/colourful_interiors': {
    modelId: 'rihan-a/colourful_interiors',
    displayName: 'Colourful Interiors (Flux)',
    category: 'interior-design',
    status: 'working',
    outputType: 'array',
    description: 'Flux LoRA for vibrant colourful interiors. Trigger word: INTR',
    version: 'ba0425bc2e4bebafa8bd918519fdf3b5a022969a6a7c8ba0746b807bb5b541a3',
    capabilities: ['image-to-image', 'text-to-image'],
    imageInputParam: 'image',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Interior design description (include trigger word INTR)' },
      image: { type: 'string', required: false, description: 'Input room image URL for img2img' },
      prompt_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1 },
      aspect_ratio: { type: 'enum', required: false, default: '1:1', options: ['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21'] },
      num_inference_steps: { type: 'integer', required: false, default: 28, min: 1, max: 50 },
      guidance_scale: { type: 'number', required: false, default: 3, min: 0, max: 10 },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'pointblack/stable-interiors-v2': {
    modelId: 'pointblack/stable-interiors-v2',
    displayName: 'Stable Interiors V2',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'SD-based img2img interior transformation with detailed quality defaults',
    version: '569b1bd6e4df6c9c900ad932d4a3a9f05585fac957dc6bc627aa1654853a97b5',
    capabilities: ['image-to-image'],
    imageInputParam: 'image',
    parameters: {
      image: { type: 'string', required: true, description: 'Input room image URL' },
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      negative_prompt: { type: 'string', required: false, description: 'Elements to avoid' },
      num_inference_steps: { type: 'integer', required: false, default: 50 },
      guidance_scale: { type: 'number', required: false, default: 15 },
      prompt_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1 },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'youzu/stable-interiors-v2': {
    modelId: 'youzu/stable-interiors-v2',
    displayName: 'Stable Interiors V2 (Fast)',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Fast SD-based img2img interior transformation (~12s)',
    version: '4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf',
    capabilities: ['image-to-image'],
    imageInputParam: 'image',
    parameters: {
      image: { type: 'string', required: true, description: 'Input room image URL' },
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      negative_prompt: { type: 'string', required: false, description: 'Elements to avoid' },
      num_inference_steps: { type: 'integer', required: false, default: 50 },
      guidance_scale: { type: 'number', required: false, default: 15 },
      prompt_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 1 },
      seed: { type: 'integer', required: false, description: 'Random seed' },
    },
  },

  'jschoormans/interior-v2': {
    modelId: 'jschoormans/interior-v2',
    displayName: 'Interior V2',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'Interior design v2 — faster generation (~11s)',
    capabilities: ['image-to-image'],
    imageInputParam: 'image',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Interior design description' },
      image: { type: 'string', required: true, description: 'Input room image URL' },
    },
  },

  'rocketdigitalai/interior-design-sdxl': {
    modelId: 'rocketdigitalai/interior-design-sdxl',
    displayName: 'Interior Design SDXL',
    category: 'interior-design',
    status: 'working',
    outputType: 'uri',
    description: 'SDXL + ControlNet depth/ProMax for photorealistic interior renders',
    capabilities: ['text-to-image'],
    parameters: {
      prompt: { type: 'string', required: true, description: 'Style and theme description' },
      negative_prompt: { type: 'string', required: false, description: 'Elements to avoid' },
      scheduler: { type: 'enum', required: false, default: 'DPM++ 2M Karras', options: ['DPM++ 2M Karras', 'K_EULER'] },
      inference_steps: { type: 'integer', required: false, default: 60, min: 10, max: 150 },
      guidance_scale: { type: 'number', required: false, default: 7, min: 1, max: 20 },
      depth_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 2 },
      promax_strength: { type: 'number', required: false, default: 0.8, min: 0, max: 2 },
      refiner_strength: { type: 'number', required: false, default: 0.5, min: 0, max: 1 },
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

      if (
        paramConfig.required &&
        (inputValue === undefined || inputValue === null)
      ) {
        errors.push(`Required parameter '${paramName}' is missing`);
        continue;
      }

      if (inputValue !== undefined && inputValue !== null) {
        // Validate and transform the parameter
        try {
          validatedParams[paramName] = this.validateParameter(
            paramName,
            inputValue,
            paramConfig,
          );
        } catch (error) {
          errors.push(`Parameter '${paramName}': ${(error as Error).message}`);
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
    _name: string,
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
        const intValue = parseInt(value as string);
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
        const numValue = parseFloat(value as string);
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
        if (!config.options.includes(value as string)) {
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
      (model) => model.category === category,
    );
  }

  /**
   * Get working models only
   */
  static getWorkingModels(): ModelConfig[] {
    return Object.values(INTERIOR_DESIGN_MODELS).filter(
      (model) => model.status === 'working',
    );
  }

  /**
   * Get model configuration
   */
  static getModelConfig(modelId: string): ModelConfig | undefined {
    return INTERIOR_DESIGN_MODELS[modelId];
  }
}
