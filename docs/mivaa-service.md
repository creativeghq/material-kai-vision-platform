# 🤖 MIVAA Service - Complete Documentation

**Status**: Active
**Last Updated**: 2025-10-27
**Category**: Core Platform | Backend Service
**Service URL**: https://v1api.materialshub.gr

---

## 🎯 Overview

**MIVAA (Material Intelligence Vision and Analysis Agent)** is the core microservice that powers the Material Kai Vision Platform's document processing, AI analysis, and knowledge extraction capabilities.

### 🏗️ Architecture

- **Framework**: FastAPI + Python 3.9+
- **Purpose**: PDF processing, RAG system, AI coordination, multi-modal analysis
- **Features**: Document extraction, vector embeddings, semantic search, product classification
- **AI Integration**: OpenAI, Anthropic Claude, Together AI (Llama 4 Scout Vision), HuggingFace
- **Database**: Supabase PostgreSQL with pgvector extensions
- **Deployment**: UV-based package management with systemd service
- **Port**: 8000 (internal), 443/80 (external via nginx)

### 🌐 Service Endpoints

**Production Base URL**: `https://v1api.materialshub.gr`

#### **Core Endpoints**
- **Health Check**: `https://v1api.materialshub.gr/health`
- **API Documentation**: `https://v1api.materialshub.gr/docs`
- **ReDoc Documentation**: `https://v1api.materialshub.gr/redoc`
- **OpenAPI Schema**: `https://v1api.materialshub.gr/openapi.json`

#### **Functional Endpoint Categories**
- **PDF Processing**: `/api/v1/extract/*` - Markdown, tables, images extraction
- **RAG System**: `/api/v1/rag/*` - Document upload, query, chat, search
- **AI Analysis**: `/api/semantic-analysis` - LLaMA Vision material analysis
- **Search APIs**: `/api/search/*` - Semantic, vector, hybrid search
- **Embedding APIs**: `/api/embeddings/*` - Generate embeddings, batch processing
- **Chat APIs**: `/api/chat/*` - Chat completions, contextual responses
- **Document Management**: `/api/documents/*` - Process, analyze, manage documents
- **Products API**: `/api/products/*` - Product creation, enrichment, management
- **Admin APIs**: `/api/admin/*` - Chunk quality, monitoring, management
- **Health & Monitoring**: `/health`, `/metrics`, `/performance/summary`

---

## 📡 API Endpoints Reference

### 1. Vector Similarity Search
**Path**: `/api/search/semantic`
**Method**: POST
**Purpose**: Semantic search using vector embeddings
**Authentication**: Required (JWT Bearer token)

**Request**:
```json
{
  "query_text": "waterproof ceramic tiles",
  "similarity_threshold": 0.7,
  "limit": 10,
  "search_type": "semantic"
}
```

**Response**:
```json
{
  "results": [
    {
      "id": "product-uuid",
      "name": "Ceramic Tile",
      "similarity_score": 0.92,
      "metadata": {...}
    }
  ],
  "total": 10,
  "processing_time_ms": 450
}
```

**Performance**: 200-800ms response time

---

### 2. Multi-Modal Analysis
**Path**: `/api/semantic-analysis`
**Method**: POST
**Purpose**: Combined text and image analysis using Llama 4 Scout Vision
**Authentication**: Required

**Request**:
```json
{
  "text_content": "Material description",
  "image_url": "https://example.com/image.jpg",
  "include_entities": true,
  "include_materials": true
}
```

**Response**:
```json
{
  "entities": [...],
  "materials": [...],
  "confidence_scores": {...},
  "analysis_summary": "..."
}
```

**Performance**: 1-4 seconds response time

---

### 3. Two-Stage Product Classification ⭐
**Path**: `/api/products/create-from-chunks`
**Method**: POST
**Purpose**: Advanced AI-powered product classification with 60% performance improvement
**Authentication**: Required

**Request**:
```json
{
  "document_id": "doc-123",
  "workspace_id": "workspace-uuid",
  "max_products": 50,
  "min_chunk_length": 100
}
```

