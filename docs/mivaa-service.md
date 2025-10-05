# 🤖 MIVAA Service - Complete Documentation

## 🎯 Overview

**MIVAA (Material Intelligence Vision and Analysis Agent)** is the core microservice that powers the Material Kai Vision Platform's document processing, AI analysis, and knowledge extraction capabilities.

### 🏗️ Architecture

- **Framework**: FastAPI + Python 3.9+
- **Purpose**: PDF processing, RAG system, AI coordination
- **Features**: Document extraction, vector embeddings, semantic search
- **AI Integration**: OpenAI, HuggingFace, Replicate APIs
- **Database**: Supabase PostgreSQL with vector extensions
- **Deployment**: Docker containers with systemd service management

### 🌐 Service Endpoints

**Production Base URL**: `https://v1api.materialshub.gr`

#### **Core Endpoints**
- **Health Check**: `https://v1api.materialshub.gr/health`
- **API Documentation**: `https://v1api.materialshub.gr/docs`
- **ReDoc Documentation**: `https://v1api.materialshub.gr/redoc`
- **OpenAPI Schema**: `https://v1api.materialshub.gr/openapi.json`

#### **Functional Endpoints**
- **PDF Processing**: `https://v1api.materialshub.gr/api/v1/pdf/*`
- **AI Analysis**: `https://v1api.materialshub.gr/api/v1/ai/*`
- **Vector Search**: `https://v1api.materialshub.gr/api/v1/search/*`
- **RAG System**: `https://v1api.materialshub.gr/api/v1/rag/*`
- **Document Management**: `https://v1api.materialshub.gr/api/v1/documents/*`

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

## 📈 Performance Optimization

### 🚀 Configuration Tuning
- **Database Pool Size**: Adjust `DATABASE_POOL_SIZE` based on load
- **Cache TTL**: Optimize `CACHE_TTL` for your use case
- **Worker Processes**: Configure Uvicorn workers for concurrent requests
- **Memory Management**: Monitor and adjust Python memory settings

### 📊 Monitoring Metrics
- **Response Times**: Track API endpoint response times
- **Error Rates**: Monitor 4xx/5xx error rates
- **Resource Usage**: CPU, memory, and disk utilization
- **Database Performance**: Query times and connection pool usage

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

## 📚 Additional Resources

- **API Documentation**: [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
- **ReDoc Documentation**: [https://v1api.materialshub.gr/redoc](https://v1api.materialshub.gr/redoc)
- **GitHub Repository**: [Material Kai Vision Platform](https://github.com/creativeghq/material-kai-vision-platform)
- **Deployment Guide**: See `docs/deployment-guide.md` for comprehensive deployment information
- **API Reference**: See `docs/api-documentation.md` for complete API documentation
