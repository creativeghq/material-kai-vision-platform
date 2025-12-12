# 🏗️ SpaceFormer Architecture - Complete System Overview

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              AgentHub Component                         │    │
│  │  - Interior Designer Agent selected                     │    │
│  │  - Detects design keywords in user input               │    │
│  │  - Triggers 3D generation + SpaceFormer                 │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │      MaterialAgent3DGenerationAPI                       │    │
│  │  - generate3D(prompt, room_type, style)                 │    │
│  │  - Calls BrowserApiIntegrationService                   │    │
│  │  - Calls spaceformerAnalysisService                     │    │
│  └────────────────────────────────────────────────────────┘    │
│              │                              │                    │
│              ▼                              ▼                    │
│  ┌─────────────────────┐      ┌──────────────────────────┐     │
│  │ BrowserApiService   │      │ SpaceFormerService       │     │
│  │ - Replicate API     │      │ - mivaaApi.analyze()     │     │
│  │ - Hugging Face API  │      │                          │     │
│  └─────────────────────┘      └──────────────────────────┘     │
│              │                              │                    │
└──────────────┼──────────────────────────────┼───────────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────┐    ┌──────────────────────────────────┐
│   External AI APIs      │    │      MIVAA Backend (Python)      │
│  - Replicate            │    │                                  │
│  - Hugging Face         │    │  POST /api/spaceformer/analyze   │
│  - Stable Diffusion     │    │                                  │
└─────────────────────────┘    │  ┌────────────────────────────┐ │
                               │  │  SpaceformerService        │ │
                               │  │  - analyze_space()         │ │
                               │  │  - _build_prompt()         │ │
                               │  │  - _analyze_with_claude()  │ │
                               │  └────────────────────────────┘ │
                               │              │                   │
                               └──────────────┼───────────────────┘
                                              ▼
                               ┌──────────────────────────────────┐
                               │    Anthropic Claude API          │
                               │    - Claude Sonnet 4.5 Vision    │
                               │    - Analyzes room images        │
                               │    - Returns spatial analysis    │
                               └──────────────────────────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────────────┐
                               │      Supabase Database           │
                               │  - spatial_analysis table        │
                               │  - generation_3d table           │
                               │  - agent_chat_messages table     │
                               └──────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. User Input → Agent Response
```typescript
User: "Design a modern bedroom"
  ↓
AgentHub detects keywords: ["design", "bedroom", "modern"]
  ↓
Extracts: room_type="bedroom", style="modern"
  ↓
Calls: MaterialAgent3DGenerationAPI.generate3D({
  prompt: "Design a modern bedroom",
  room_type: "bedroom",
  style: "modern",
  enable_spatial_analysis: true
})
```

### 2. 3D Image Generation
```typescript
BrowserApiIntegrationService.generateInteriorDesign()
  ↓
Calls Replicate/Hugging Face API
  ↓
Returns: image_urls = ["https://replicate.delivery/..."]
```

### 3. SpaceFormer Analysis
```typescript
spaceformerAnalysisService.analyzeSpace({
  image_url: image_urls[0],
  room_type: "bedroom",
  analysis_type: "full"
})
  ↓
POST /api/spaceformer/analyze
  ↓
SpaceformerService.analyze_space()
  ↓
Claude Vision API analyzes image
  ↓
Returns: {
  layout_analysis: {...},
  material_suggestions: [...],
  accessibility_report: {...},
  spatial_metrics: {...}
}
```

### 4. Combined Result
```typescript
{
  success: true,
  image_urls: ["https://..."],
  spatial_analysis: {
    layout_analysis: {...},
    material_suggestions: [...],
    accessibility_report: {...},
    spatial_metrics: {...}
  },
  parsed_request: {...},
  quality_assessment: {...}
}
```

### 5. Display in UI
```typescript
designData = {
  images: image_urls,
  spatialAnalysis: spatial_analysis,
  ...
}
  ↓
<DesignCanvas
  images={designData.images}
  spatialAnalysis={designData.spatialAnalysis}
  ...
/>
```

---

## 📁 File Structure