**Response**:
```json
{
  "products_created": 15,
  "processing_time_seconds": 35,
  "stage_1_time": 12,
  "stage_2_time": 18,
  "enrichment_time": 5,
  "performance_metrics": {...}
}
```

**Performance**: 25-55 seconds for 200 chunks → 15 products
**Features**:
- Stage 1: Claude Haiku 4.5 for fast initial classification
- Stage 2: Claude Sonnet 4.5 for deep product enrichment
- 60% faster than single-stage approach
- 40% cost reduction through intelligent model selection

---

### 4. RAG Document Upload
**Path**: `/api/v1/rag/documents/upload`
**Method**: POST
**Purpose**: Upload and process PDF documents with full AI pipeline
**Authentication**: Required

**Request**: Multipart form data with PDF file

**Response**:
```json
{
  "job_id": "job-uuid",
  "document_id": "doc-uuid",
  "status": "processing",
  "estimated_time_seconds": 120
}
```

**Processing Pipeline**:
1. PDF extraction (PyMuPDF4LLM)
2. Image extraction
3. Semantic chunking
4. Quality scoring and validation
5. Deduplication (hash-based + semantic)
6. Embedding generation (6 types)
7. Image analysis (Claude + Llama Vision)
8. Product detection (two-stage classification)
9. Product enrichment

---

### 5. Enhanced Job Monitoring
**Path**: `/api/v1/rag/jobs/{job_id}`
**Method**: GET
**Purpose**: Real-time job progress and stage monitoring
**Authentication**: Required

**Response**:
```json
{
  "job_id": "job-uuid",
  "status": "processing",
  "progress_percentage": 65,
  "current_stage": "Product Detection",
  "stages_completed": ["PDF Extraction", "Chunking", "Embedding Generation"],
  "eta_seconds": 45,
  "metadata": {
    "chunks_created": 227,
    "images_extracted": 169,
    "products_created": 15,
    "embeddings_generated": 227
  }
}
```

**Performance**: 100-300ms response time
**Update Frequency**: Polled every 5 seconds during active processing

---

### 6. Chunk Quality Dashboard
**Path**: `/api/admin/chunk-quality/stats`
**Method**: GET
**Purpose**: Comprehensive chunk quality statistics and monitoring
**Authentication**: Required (Admin only)

**Response**:
```json
{
  "total_chunks": 1500,
  "quality_distribution": {
    "high": 1200,
    "medium": 250,
    "low": 50
  },
  "flagged_chunks": 35,
  "duplicate_chunks": 12,
  "semantic_duplicates": 8,
  "average_quality_score": 0.82
}
```

---

### 7. Embedding Generation
**Path**: `/api/embeddings/generate`
**Method**: POST
**Purpose**: Generate embeddings for text or images
**Authentication**: Required

**Request**:
```json
{
  "text": "Modern bathroom tiles",
  "embedding_types": ["text", "visual", "color"],
  "normalize": true
}
```

**Response**:
```json
{
  "text_embedding_1536": [0.123, ...],
  "visual_clip_embedding_512": [0.456, ...],
  "color_embedding_256": [0.789, ...],
  "metadata": {
    "generation_time_ms": 850,
    "model_versions": {...}
  }
}
```

---

## 🔄 Usage Patterns

### Automatic Triggers
1. **PDF Upload**: Triggers full AI processing pipeline
2. **Search Queries**: Similarity search activated for semantic queries
3. **Job Monitoring**: Real-time progress updates during processing
4. **Dashboard Load**: Metrics refresh for performance monitoring
5. **Product Classification**: Two-stage classification during PDF processing

### Manual Invocations
1. **AI Testing Panel**: Manual testing of all MIVAA capabilities
2. **Metadata Auto-Population**: Admin-triggered bulk metadata extraction
3. **System Performance**: Manual refresh of analytics and trends
4. **Product Classification**: Manual product creation from document chunks
5. **Chunk Quality Review**: Admin review of flagged low-quality chunks

