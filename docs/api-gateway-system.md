# Centralized API Gateway System Documentation

## Overview

The Material Kai Vision Platform now features a centralized API gateway system that provides unified access to multiple AI/ML service providers including Replicate, Hugging Face, and Supabase. This system standardizes API interactions, improves error handling, and ensures consistent parameter validation across the platform.

## Architecture

### Core Components

#### 1. API Client Factory (`src/services/apiGateway/apiClientFactory.ts`)

The `CentralizedApiClientFactory` is the heart of the system, implementing a singleton pattern to manage API clients for different providers.

**Key Features:**
- Singleton pattern ensures consistent client management
- Automatic client registration for Replicate, Hugging Face, and Supabase
- Centralized parameter validation using Zod schemas
- Standardized error handling with detailed error information
- Type-safe API execution with TypeScript generics

**Main Methods:**
```typescript
// Execute API calls with automatic validation and error handling
executeApiCall<TParams, TResponse>(
  modelId: string, 
  parameters: TParams
): Promise<StandardizedApiResponse<TResponse>>

// Get specific API client by provider type
getClient(apiType: ApiType): ApiClient | null

// Register new API clients
registerClient(apiType: ApiType, client: ApiClient): void
```

#### 2. API Integration Service (`src/services/apiGateway/apiIntegrationService.ts`)

The `ApiIntegrationService` provides high-level, domain-specific methods that abstract the complexity of the factory pattern.

**Key Features:**
- Domain-specific methods for common operations
- Automatic API type detection from model IDs
- Convenient parameter interfaces
- Supabase edge function integration
- Singleton pattern for consistent access

**Main Methods:**
```typescript
// Generate images using any configured model
generateImage(modelId: string, prompt: string, options?: ImageGenerationOptions): Promise<StandardizedApiResponse<any>>

// Transform images with various models
transformImage(modelId: string, imageUrl: string, prompt: string, options?: ImageTransformationOptions): Promise<StandardizedApiResponse<any>>

// Generate text using language models
generateText(modelId: string, prompt: string, options?: TextGenerationOptions): Promise<StandardizedApiResponse<any>>

// Execute Supabase edge functions
executeSupabaseFunction(functionName: string, parameters: any): Promise<StandardizedApiResponse<any>>
```

### Configuration System

#### Model Configuration (`src/config/models/`)

The system uses a hierarchical configuration structure:

```
src/config/models/
├── index.ts              # Main configuration export
├── replicate/            # Replicate model configurations
│   ├── index.ts
│   ├── textToImage.ts
│   ├── imageToImage.ts
│   └── textGeneration.ts
├── huggingface/          # Hugging Face model configurations
│   ├── index.ts
│   ├── textToImage.ts
│   ├── imageToImage.ts
│   └── textGeneration.ts
└── supabase/             # Supabase function configurations
    ├── index.ts
    └── edgeFunctions.ts
```

Each model configuration includes:
- **Model ID**: Unique identifier
- **API Type**: Provider (replicate, huggingface, supabase)
- **Input Schema**: Zod schema for parameter validation
- **Endpoint**: API endpoint URL
- **Default Parameters**: Sensible defaults for the model

#### Example Model Configuration

```typescript
export const fluxSchnellConfig: ModelConfig = {
  id: 'flux-schnell',
  name: 'FLUX.1 [schnell]',
  apiType: 'replicate',
  category: 'text-to-image',
  endpoint: 'black-forest-labs/flux-schnell',
  inputSchema: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
    output_format: z.enum(['webp', 'jpg', 'png']).optional(),
    output_quality: z.number().min(1).max(100).optional(),
    num_inference_steps: z.number().min(1).max(50).optional(),
    seed: z.number().optional(),
  }),
  defaultParams: {
    aspect_ratio: '1:1',
    output_format: 'webp',
    output_quality: 80,
    num_inference_steps: 4,
  },
  description: 'Fast text-to-image generation with FLUX.1 schnell model',
  tags: ['text-to-image', 'fast', 'flux'],
};
```

## Usage Guide

