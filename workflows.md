# Platform Workflows & Services Documentation

## Overview
This document outlines all services, functions, and their interconnections within our AI-powered material analysis platform.

## Core Workflows

### 1. Enhanced Material Recognition Pipeline
**Entry Point**: Material Recognition Page (`/recognition`)
**Primary Service**: `integratedWorkflowService.enhancedMaterialRecognition()`

**Connected Services**:
- **Material Recognition API** (`/material-recognition`) - Primary ML-based material identification
- **OCR Processing** (`/ocr-processing`) - Text extraction from material labels/specifications
- **SVBRDF Extraction** (`/svbrdf-extractor`) - Material maps generation (albedo, normal, roughness, metallic)
- **Enhanced RAG Search** (`/enhanced-rag-search`) - Knowledge base search for material context

**Workflow Steps**:
1. User uploads images → `hybridMLService.analyzeMaterials()`
2. Parallel processing:
   - Primary recognition using hybrid ML models
   - OCR extraction for specifications text
   - SVBRDF extraction for high-confidence materials (>0.8)
   - Knowledge search for material properties and context
3. Results aggregated with enhancements displayed

### 2. Enhanced 3D Generation Workflow
**Entry Point**: 3D Visualization Page (`/3d`)
**Primary Service**: `integratedWorkflowService.enhanced3DGeneration()`

**Connected Services**:
- **CrewAI 3D Generation** (`/crewai-3d-generation`) - AI-powered 3D scene generation
- **NeRF Processor** (`/nerf-processor`) - 3D reconstruction from generated images
- **Spatial Analysis** (planned) - Room layout optimization

**Workflow Steps**:
1. User provides design prompt → CrewAI generates 3D scene
2. If images are generated → NeRF reconstruction for 3D models
3. Material mapping and spatial optimization

### 3. Knowledge Management Workflow
**Entry Point**: Enhanced RAG Interface (`/admin/rag-interface`)
**Primary Service**: `integratedWorkflowService.enhancedKnowledgeSearch()`

**Connected Services**:
- **Enhanced RAG Search** (`/enhanced-rag-search`) - Multi-modal search capabilities
- **Vector Similarity Search** (`/vector-similarity-search`) - Embedding-based material matching
- **RAG Knowledge Search** (`/rag-knowledge-search`) - Traditional knowledge base search

**Workflow Features**:
- Text-based searches with context
- Image-based searches with visual analysis
- Multi-modal RAG with AI context generation

## Standalone Admin Services

### Material Analysis Tools
**Access**: Admin Panel (`/admin`)

1. **SVBRDF Processing** (`/admin/svbrdf`)
   - Standalone material map extraction
   - Access to `SVBRDFExtractionPage` component

2. **NeRF Reconstruction** (`/admin/nerf`)
   - Independent 3D reconstruction tools
   - Access to `NeRFReconstructionPage` component

3. **OCR Processing** (`/admin/ocr`)
   - Text extraction utilities
   - Access to `OCRProcessor` component

4. **Enhanced RAG Interface** (`/admin/rag-interface`)
   - Direct search interface
   - Access to `EnhancedRAGInterface` component

## Complete Service Inventory