### Integration Points
- **mivaa-gateway**: Primary integration via Supabase Edge Function
- **Search Hub**: Vector similarity search integration
- **PDF Processor**: Multi-modal analysis during document processing
- **Admin Panel**: System monitoring and testing interfaces
- **Products API**: Two-stage product classification integration
- **Knowledge Base**: Chunk and embedding management

## 🚀 Deployment Options

### 🔄 Default Deployment (Recommended)
- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: Automatic on push to `main` or `production` branches
- **Duration**: 2-3 minutes
- **Features**: Fast, reliable deployment with comprehensive health monitoring
- **Manual Option**: Available via GitHub Actions workflow_dispatch

### 🚀 Orchestrated Deployment (Advanced)
- **Workflow**: `.github/workflows/orchestrated-deployment.yml`
- **Trigger**: Manual only via GitHub Actions workflow_dispatch
- **Duration**: 5-8 minutes
- **Features**: Multi-phase pipeline with intelligence, validation, and comprehensive reporting
- **Options**: Deployment mode (fast-track, intelligent, comprehensive), target branch, diagnostics control

## 🏥 Health Monitoring & Diagnostics

### 🔍 Real-Time Health Checks
- **HTTP Status Code Verification**: Tests actual endpoint responses (200, 502, 404, etc.)
- **Multiple Endpoint Testing**: Health, docs, redoc, and OpenAPI schema endpoints
- **Response Time Monitoring**: Tracks endpoint response times and availability
- **Retry Logic**: Multiple attempts with intelligent backoff

### 🔧 Automatic Diagnostics
When health checks fail, the system automatically collects:
- **System Resources**: CPU, memory, disk usage, load averages
- **Service Status**: systemd service status and configuration
- **Network Analysis**: Port availability, process binding, network interfaces
- **Application Logs**: Recent logs, error logs, and service history
- **Environment Verification**: Python environment, dependencies, application structure

### 🔄 Auto-Recovery Features
- **Automatic Service Restart**: Attempts to restart failed services
- **Post-Restart Verification**: Re-tests endpoints after recovery attempts
- **Recovery Status Reporting**: Clear indication of recovery success or failure
- **Escalation Path**: Provides manual intervention steps when auto-recovery fails

## 🛠️ System Requirements

### 🐍 Runtime Environment
- **Python**: 3.9+ (managed via pyenv)
- **Package Manager**: uv (ultrafast Python package installer)
- **Process Management**: systemd service (mivaa-pdf-extractor.service)
- **Web Server**: FastAPI with Uvicorn ASGI server
- **Port**: 8000 (internal), 443/80 (external via nginx)

### 📦 Dependencies
- **Core**: FastAPI, Uvicorn, PyMuPDF4LLM, LlamaIndex
- **AI/ML**: OpenAI, HuggingFace Transformers, Sentence Transformers
- **Database**: Supabase Python client, SQLAlchemy, asyncpg
- **Utilities**: Pydantic, python-multipart, python-jose
- **Monitoring**: Sentry SDK, structlog

### 🔐 Environment Variables
```bash
# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=ERROR

# Database
SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Authentication
JWT_SECRET_KEY=your_jwt_secret

# AI Services
OPENAI_API_KEY=your_openai_key
HUGGINGFACE_API_KEY=your_huggingface_key

# External APIs
MATERIAL_KAI_API_URL=https://v1api.materialshub.gr
MATERIAL_KAI_API_KEY=your_api_key

# Performance
CACHE_TTL=3600
DATABASE_POOL_SIZE=20

# Monitoring
SENTRY_DSN=your_sentry_dsn
LOG_FILE=/var/log/mivaa/app.log
```

## 🔧 Service Management

### 📋 Service Commands
```bash
# Service status
sudo systemctl status mivaa-pdf-extractor

# Start service
sudo systemctl start mivaa-pdf-extractor

# Stop service
sudo systemctl stop mivaa-pdf-extractor

# Restart service
sudo systemctl restart mivaa-pdf-extractor

# Enable auto-start
sudo systemctl enable mivaa-pdf-extractor

# View logs
sudo journalctl -u mivaa-pdf-extractor -f

# View recent logs
sudo journalctl -u mivaa-pdf-extractor --since "1 hour ago"
```

