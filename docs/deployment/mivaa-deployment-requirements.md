# MIVAA PDF Extractor - Deployment Requirements Analysis

## Overview

The MIVAA PDF Extractor is a sophisticated Python FastAPI application that provides multi-modal document processing capabilities with AI/ML integrations. This document outlines the complete deployment requirements for Digital Ocean infrastructure.

## Application Architecture

### Core Technology Stack
- **Runtime**: Python 3.11
- **Framework**: FastAPI with Uvicorn ASGI server
- **Container**: Docker multi-stage build
- **Dependencies**: 91 Python packages including heavy ML libraries

### Key Capabilities
- PDF processing with PyMuPDF and pymupdf4llm
- RAG (Retrieval Augmented Generation) with LlamaIndex
- Multi-modal AI processing (OpenAI, Anthropic, CLIP)
- Computer vision with OpenCV, PyTorch, Transformers
- OCR capabilities (EasyOCR, Tesseract)
- Vector search with Supabase integration
- Real-time monitoring with Sentry
- Structured logging with structlog

## Infrastructure Requirements

### Compute Requirements

#### Minimum Specifications
- **CPU**: 2 vCPUs (for basic operation)
- **RAM**: 4GB (minimum for ML libraries)
- **Storage**: 20GB SSD
- **Network**: 1TB transfer

#### Recommended Specifications
- **CPU**: 4 vCPUs (for production workloads)
- **RAM**: 8GB (optimal for ML processing)
- **Storage**: 40GB SSD
- **Network**: 2TB transfer

#### Heavy Processing Workloads
- **CPU**: 8 vCPUs (for concurrent processing)
- **RAM**: 16GB (for large document processing)
- **Storage**: 80GB SSD
- **GPU**: Optional CUDA support for PyTorch acceleration

### Digital Ocean Droplet Recommendations

#### Development/Testing
- **Droplet**: `s-2vcpu-4gb` ($24/month)
- **Use Case**: Development, testing, light processing

#### Production
- **Droplet**: `s-4vcpu-8gb` ($48/month)
- **Use Case**: Production workloads, moderate processing

#### High-Performance
- **Droplet**: `c-8vcpu-16gb` ($96/month)
- **Use Case**: Heavy document processing, concurrent users

## System Dependencies

### Operating System Requirements
- **Base OS**: Ubuntu 22.04 LTS (recommended)
- **Container Runtime**: Docker 24.0+
- **Process Manager**: systemd for service management

### Required System Packages
```bash
# Essential build tools
build-essential
curl
wget
git

# Python development
python3.11
python3.11-dev
python3-pip

# Image processing libraries
libopencv-dev
libjpeg-dev
libpng-dev
libtiff-dev

# OCR dependencies
tesseract-ocr
tesseract-ocr-eng
libleptonica-dev

# SSL/TLS support
ca-certificates
openssl
```

### Docker Configuration
- **Base Image**: `python:3.11-slim`
- **Multi-stage build**: Optimized for production
- **Security**: Non-root user execution
- **Health checks**: Built-in endpoint monitoring
- **Resource limits**: Configurable memory/CPU limits

## Application Configuration

### Environment Variables (100+ required)
See `docs/deployment/secrets-configuration-guide.md` for complete list.

#### Critical Configuration Categories
1. **Core Application**
   - `APP_NAME`, `APP_VERSION`, `DEBUG`, `LOG_LEVEL`
   - `HOST`, `PORT`, `MAX_WORKERS`

2. **Database & Storage**
   - Supabase connection strings and API keys
   - Redis configuration for caching
   - File upload and processing limits

3. **AI/ML Services**
   - OpenAI API keys and model configurations
   - Anthropic API keys
   - Hugging Face model access
   - CLIP and computer vision settings

4. **External Integrations**
   - ConvertAPI for document conversion
   - Jina AI for embeddings
   - Replicate for model inference
   - Sentry for error tracking

5. **Security & Authentication**
   - JWT secret keys and algorithms
   - Material Kai platform integration
   - CORS origins and security headers

### File System Requirements
```
/app/
├── app/                 # Application code
├── logs/               # Application logs (persistent)
├── uploads/            # Temporary file uploads
├── temp/              # Processing workspace
└── models/            # Cached ML models (optional)
```

### Persistent Storage Needs
- **Logs**: 1-5GB (depending on retention)
- **Temporary files**: 2-10GB (processing workspace)
- **Model cache**: 5-20GB (optional, for offline models)

## Network & Security

### Port Configuration
- **Application**: 8000 (HTTP)
- **Health Check**: 8000/health
- **Metrics**: 8000/metrics (if enabled)

### Firewall Rules
```bash
# Inbound
22/tcp    # SSH (restricted to admin IPs)
80/tcp    # HTTP (redirect to HTTPS)
443/tcp   # HTTPS (application traffic)
8000/tcp  # Direct app access (optional, behind proxy)

# Outbound
443/tcp   # HTTPS (API calls)
53/udp    # DNS resolution
```