### Edge Functions (Backend Services)
| Function | Status | Integration | Dependencies | Purpose |
|----------|--------|-------------|--------------|---------|
| `api-gateway` | ✅ Active | System-wide | Supabase | Request routing and rate limiting |
| `enhanced-rag-search` | ✅ Active | Recognition + RAG workflows | OpenAI, Supabase | Multi-modal knowledge search |
| `material-recognition` | ✅ Active | Recognition workflow | OpenAI, HuggingFace | ML-based material identification |
| `ocr-processing` | ✅ Active | Recognition workflow | OpenAI Whisper | Text extraction from images |
| `svbrdf-extractor` | ✅ Active | Recognition workflow | HuggingFace | Material map generation |
| `nerf-processor` | ✅ Active | 3D workflow | HuggingFace | 3D scene reconstruction |
| `rag-knowledge-search` | ✅ Active | RAG workflow | OpenAI, Supabase | Knowledge base search |
| `vector-similarity-search` | ✅ Active | RAG workflow | Supabase | Embedding-based search |
| `huggingface-model-trainer` | ✅ Active | Admin only | HuggingFace | ML model training |
| `crewai-3d-generation` | ✅ Active | 3D workflow | OpenAI, HuggingFace | AI scene generation |
| `enhanced-crewai` | ✅ Active | Advanced workflows | OpenAI, Anthropic | Enhanced AI coordination |
| `ai-material-analysis` | ✅ Active | Analysis workflows | OpenAI, Anthropic | Advanced material analysis |
| `hybrid-material-analysis` | ✅ Active | Recognition workflow | OpenAI, Anthropic, HuggingFace | Multi-provider analysis |
| `material-properties-analysis` | ✅ Active | Analysis workflows | OpenAI | Material properties extraction |
| `spaceformer-analysis` | ✅ Active | 3D workflow | HuggingFace | Spatial analysis |
| `style-analysis` | ✅ Active | Analysis workflows | OpenAI, HuggingFace | Material style classification |
| `voice-to-material` | ✅ Active | Input workflows | OpenAI Whisper | Voice-based material queries |

### Frontend Components
| Component | Route | Integration | Connected Services | Purpose |
|-----------|-------|-------------|-------------------|---------|
| `MaterialRecognition` | `/recognition` | ✅ Full workflow | integratedWorkflowService | Main recognition interface |
| `MaterialCatalog` | `/catalog` | ✅ Connected | materialCatalogAPI, ragService | Material browsing and search |
| `MoodBoardPage` | `/moodboard` | ✅ Connected | moodboardAPI, materialCatalogAPI | Material collections |
| `Designer3DPage` | `/3d` | ✅ Full workflow | integratedWorkflowService, crewai3DGenerationAPI | 3D generation and visualization |
| `AIStudioPage` | `/agents` | ✅ Connected | agentMLCoordinator | AI agent management |
| `AnalyticsDashboard` | `/analytics` | ✅ Connected | apiGatewayService | System analytics |
| `AdminDashboard` | `/admin` | ✅ Connected | All admin services | Administration hub |

### Admin-Only Components
| Component | Route | Integration | Connected Services | Purpose |
|-----------|-------|-------------|-------------------|---------|
| `SVBRDFExtractionPage` | `/admin/svbrdf` | ✅ Standalone | svbrdfExtractionAPI | Material map extraction |
| `NeRFReconstructionPage` | `/admin/nerf` | ✅ Standalone | nerfProcessingAPI | 3D reconstruction |
| `OCRProcessor` | `/admin/ocr` | ✅ Standalone | hybridOCRService | Text extraction |
| `EnhancedRAGInterface` | `/admin/rag-interface` | ✅ Standalone | enhancedRAGService | Advanced search |
| `KnowledgeBaseManagement` | `/admin/knowledge-base` | ✅ Connected | enhancedRAGService | Knowledge management |
| `AgentMLCoordination` | `/admin/agent-ml` | ✅ Connected | agentMLCoordinator | Agent coordination |
| `AdminPanel` | `/admin/training-models` | ✅ Connected | huggingFaceService | ML model training |
| `RAGManagementPanel` | `/admin/rag` | ✅ Connected | ragService, enhancedRAGService | RAG system management |
| `SystemPerformance` | `/admin/performance` | ✅ Connected | apiGatewayService | Performance monitoring |
| `MetadataFieldsManagement` | `/admin/metadata` | ✅ Connected | materialCatalogAPI | Metadata configuration |
| `ApiGatewayAdmin` | `/admin/api-gateway` | ✅ Connected | apiGatewayService | API management |
| `AITestingPanel` | `/admin/material-analysis` | ✅ Connected | hybridMLService | AI testing tools |