```
material-kai-vision-platform/
├── src/
│   ├── services/
│   │   ├── materialAgent3DGenerationAPI.ts      ← 3D generation + SpaceFormer integration
│   │   ├── spaceformerAnalysisService.ts        ← SpaceFormer API client
│   │   ├── mivaaApiClient.ts                    ← MIVAA API wrapper
│   │   └── apiGateway/
│   │       └── browserApiIntegrationService.ts  ← Replicate/HF integration
│   │
│   └── components/
│       └── AI/
│           ├── AgentHub.tsx                     ← Main agent interface
│           ├── DesignCanvas.tsx                 ← Display 3D + spatial analysis
│           └── MaterialAgentSearchInterface.tsx ← Alternative interface
│
└── mivaa-pdf-extractor/
    └── app/
        ├── api/
        │   └── spaceformer_routes.py            ← API endpoint
        └── services/
            └── spaceformer_service.py           ← Core SpaceFormer logic
```

---

## 🔑 Key Components

### Frontend Services

#### 1. MaterialAgent3DGenerationAPI
**Purpose:** Orchestrates 3D generation + SpaceFormer analysis
**Key Methods:**
- `generate3D(request)` - Main entry point
- Returns combined result with images + spatial analysis

#### 2. spaceformerAnalysisService
**Purpose:** Client for SpaceFormer API
**Key Methods:**
- `analyzeSpace(request)` - Full spatial analysis
- `quickLayoutAnalysis()` - Layout only
- `optimizeMaterialPlacements()` - Materials only
- `analyzeAccessibility()` - Accessibility only

#### 3. BrowserApiIntegrationService
**Purpose:** Manages external AI APIs (Replicate, Hugging Face)
**Key Methods:**
- `generateInteriorDesign()` - Generate 3D images
- `generateImageWithReplicate()` - Replicate API
- `generateImageWithHuggingFace()` - Hugging Face API

### Backend Services

#### 1. SpaceformerService (Python)
**Purpose:** Core spatial analysis using Claude Vision
**Key Methods:**
- `analyze_space()` - Main analysis method
- `_build_analysis_prompt()` - Prompt engineering
- `_analyze_with_claude()` - Claude API integration
- `_save_analysis()` - Database persistence

---

## 🗄️ Database Schema

### spatial_analysis Table
```sql
CREATE TABLE spatial_analysis (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  workspace_id UUID REFERENCES workspaces(id),
  image_url TEXT,
  room_type TEXT,
  analysis_type TEXT,
  layout_analysis JSONB,
  material_suggestions JSONB,
  accessibility_report JSONB,
  spatial_metrics JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMP
);
```

### generation_3d Table
```sql
CREATE TABLE generation_3d (
  id UUID PRIMARY KEY,
  user_id UUID,
  generation_type TEXT,
  input_data JSONB,
  output_data JSONB,  -- Includes spatial_analysis
  file_urls JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMP
);
```

---

## 🔐 Security & Authentication

- All API calls require user authentication
- Workspace context enforced
- Rate limiting on external APIs
- Error handling with graceful degradation

---

## ⚡ Performance Considerations

**Parallel Processing:**
- 3D generation and SpaceFormer run sequentially (SpaceFormer needs the image)
- Total time: 5-13 seconds

**Caching:**
- 3D generation results cached in database
- SpaceFormer results cached in database
- Conversation history includes design data

**Optimization Opportunities:**
- Batch multiple images for analysis
- Pre-generate common room types
- Cache SpaceFormer prompts

---

## 🎯 Design Decisions

### Why Sequential (not Parallel)?
SpaceFormer needs the generated image to analyze, so it must run after 3D generation.

### Why Frontend Integration?
- 3D generation uses browser APIs (Replicate/HF)
- Keeps backend lightweight
- Better error handling and user feedback

### Why Not Match Products?
- SpaceFormer provides generic suggestions
- Product matching is a separate concern
- Existing relevancy system handles product search

### Why Graceful Degradation?
- 3D generation can fail (API limits, errors)
- SpaceFormer can fail (Claude API issues)
- User should still get agent response