### SSL/TLS Requirements
- **Certificate**: Let's Encrypt or commercial SSL
- **Proxy**: Nginx or Traefik for HTTPS termination
- **HSTS**: Enforce HTTPS connections
- **Security Headers**: CSP, X-Frame-Options, etc.

## Performance Considerations

### Resource Usage Patterns
- **CPU**: Spikes during document processing
- **Memory**: High baseline due to ML libraries (2-4GB)
- **I/O**: Intensive during file uploads/processing
- **Network**: Moderate for API calls to external services

### Scaling Strategies
1. **Vertical Scaling**: Increase droplet size for more resources
2. **Horizontal Scaling**: Multiple droplets behind load balancer
3. **Processing Queue**: Redis/Celery for background processing
4. **CDN**: For static assets and processed documents

### Monitoring Requirements
- **Application Metrics**: Response times, error rates
- **System Metrics**: CPU, memory, disk usage
- **External Dependencies**: API response times
- **Log Aggregation**: Centralized logging with retention

## Deployment Architecture Options

### Option 1: Single Droplet (Recommended for Start)
```
[Internet] → [Nginx Proxy] → [Docker Container] → [External APIs]
                ↓
           [Let's Encrypt SSL]
```

### Option 2: Load Balanced (Production Scale)
```
[Internet] → [Load Balancer] → [Multiple Droplets] → [External APIs]
                ↓                      ↓
           [SSL Termination]    [Shared Storage/DB]
```

### Option 3: Microservices (Enterprise)
```
[Internet] → [API Gateway] → [Processing Service] → [External APIs]
                ↓              ↓
           [Auth Service]  [Queue Service]
                ↓              ↓
           [Database]     [File Storage]
```

## Backup & Recovery

### Data Backup Strategy
- **Application Code**: Git repository
- **Configuration**: Environment variables in secure storage
- **Logs**: Regular rotation and archival
- **Processed Data**: Backup to Digital Ocean Spaces

### Disaster Recovery
- **RTO**: 30 minutes (Recovery Time Objective)
- **RPO**: 1 hour (Recovery Point Objective)
- **Backup Frequency**: Daily automated backups
- **Testing**: Monthly recovery drills

## Cost Estimation

### Monthly Costs (USD)
| Component | Development | Production | High-Performance |
|-----------|-------------|------------|------------------|
| Droplet | $24 | $48 | $96 |
| Load Balancer | - | $12 | $12 |
| Backup Storage | $2 | $5 | $10 |
| Monitoring | - | $10 | $20 |
| **Total** | **$26** | **$75** | **$138** |

### External Service Costs (Variable)
- **OpenAI API**: $10-100/month (usage-based)
- **Anthropic API**: $5-50/month (usage-based)
- **ConvertAPI**: $10-30/month (document volume)
- **Sentry**: $0-26/month (error volume)

## Security Considerations

### Application Security
- **Input Validation**: File type and size restrictions
- **Rate Limiting**: API endpoint protection
- **Authentication**: JWT-based with secure secrets
- **Data Encryption**: In-transit and at-rest

### Infrastructure Security
- **OS Hardening**: Regular security updates
- **Access Control**: SSH key-based authentication
- **Network Security**: Firewall rules and VPC
- **Monitoring**: Intrusion detection and logging

### Compliance Requirements
- **Data Privacy**: GDPR/CCPA considerations for document processing
- **Audit Logging**: Comprehensive activity tracking
- **Data Retention**: Configurable cleanup policies
- **Access Logs**: User activity monitoring

## Deployment Checklist

### Pre-Deployment
- [ ] Digital Ocean account and API tokens configured
- [ ] Domain name and DNS configuration
- [ ] SSL certificate provisioning
- [ ] All environment variables documented and secured
- [ ] External API keys obtained and tested
- [ ] Backup strategy implemented

### Deployment Process
- [ ] Droplet provisioned with appropriate specifications
- [ ] Docker and dependencies installed
- [ ] Application container built and tested
- [ ] Environment variables configured
- [ ] SSL/TLS certificates installed
- [ ] Monitoring and logging configured
- [ ] Health checks verified
- [ ] Performance testing completed

### Post-Deployment
- [ ] Application functionality verified
- [ ] External integrations tested
- [ ] Monitoring alerts configured
- [ ] Backup procedures tested
- [ ] Documentation updated
- [ ] Team access and permissions configured

## Next Steps

1. **Infrastructure Setup**: Provision Digital Ocean resources
2. **CI/CD Pipeline**: Automated deployment configuration
3. **Monitoring Setup**: Application and infrastructure monitoring
4. **Security Hardening**: Implement security best practices
5. **Performance Optimization**: Load testing and tuning
6. **Documentation**: Operational runbooks and procedures