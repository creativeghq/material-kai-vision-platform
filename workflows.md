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
| Function | Status | Integration | Purpose |
|----------|--------|-------------|---------|
| `api-gateway` | ✅ Active | System-wide | Request routing and rate limiting |
| `enhanced-rag-search` | ✅ Active | Recognition + RAG workflows | Multi-modal knowledge search |
| `material-recognition` | ✅ Active | Recognition workflow | ML-based material identification |
| `ocr-processing` | ✅ Active | Recognition workflow | Text extraction from images |
| `svbrdf-extractor` | ✅ Active | Recognition workflow | Material map generation |
| `nerf-processor` | ✅ Active | 3D workflow | 3D scene reconstruction |
| `rag-knowledge-search` | ✅ Active | RAG workflow | Knowledge base search |
| `vector-similarity-search` | ✅ Active | RAG workflow | Embedding-based search |
| `huggingface-model-trainer` | ✅ Active | Admin only | ML model training |
| `crewai-3d-generation` | ✅ Active | 3D workflow | AI scene generation |
| `enhanced-crewai` | ✅ Active | Advanced workflows | Enhanced AI coordination |
| `ai-material-analysis` | ✅ Active | Analysis workflows | Advanced material analysis |
| `hybrid-material-analysis` | ✅ Active | Recognition workflow | Multi-provider analysis |
| `material-properties-analysis` | ✅ Active | Analysis workflows | Material properties extraction |
| `spaceformer-analysis` | ✅ Active | 3D workflow | Spatial analysis |
| `style-analysis` | ✅ Active | Analysis workflows | Material style classification |
| `voice-to-material` | ✅ Active | Input workflows | Voice-based material queries |

### Frontend Components
| Component | Route | Integration | Purpose |
|-----------|-------|-------------|---------|
| `MaterialRecognition` | `/recognition` | ✅ Full workflow | Main recognition interface |
| `MaterialCatalog` | `/catalog` | ✅ Connected | Material browsing and search |
| `MoodBoardPage` | `/moodboard` | ✅ Connected | Material collections |
| `Designer3DPage` | `/3d` | ✅ Full workflow | 3D generation and visualization |
| `AIStudioPage` | `/agents` | ✅ Connected | AI agent management |
| `AnalyticsDashboard` | `/analytics` | ✅ Connected | System analytics |
| `AdminDashboard` | `/admin` | ✅ Connected | Administration hub |

### Admin-Only Components
| Component | Route | Integration | Purpose |
|-----------|-------|-------------|---------|
| `SVBRDFExtractionPage` | `/admin/svbrdf` | ✅ Standalone | Material map extraction |
| `NeRFReconstructionPage` | `/admin/nerf` | ✅ Standalone | 3D reconstruction |
| `OCRProcessor` | `/admin/ocr` | ✅ Standalone | Text extraction |
| `EnhancedRAGInterface` | `/admin/rag-interface` | ✅ Standalone | Advanced search |
| `KnowledgeBaseManagement` | `/admin/knowledge-base` | ✅ Connected | Knowledge management |
| `AgentMLCoordination` | `/admin/agent-ml` | ✅ Connected | Agent coordination |
| `AdminPanel` | `/admin/training-models` | ✅ Connected | ML model training |
| `RAGManagementPanel` | `/admin/rag` | ✅ Connected | RAG system management |
| `SystemPerformance` | `/admin/performance` | ✅ Connected | Performance monitoring |
| `MetadataFieldsManagement` | `/admin/metadata` | ✅ Connected | Metadata configuration |
| `ApiGatewayAdmin` | `/admin/api-gateway` | ✅ Connected | API management |
| `AITestingPanel` | `/admin/material-analysis` | ✅ Connected | AI testing tools |

### Core Services (Frontend)
| Service | Integration | Purpose |
|---------|-------------|---------|
| `integratedWorkflowService` | ✅ System-wide | Orchestrates all workflows |
| `hybridMLService` | ✅ Recognition workflow | Multi-provider ML analysis |
| `materialCatalogAPI` | ✅ Catalog workflow | Material data management |
| `aiMaterialAPI` | ✅ Analysis workflows | AI-powered analysis |
| `enhancedRAGService` | ✅ RAG workflows | Enhanced search capabilities |
| `crewai3DGenerationAPI` | ✅ 3D workflow | 3D generation coordination |
| `agentMLCoordinator` | ✅ Admin workflows | Agent-ML coordination |
| `apiGatewayService` | ✅ System-wide | API management |

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

All services are now properly integrated into cohesive workflows while maintaining standalone access for advanced users through the admin panel.