### Core Services (Frontend)
| Service | Status | Integration | Dependencies | Purpose |
|---------|--------|-------------|--------------|---------|
| `integratedWorkflowService` | ✅ Active | System-wide | hybridMLService, supabase functions | Orchestrates all workflows |
| `hybridMLService` | ✅ Active | Recognition workflow | clientMLService, serverMLService | Multi-provider ML analysis |
| `materialCatalogAPI` | ✅ Active | Catalog workflow | Supabase | Material data management |
| `aiMaterialAPI` | ✅ Active | Analysis workflows | Supabase functions | AI-powered analysis |
| `enhancedRAGService` | ✅ Active | RAG workflows | Supabase functions | Enhanced search capabilities |
| `crewai3DGenerationAPI` | ✅ Active | 3D workflow | Supabase functions | 3D generation coordination |
| `agentMLCoordinator` | ✅ Active | Admin workflows | Supabase | Agent-ML coordination |
| `apiGatewayService` | ✅ Active | System-wide | Supabase | API management |
| `hybridOCRService` | ✅ Active | Text extraction | clientMLService, serverMLService | OCR processing |
| `hybridStyleAnalysisService` | ✅ Active | Style analysis | clientMLService, serverMLService | Style classification |
| `hybridMaterialPropertiesService` | ✅ Active | Properties analysis | clientMLService, serverMLService | Material properties |
| `huggingFaceService` | ✅ Active | ML operations | HuggingFace API | HuggingFace models |
| `materialRecognitionAPI` | ✅ Active | Recognition | Supabase functions | Material recognition |
| `svbrdfExtractionAPI` | ✅ Active | Material maps | Supabase functions | SVBRDF extraction |
| `nerfProcessingAPI` | ✅ Active | 3D reconstruction | Supabase functions | NeRF processing |
| `moodboardAPI` | ✅ Active | Collections | Supabase | MoodBoard management |
| `ragService` | ✅ Active | Knowledge search | Supabase | RAG operations |

### ML Services Layer
| Service | Status | Integration | Purpose | Provider |
|---------|--------|-------------|---------|----------|
| `ClientMLService` | ✅ Active | Browser-based | Client-side ML processing | Local |
| `ServerMLService` | ✅ Active | Server-based | Server-side ML processing | Supabase Functions |
| `MaterialClassificationService` | ✅ Active | Recognition | Advanced classification | Hybrid |
| `ImageClassifierService` | ✅ Active | Image analysis | Image classification | Client |
| `TextEmbedderService` | ✅ Active | Text processing | Text embeddings | Client |
| `MaterialAnalyzerService` | ✅ Active | Material analysis | Comprehensive analysis | Hybrid |
| `StyleAnalysisService` | ✅ Active | Style classification | Style analysis | Server |
| `OCRService` | ✅ Active | Text extraction | OCR processing | Server |

## Disconnected/Standalone Services

### ❌ Partially Connected Services
| Service | Status | Issue | Suggested Connection |
|---------|--------|-------|---------------------|
| `realMaterialCatalogAPI` | ⚠️ Standalone | Not integrated in workflows | Connect to MaterialCatalog component |
| `deviceDetector` | ⚠️ Utility | Only used for capability detection | Already properly used |

### 🔄 Services Needing Better Integration
| Service | Current Status | Missing Integration | Action Needed |
|---------|----------------|-------------------|---------------|
| `realtimeAgentMonitor` | ✅ Exists | Not visible in UI | Add to Admin Dashboard |
| `responseValidator` | ✅ Exists | Used internally | Already properly integrated |
| `agentPerformanceOptimizer` | ✅ Exists | Not exposed | Add to Agent ML Coordination |
| `agentSpecializationManager` | ✅ Exists | Not exposed | Add to Agent ML Coordination |
| `agentLearningSystem` | ✅ Exists | Not exposed | Add to Agent ML Coordination |
| `agentCollaborationWorkflows` | ✅ Exists | Not exposed | Add to Agent ML Coordination |