### Basic Usage

#### 1. Using the Integration Service (Recommended)

```typescript
import { ApiIntegrationService } from '@/services/apiGateway/apiIntegrationService';

// Get the singleton instance
const apiService = ApiIntegrationService.getInstance();

// Generate an image
const result = await apiService.generateImage('flux-schnell', 'A beautiful sunset over mountains', {
  aspectRatio: '16:9',
  outputQuality: 90
});

if (result.success) {
  console.log('Generated image:', result.data);
} else {
  console.error('Error:', result.error?.message);
}
```

#### 2. Using the Factory Directly

```typescript
import { CentralizedApiClientFactory } from '@/services/apiGateway/apiClientFactory';

// Get the singleton instance
const factory = CentralizedApiClientFactory.getInstance();

// Execute API call with automatic validation
const result = await factory.executeApiCall('flux-schnell', {
  prompt: 'A serene lake at dawn',
  aspect_ratio: '16:9',
  output_quality: 85
});

if (result.success) {
  console.log('API response:', result.data);
} else {
  console.error('API error:', result.error);
}
```

#### 3. Supabase Edge Functions

```typescript
// Execute Supabase edge function
const result = await apiService.executeSupabaseFunction('crewai-3d-generation', {
  prompt: 'Create a 3D model of a chair',
  style: 'modern'
});

if (result.success) {
  console.log('Function result:', result.data);
} else {
  console.error('Function error:', result.error?.message);
}
```

### Error Handling

The system provides comprehensive error handling with detailed error information:

```typescript
interface StandardizedError {
  code: string;           // Error code (e.g., 'VALIDATION_ERROR', 'API_ERROR')
  message: string;        // Human-readable error message
  details?: any;          // Additional error details
  retryable: boolean;     // Whether the operation can be retried
}

interface StandardizedApiResponse<T> {
  success: boolean;
  data?: T;
  error?: StandardizedError;
}
```

#### Error Handling Example

```typescript
const result = await apiService.generateImage('flux-schnell', 'Test prompt');

if (!result.success) {
  const error = result.error!;
  
  switch (error.code) {
    case 'VALIDATION_ERROR':
      console.error('Invalid parameters:', error.details);
      break;
    case 'API_ERROR':
      console.error('API call failed:', error.message);
      if (error.retryable) {
        // Implement retry logic
      }
      break;
    case 'NETWORK_ERROR':
      console.error('Network issue:', error.message);
      break;
    default:
      console.error('Unknown error:', error.message);
  }
}
```

## Migration Guide

### Component Migration

Components using direct API calls have been migrated to use the centralized system. Here's the migration pattern:

#### Before (Direct API Call)

```typescript
// Old direct Supabase call
const { data, error } = await supabase.functions.invoke('crewai-3d-generation', {
  body: { prompt, style }
});

if (error) {
  console.error('Error:', error);
  return;
}

console.log('Result:', data);
```

#### After (Centralized API System)

```typescript
import { ApiIntegrationService } from '@/services/apiGateway/apiIntegrationService';

// New centralized call
const apiService = ApiIntegrationService.getInstance();
const result = await apiService.executeSupabaseFunction('crewai-3d-generation', {
  prompt,
  style
});

if (!result.success) {
  console.error('Error:', result.error?.message);
  return;
}

console.log('Result:', result.data);
```

### Migrated Components

The following components have been successfully migrated:

1. **3D Designer** (`src/components/3D/Designer.tsx`)
2. **PDF Review Workflow** (`src/components/PDF/PDFReviewWorkflow.tsx`)
3. **PDF Processor** (`src/components/PDF/PDFProcessor.tsx`)
4. **Enhanced PDF Processor** (`src/components/PDF/EnhancedPDFProcessor.tsx`)
5. **Page Queue Viewer** (`src/components/Scraper/PageQueueViewer.tsx`)
6. **Session Detail View** (`src/components/Scraper/SessionDetailView.tsx`)
7. **New Scraper Page** (`src/components/Scraper/NewScraperPage.tsx`)
8. **CrewAI Search Interface** (`src/components/AI/CrewAISearchInterface.tsx`)
9. **Material Suggestions Panel** (`src/components/Admin/MaterialSuggestionsPanel.tsx`)
10. **AI Testing Panel** (`src/components/Admin/AITestingPanel.tsx`)