### 🏥 Health Check Commands
```bash
# Basic health check
curl https://v1api.materialshub.gr/health

# Detailed health check with headers
curl -I https://v1api.materialshub.gr/health

# API documentation availability
curl https://v1api.materialshub.gr/docs

# Service status check
curl -s https://v1api.materialshub.gr/health | jq '.'
```

### 📊 Monitoring Commands
```bash
# System resources
htop
free -h
df -h

# Network status
ss -tlnp | grep :8000
lsof -i :8000

# Process information
ps aux | grep mivaa
pgrep -f mivaa-pdf-extractor
```

## 🔍 Troubleshooting

### ❌ Common Issues

#### **Service Not Starting**
```bash
# Check service status
sudo systemctl status mivaa-pdf-extractor

# Check logs for errors
sudo journalctl -u mivaa-pdf-extractor --since "10 minutes ago"

# Verify Python environment
which python3
python3 --version

# Check port availability
ss -tlnp | grep :8000
```

#### **Health Check Failures**
```bash
# Test local endpoint
curl http://localhost:8000/health

# Check service binding
netstat -tlnp | grep :8000

# Verify nginx configuration
sudo nginx -t
sudo systemctl status nginx
```

#### **Performance Issues**
```bash
# Check system resources
top
free -h
df -h

# Monitor service logs
sudo journalctl -u mivaa-pdf-extractor -f

# Check database connections
# (Check Supabase dashboard for connection pool status)
```

### 🔄 Recovery Procedures

#### **Automatic Recovery**
The deployment workflows include automatic recovery features:
1. Health check failure detection
2. Automatic service restart
3. Post-restart verification
4. Status reporting

#### **Manual Recovery**
```bash
# Full service restart
sudo systemctl restart mivaa-pdf-extractor

# Clear logs and restart
sudo journalctl --vacuum-time=1d
sudo systemctl restart mivaa-pdf-extractor

# Rebuild and restart (if needed)
cd /path/to/mivaa-pdf-extractor
git pull origin main
sudo systemctl restart mivaa-pdf-extractor
```

## 📊 Performance Metrics

### Expected Response Times
- **Similarity Search**: 200-800ms
- **Multi-Modal Analysis**: 1-4 seconds
- **Job Details**: 100-300ms
- **Metrics Analysis**: 1-2 seconds
- **Auto-Population**: 2-5 seconds per document
- **Two-Stage Classification**: 25-55 seconds for 200 chunks → 15 products
- **Embedding Generation**: 1.5-3 seconds per entity
- **Chunk Quality Analysis**: 500ms - 1 second

### Throughput Capabilities
- **Concurrent Requests**: Up to 10 simultaneous
- **Batch Processing**: 100 documents per batch
- **Daily Volume**: 1000+ document analyses
- **Embedding Generation**: 5-10 entities per minute (batch mode)

### Quality Metrics
- **Similarity Accuracy**: 85%+ relevance
- **Entity Extraction**: 90%+ precision
- **Material Recognition**: 80%+ accuracy
- **Processing Success Rate**: 95%+
- **Product Classification Accuracy**: 85%+ with two-stage system
- **Chunk Quality Score**: Average 0.82 (scale 0-1)

---

## 📈 Performance Optimization

### 🚀 Configuration Tuning
- **Database Pool Size**: Adjust `DATABASE_POOL_SIZE` based on load (default: 20)
- **Cache TTL**: Optimize `CACHE_TTL` for your use case (default: 3600s)
- **Worker Processes**: Configure Uvicorn workers for concurrent requests
- **Memory Management**: Monitor and adjust Python memory settings
- **Batch Size**: Configure embedding batch size (default: 5)
- **Rate Limiting**: 1-second delays between batches to prevent overload