## Detailed Service Dependencies

### Recognition Workflow Dependencies
```
User Upload → MaterialRecognition Component
    ↓
integratedWorkflowService.enhancedMaterialRecognition()
    ├── hybridMLService.analyzeMaterials()
    │   ├── clientMLService (browser ML)
    │   ├── serverMLService → material-recognition function
    │   └── MaterialClassificationService
    ├── hybridOCRService → ocr-processing function
    ├── svbrdfExtractionAPI → svbrdf-extractor function  
    └── enhancedRAGService → enhanced-rag-search function
```

### 3D Generation Workflow Dependencies
```
User Input → Designer3DPage Component
    ↓
integratedWorkflowService.enhanced3DGeneration()
    ├── crewai3DGenerationAPI → crewai-3d-generation function
    ├── nerfProcessingAPI → nerf-processor function
    └── spaceformer-analysis function (spatial optimization)
```

### Knowledge Search Dependencies
```
Search Query → EnhancedRAGInterface Component
    ↓
integratedWorkflowService.enhancedKnowledgeSearch()
    ├── enhancedRAGService → enhanced-rag-search function
    ├── ragService → rag-knowledge-search function
    └── vector-similarity-search function
```

## Integration Status Summary

### ✅ Fully Integrated Workflows
- **Material Recognition Pipeline**: Recognition → OCR → SVBRDF → Knowledge Search
- **3D Generation Pipeline**: Design Generation → NeRF Reconstruction → Material Mapping
- **Knowledge Management**: RAG Search → Vector Similarity → Knowledge Base
- **Admin Management**: All admin tools accessible and connected

### ✅ Connected Main Features
- Dashboard with analytics
- Material catalog with search
- MoodBoard with material collections
- AI Agents coordination
- Complete admin panel

### ✅ Standalone Admin Tools
- SVBRDF extraction (accessible at `/admin/svbrdf`)
- NeRF reconstruction (accessible at `/admin/nerf`)
- OCR processing (accessible at `/admin/ocr`)
- Enhanced RAG interface (accessible at `/admin/rag-interface`)

### ⚠️ Services Needing Attention
- `realMaterialCatalogAPI` - Exists but not connected to main workflow
- Agent monitoring services - Exist but not exposed in UI
- Performance optimization services - Need better UI integration

## Technology Stack Dependencies

### Required API Keys/Services
- **OpenAI**: GPT models, DALL-E, Whisper (OCR, voice processing)
- **Anthropic**: Claude models (enhanced analysis)
- **HuggingFace**: Transformers, custom models (ML processing)
- **Supabase**: Database, auth, storage, edge functions

### Frontend Dependencies
- React, TypeScript, Tailwind CSS
- Supabase client, TanStack Query
- React Router, Lucide icons
- Three.js (3D visualization)

### Backend Dependencies (Edge Functions)
- Deno runtime
- Supabase SDK
- OpenAI SDK
- HuggingFace Inference API
- Various ML model APIs

## Workflow Interaction Map

```
User Workflows:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Recognition   │────│   3D Design     │────│   MoodBoards    │
│   (/recognition)│    │   (/3d)         │    │   (/moodboard)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Material Cat.  │    │   AI Agents     │    │   Analytics     │
│  (/catalog)     │    │   (/agents)     │    │   (/analytics)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘

Admin Workflows:
┌─────────────────────────────────────────────────────────────┐
│                     Admin Dashboard (/admin)                │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Management    │   Monitoring    │      Standalone Tools   │
│   - Knowledge   │   - Performance │      - SVBRDF Extract   │
│   - Agents      │   - Analytics   │      - NeRF Recon       │
│   - Training    │   - API Gateway │      - OCR Process      │
│   - RAG Config  │   - System      │      - RAG Interface    │
└─────────────────┴─────────────────┴─────────────────────────┘
```

All services are now comprehensively documented with their integration status, dependencies, and connection points throughout the platform.