# 3D Room Designer - Architecture Documentation

## Overview

The 3D Room Designer is a **standalone page** that generates interior design images using AI. It is completely independent from the agent system and uses direct API calls to external services.

## Why Standalone?

The 3D Designer is NOT integrated with the agent system for these critical reasons:

1. **Timeout Constraints**: Supabase Edge Functions have strict timeout limits (typically 60 seconds)
2. **Long Processing Times**: Image generation can take 30-60+ seconds
3. **Direct API Access**: Replicate/Hugging Face APIs work better with direct calls
4. **Reliability**: Agents are designed for conversational tasks, not long-running operations

## Architecture

```
User Input (Designer3DPage.tsx)
    ↓
Designer3DService (standalone service)
    ↓
BrowserApiIntegrationService
    ↓
Direct API Calls → Replicate / Hugging Face
    ↓
Image Generation (30-60 seconds)
    ↓
Store in Database (generation_3d table)
    ↓
Display Results
```

## Key Components

### 1. Designer3DPage (`src/pages/Designer3DPage.tsx`)
- **Purpose**: User interface for 3D design generation
- **Features**:
  - Design parameter inputs (prompt, room type, style)
  - Real-time generation progress
  - Image gallery display
  - Download functionality
- **Route**: `/3d-designer`
- **Sidebar**: Accessible via "3D Designer" menu item

### 2. Designer3DService (`src/services/designer3DService.ts`)
- **Purpose**: Standalone service for image generation
- **Key Methods**:
  - `generateDesign()`: Main generation method
  - `buildEnhancedPrompt()`: Prompt enhancement
  - `getGenerationHistory()`: Fetch user's past generations
- **NOT Agent-Based**: Uses direct API calls only

### 3. BrowserApiIntegrationService (`src/services/apiGateway/browserApiIntegrationService.ts`)
- **Purpose**: Browser-compatible API client
- **Methods Used**:
  - `generateInteriorDesign()`: Calls Replicate/Hugging Face
  - Handles model selection automatically
  - Manages API errors and retries

## Data Flow

### Input Parameters
```typescript
{
  prompt: string;          // User's design description
  room_type: string;       // living_room, bedroom, kitchen, etc.
  style: string;           // modern, contemporary, minimalist, etc.
  width: number;           // Image width (default: 768)
  height: number;          // Image height (default: 768)
}
```

### Output Result
```typescript
{
  success: boolean;
  generation_id: string;
  image_urls: string[];
  enhanced_prompt: string;
  processing_time_ms: number;
  error?: string;
}
```

## Database Schema

### Table: `generation_3d`
```sql
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users)
- generation_name: text
- generation_type: text ('interior_design')
- generation_status: text ('completed', 'failed')
- input_data: jsonb (prompt, room_type, style)
- output_data: jsonb (image_urls, enhanced_prompt)
- processing_time_ms: integer
- created_at: timestamp
```

## API Models Used

### Primary: Replicate
- **Models**: Interior design specific models
- **Quality**: High quality, photorealistic
- **Speed**: 30-60 seconds
- **Cost**: Pay per generation

### Fallback: Hugging Face
- **Models**: Stable Diffusion variants
- **Quality**: Good quality
- **Speed**: 20-40 seconds
- **Cost**: Free tier available

## User Experience

### Generation Flow
1. User enters design description
2. Selects room type and style
3. Clicks "Generate Design"
4. Progress indicator shows status
5. Image appears after 30-60 seconds
6. User can download or reset

### Error Handling
- Authentication check before generation
- API error messages displayed to user
- Automatic retry on transient failures
- Graceful degradation if models unavailable

## Comparison: 3D Designer vs Agent Hub

| Feature | 3D Designer | Agent Hub |
|---------|-------------|-----------|
| **Purpose** | Image generation | Conversational AI |
| **Processing Time** | 30-60+ seconds | < 10 seconds |
| **API Calls** | Direct (Replicate/HF) | Via Supabase Functions |
| **Timeout Limits** | None (browser-based) | 60 seconds (Supabase) |
| **Use Case** | Long-running tasks | Quick interactions |
| **Agent System** | ❌ No | ✅ Yes |

## Future Enhancements

1. **Material Matching**: Integrate with material database
2. **Spatial Analysis**: Add SpaceFormer integration
3. **3D Model Export**: Generate actual 3D meshes
4. **Batch Generation**: Generate multiple variations
5. **History View**: Browse past generations
6. **Favorites**: Save and organize designs

## Troubleshooting

### Common Issues

**Issue**: Generation takes too long
- **Cause**: API server load
- **Solution**: Wait or retry later

**Issue**: "No models available" error
- **Cause**: API keys not configured
- **Solution**: Check environment variables

**Issue**: Authentication error
- **Cause**: User not logged in
- **Solution**: Redirect to login page

## Configuration

### Environment Variables
```bash
# Replicate API (primary)
VITE_REPLICATE_API_KEY=your_key_here

# Hugging Face API (fallback)
VITE_HUGGINGFACE_API_KEY=your_key_here
```

### Model Selection
Models are automatically selected based on availability and requirements. Priority:
1. Replicate interior design models
2. Hugging Face Stable Diffusion models

## Conclusion

The 3D Designer is a **standalone, agent-independent** system designed for long-running image generation tasks. It provides a reliable, user-friendly interface for creating AI-powered interior designs without the constraints of the agent system.