### 📊 Monitoring Metrics
- **Response Times**: Track API endpoint response times
- **Error Rates**: Monitor 4xx/5xx error rates (target: <1%)
- **Resource Usage**: CPU, memory, and disk utilization
- **Database Performance**: Query times and connection pool usage
- **AI Model Performance**: Track model response times and accuracy
- **Embedding Coverage**: Monitor percentage of entities with embeddings

## 🔗 Integration Points

### 🌐 Frontend Integration
- **API Calls**: React application communicates via REST API
- **Authentication**: JWT tokens for secure communication
- **Error Handling**: Structured error responses with proper HTTP codes

### 🗄️ Database Integration
- **Supabase**: PostgreSQL with vector extensions
- **Connection Pooling**: Managed connection pool for performance
- **Migrations**: Database schema management (when available)

### 🤖 AI Service Integration
- **OpenAI**: GPT models for text generation and analysis
- **HuggingFace**: Embedding models and transformers
- **Vector Search**: Semantic similarity search with optimized embeddings

## 🧪 Testing & Validation

### Test Scenarios
1. **Vector Similarity**: Test semantic search accuracy
2. **Multi-Modal Analysis**: Validate text+image processing
3. **Job Monitoring**: Verify real-time progress tracking
4. **Metadata Extraction**: Test auto-population accuracy
5. **Product Classification**: Validate two-stage classification performance
6. **Chunk Quality**: Test quality scoring and flagging

### Validation Methods
- **AI Testing Panel**: Comprehensive testing interface in admin panel
- **Confidence Scoring**: Quality validation via confidence thresholds
- **Performance Monitoring**: Response time and success rate tracking
- **Error Handling**: Graceful failure and recovery testing
- **End-to-End Tests**: Complete pipeline validation scripts

### Quality Assurance
- **Automated Testing**: Continuous integration testing
- **Manual Validation**: Regular accuracy assessments
- **Performance Benchmarks**: Response time monitoring
- **Error Rate Tracking**: Failure analysis and improvement
- **User Acceptance Testing**: Production validation with real data

---

## 🚨 Error Handling

### Common Errors
1. **503 Service Unavailable**: MIVAA service down or restarting
2. **401 Unauthorized**: Invalid authentication token
3. **429 Rate Limited**: Too many concurrent requests
4. **500 Internal Error**: Processing failure or AI model error
5. **502 Bad Gateway**: Nginx proxy error or service not responding

### Error Recovery
- **Automatic Retry**: 3 attempts with exponential backoff
- **Graceful Degradation**: Fallback to basic processing when AI models fail
- **User Notification**: Clear error messages with actionable guidance
- **Logging**: Comprehensive error tracking with Sentry integration
- **Auto-Recovery**: Automatic service restart on health check failures

---

## 📚 Related Documentation

### Live Services
- **API Documentation**: [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
- **ReDoc Documentation**: [https://v1api.materialshub.gr/redoc](https://v1api.materialshub.gr/redoc)
- **OpenAPI Schema**: [https://v1api.materialshub.gr/openapi.json](https://v1api.materialshub.gr/openapi.json)

### Documentation
- [Complete API Reference](./api-documentation.md) - All 37+ endpoints documented
- [Deployment Guide](./deployment-guide.md) - Comprehensive deployment information
- [PDF Processing Flow](./pdf-processing-complete-flow.md) - Complete PDF processing pipeline
- [Product Detection](./product-detection-and-chunk-quality-improvements.md) - Two-stage classification details
- [Multi-Vector Storage](./multi-vector-storage-system.md) - Embedding architecture
- [Platform Flows](./platform-flows.md) - Integration workflows
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions

### GitHub
- **Repository**: [Material Kai Vision Platform](https://github.com/creativeghq/material-kai-vision-platform)
- **Issues**: Report bugs and request features
- **Deployment Workflows**: `.github/workflows/deploy.yml`

---

**Note**: This document consolidates information from the previous `mivaa-integration.md` file, which has been merged into this comprehensive guide.