## Benefits

### 1. Consistency
- Standardized API interfaces across all providers
- Uniform error handling and response formats
- Consistent parameter validation

### 2. Maintainability
- Centralized configuration management
- Single point of truth for API endpoints and schemas
- Easier to update and maintain API integrations

### 3. Type Safety
- Full TypeScript support with proper type inference
- Compile-time validation of API parameters
- Reduced runtime errors

### 4. Error Handling
- Comprehensive error information with error codes
- Retryable error detection
- Consistent error reporting across the platform

### 5. Scalability
- Easy to add new API providers
- Modular configuration system
- Plugin-like architecture for API clients

### 6. Developer Experience
- Simple, intuitive API for common operations
- Automatic parameter validation
- Clear error messages and debugging information

## Configuration

### Adding New Models

To add a new model configuration:

1. **Create the model configuration:**

```typescript
// src/config/models/replicate/newModel.ts
export const newModelConfig: ModelConfig = {
  id: 'new-model',
  name: 'New Model',
  apiType: 'replicate',
  category: 'text-to-image',
  endpoint: 'provider/model-name',
  inputSchema: z.object({
    prompt: z.string().min(1),
    // Add other parameters
  }),
  defaultParams: {
    // Set default values
  },
  description: 'Description of the new model',
  tags: ['tag1', 'tag2'],
};
```

2. **Export from the provider index:**

```typescript
// src/config/models/replicate/index.ts
export { newModelConfig } from './newModel';
```

3. **Add to the main configuration:**

```typescript
// src/config/models/index.ts
import { newModelConfig } from './replicate';

export const modelConfigs: ModelConfig[] = [
  // ... existing configs
  newModelConfig,
];
```

### Adding New API Providers

To add a new API provider:

1. **Create the API client:**

```typescript
// src/services/apiGateway/clients/newProviderClient.ts
export class NewProviderClient implements ApiClient {
  async executeCall<TParams, TResponse>(
    endpoint: string,
    parameters: TParams
  ): Promise<TResponse> {
    // Implement API call logic
  }
}
```

2. **Register the client:**

```typescript
// In the factory initialization
factory.registerClient('newprovider', new NewProviderClient());
```

3. **Add provider type:**

```typescript
// src/types/api.ts
export type ApiType = 'replicate' | 'huggingface' | 'supabase' | 'newprovider';
```

## Testing

The system has been validated with:

- **TypeScript Compilation**: All components compile without errors
- **Type Safety**: Full type checking and inference
- **Error Handling**: Comprehensive error scenarios tested
- **Integration**: All migrated components working correctly

## Future Enhancements

Potential future improvements include:

1. **Caching**: Implement response caching for frequently used models
2. **Rate Limiting**: Add built-in rate limiting for API calls
3. **Monitoring**: Add metrics and monitoring for API usage
4. **Retry Logic**: Implement intelligent retry mechanisms
5. **Load Balancing**: Support for multiple API keys and load balancing
6. **Streaming**: Support for streaming responses where available

## Troubleshooting

### Common Issues

1. **Model Not Found**: Ensure the model ID exists in the configuration
2. **Validation Errors**: Check parameter types against the model's input schema
3. **API Errors**: Verify API keys and endpoint availability
4. **Type Errors**: Ensure proper TypeScript types are used

### Debug Mode

Enable debug logging by setting the environment variable:
```bash
DEBUG_API_GATEWAY=true
```

This will provide detailed logging of API calls, parameter validation, and error handling.

## Conclusion

The centralized API gateway system provides a robust, scalable, and maintainable foundation for API integrations in the Material Kai Vision Platform. It standardizes interactions across multiple providers while maintaining flexibility and type safety.

For questions or issues, please refer to the source code documentation or create an issue in the project repository.