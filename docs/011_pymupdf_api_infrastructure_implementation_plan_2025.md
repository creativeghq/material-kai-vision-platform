+++
id = "pymupdf4llm-supabase-rag-implementation-plan-2025"
title = "PyMuPDF4LLM + Supabase LLM-RAG Implementation Plan 2025"
context_type = "strategic"
scope = "Complete technical implementation plan for PDF-to-Markdown microservice using PyMuPDF4LLM with Supabase integration for LLM-RAG workflows"
target_audience = ["dev-python", "baas-supabase", "infra-specialist", "lead-backend", "manager-project"]
granularity = "detailed"
status = "active"
last_updated = "2025-07-22"
version = "2.0"
tags = ["pymupdf4llm", "supabase", "llm", "rag", "markdown", "microservice", "pdf", "implementation", "droplet", "nginx"]
related_context = [
    "docs/002_pdf2html_microservice_pivot_2025.md",
    "docs/003_pdf2html_microservice_architecture_2025.md",
    "docs/004_pdf2html_api_specifications_2025.md"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Complete implementation roadmap for PDF-to-Markdown LLM-RAG microservice"
+++

# PyMuPDF4LLM + Supabase LLM-RAG Implementation Plan 2025

## Executive Summary

This document provides a comprehensive implementation plan for the **PDF-to-Markdown microservice** using **PyMuPDF4LLM** as the primary PDF processing engine, with **Supabase integration** for LLM-RAG workflows. This approach eliminates HTML conversion entirely, focusing on **Markdown chunking** optimized for Large Language Model consumption, with **cloud-native data storage** and **remote image handling**.

### Major Pivot Highlights

- **🔄 HTML → Markdown**: Complete elimination of HTML conversion in favor of LLM-optimized Markdown output
- **☁️ Supabase-Centric**: PDF input from Supabase Storage URLs, processed data stored in Supabase Database
- **🤖 LLM-RAG Optimized**: Built-in chunking, metadata extraction, and structure preservation for RAG workflows
- **📦 Zero Local Storage**: Fully cloud-native approach with in-memory processing
- **🖼️ Remote Image Handling**: Images extracted and uploaded directly to Supabase Storage
## 🎯 **MAJOR DISCOVERY: MIVAA Repository Foundation**

**🚀 GAME CHANGER**: We have identified the [`MIVAA-ai/mivaa-pdf-extractor`](https://github.com/MIVAA-ai/mivaa-pdf-extractor) repository as an **exceptional foundation** that can save us **60-80% of development time**. This production-ready FastAPI application uses PyMuPDF4LLM as its core library and perfectly aligns with our technical requirements.

### **✅ Perfect Technical Alignment**
- **PyMuPDF4LLM Core**: ✅ Uses `pymupdf4llm.to_markdown()` for LLM-optimized extraction
- **FastAPI Ready**: ✅ Complete FastAPI application with proper endpoints
- **Production Features**: ✅ Docker support, file handling, error management
- **Advanced Processing**: ✅ Table extraction, image handling, metadata support

### **⏱️ Development Timeline Impact**
- **Original Estimate**: 4-5 weeks from scratch
- **With MIVAA Foundation**: 2-3 weeks (60-80% time savings)
- **What's Already Built**: Core PDF processing, FastAPI structure, Docker deployment
- **What We Need**: Supabase integration, API restructuring, infrastructure setup

### **🔧 Required Modifications for Our Use Case**
1. **Supabase Integration**: Add cloud-native storage and database operations
2. **API Restructuring**: Align endpoints with our specification (`/process-pdf`, `/search`, etc.)
3. **Job Tracking**: Implement async processing with status endpoints
4. **Infrastructure**: Configure for DigitalOcean droplet deployment with NGINX
5. **Vector Search**: Add RAG capabilities with Supabase pgvector


## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL (Node.js/TypeScript)             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Material Kai Vision Platform              │    │
│  │                                                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │    │
│  │  │  LLM-RAG        │    │   Hybrid PDF Pipeline  │ │    │
│  │  │  Components     │    │                         │ │    │
│  │  │                 │    │  - Markdown Processing │ │    │
│  │  │  - ChunkViewer  │    │  - Chunk Management    │ │    │
│  │  │  - RAGInterface │    │  - Quality Metrics     │ │    │
│  │  │  - Workflow     │    │  - Vector Search       │ │    │
│  │  └─────────────────┘    └─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS API Calls
                                ▼
┌─────────────────────────────────────────────────────────────┐
│              DIGITALOCEAN DROPLET (Ubuntu)                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    NGINX                            │    │
│  │              (Reverse Proxy)                        │    │
│  │                                                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │    │
│  │  │   Port 80/443   │    │      SSL/TLS           │ │    │
│  │  │   (HTTP/HTTPS)  │    │   (Let's Encrypt)       │ │    │
│  │  └─────────────────┘    └─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                │                             │
│                                │ Proxy to                    │
│                                ▼                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           PyMuPDF4LLM API Service                  │    │
│  │                (Python/FastAPI)                    │    │
│  │                                                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │    │
│  │  │   Port 8000     │    │    PyMuPDF4LLM         │ │    │
│  │  │   (Internal)    │    │                         │ │    │
│  │  │                 │    │  - Markdown Extraction │ │    │
│  │  │  - FastAPI      │    │  - LLM-Optimized       │ │    │
│  │  │  - Pydantic     │    │  - Smart Chunking      │ │    │
│  │  │  - Uvicorn      │    │  - Image Extraction    │ │    │
│  │  │  - PM2 Managed  │    │  - Metadata Handling   │ │    │
│  │  └─────────────────┘    └─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                ConvertAPI                           │    │
│  │              (Fallback Service)                     │    │
│  │                                                     │    │
│  │  - Secondary processing option                      │    │
│  │  - Edge case handling                               │    │
│  │  - Quality comparison                               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                │
                                │ Cloud Integration
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE CLOUD                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Storage Bucket                      │    │
│  │                                                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │    │
│  │  │   PDF Files     │    │   Extracted Images     │ │    │
│  │  │   (Input)       │    │   (Output)              │ │    │
│  │  └─────────────────┘    └─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                PostgreSQL Database                  │    │
│  │                                                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │    │
│  │  │  Markdown       │    │   Processing            │ │    │
│  │  │  Chunks         │    │   Metadata              │ │    │
│  │  │                 │    │                         │ │    │
│  │  │  - Content      │    │  - Document Info        │ │    │
│  │  │  - Metadata     │    │  - Processing Status    │ │    │
│  │  │  - Embeddings   │    │  - Quality Metrics      │ │    │
│  │  │  - Relationships│    │  - Error Logs           │ │    │
│  │  └─────────────────┘    └─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **LLM-RAG Optimized**: Purpose-built for Large Language Model consumption and Retrieval-Augmented Generation workflows
2. **Cloud-Native Storage**: Zero local storage with Supabase for both input PDFs and output data
3. **Markdown-First**: Complete elimination of HTML conversion in favor of structured Markdown output
4. **Smart Chunking**: Intelligent content segmentation with metadata preservation for optimal LLM processing
5. **Remote Image Handling**: Direct upload of extracted images to cloud storage with URL references
6. **Hybrid Processing**: PyMuPDF4LLM as primary with ConvertAPI fallback for edge cases
7. **Scalable Infrastructure**: Simple droplet deployment with cloud-native data persistence

## Infrastructure Implementation

### 1. DigitalOcean Droplet Setup

#### Droplet Specifications
```yaml
Droplet Configuration:
  Size: 2 vCPUs, 4GB RAM, 80GB SSD ($24/month)
  OS: Ubuntu 22.04 LTS
  Region: Choose closest to primary users
  Networking: IPv4 + IPv6, Private networking enabled
  Monitoring: Enable droplet monitoring
  Backups: Enable weekly backups
```

#### Initial Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip software-properties-common build-essential

# Install Python 3.11 with development headers
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Install system dependencies for PyMuPDF4LLM
sudo apt install -y libmupdf-dev mupdf-tools

# Install Node.js (for PM2)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install NGINX
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Create application user
sudo useradd -m -s /bin/bash pdfapi
sudo usermod -aG sudo pdfapi
```

### 2. NGINX Configuration

#### Main NGINX Config (`/etc/nginx/sites-available/pdf-api`)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # File upload limits
    client_max_body_size 50M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # Proxy to PyMuPDF API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for PDF processing
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
    
    # Static files (if needed)
    location /static/ {
        alias /opt/pdf-api/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/pdf-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL Certificate Setup

```bash
# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal setup (already configured by certbot)
sudo systemctl status certbot.timer
```

## PyMuPDF API Implementation

### 1. Project Structure

```
/opt/pdf-api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application
│   ├── models/
│   │   ├── __init__.py
│   │   ├── request_models.py   # Pydantic request models
│   │   └── response_models.py  # Pydantic response models
│   ├── services/
│   │   ├── __init__.py
│   │   ├── pdf_processor.py    # Core PyMuPDF processing
│   │   ├── html_converter.py   # HTML generation
│   │   ├── image_extractor.py  # Image handling
│   │   ├── layout_analyzer.py  # Layout analysis
│   │   └── convertapi_fallback.py # ConvertAPI integration
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── file_handler.py     # File operations
│   │   ├── validators.py       # Input validation
│   │   └── logger.py          # Logging configuration
│   └── config/
│       ├── __init__.py
│       └── settings.py        # Application settings
├── requirements.txt
├── ecosystem.config.js        # PM2 configuration
├── .env                      # Environment variables
├── logs/                     # Application logs
├── temp/                     # Temporary file storage
└── static/                   # Static assets
```

### 2. Core Dependencies

#### requirements.txt
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pymupdf4llm==0.0.12
supabase==2.3.4
python-multipart==0.0.6
python-dotenv==1.0.0
aiofiles==23.2.1
httpx==0.25.2
structlog==23.2.0
python-json-logger==2.0.7
pillow==10.1.0
```

### 3. FastAPI Application

#### app/main.py
```python
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from .models.request_models import PDFProcessRequest, ProcessingOptions
from .models.response_models import PDFProcessResponse, HealthResponse, ChunkResponse
from .services.pdf_processor import PyMuPDF4LLMProcessor
from .services.supabase_client import SupabaseClient
from .services.convertapi_fallback import ConvertAPIFallback
from .utils.validators import validate_pdf_url
from .config.settings import get_settings

# Configure structured logging
logger = structlog.get_logger()

# Initialize FastAPI app
app = FastAPI(
    title="PDF2Markdown LLM-RAG Microservice",
    description="High-performance PDF to Markdown conversion for LLM workflows using PyMuPDF4LLM + Supabase",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-vercel-app.vercel.app"],  # Your Vercel domain
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Initialize services
settings = get_settings()
pdf_processor = PyMuPDF4LLMProcessor()
supabase_client = SupabaseClient()
convertapi_fallback = ConvertAPIFallback()

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Test PyMuPDF4LLM import
        import pymupdf4llm
        
        # Test Supabase connection
        supabase_status = await supabase_client.test_connection()
        
        return HealthResponse(
            status="healthy",
            service="pdf2markdown-llm-api",
            version="2.0.0",
            pymupdf4llm_available=True,
            supabase_connected=supabase_status,
            timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=503, detail="Service unhealthy")

@app.post("/process-pdf", response_model=PDFProcessResponse)
async def process_pdf_from_url(
    request: PDFProcessRequest,
    background_tasks: BackgroundTasks
):
    """
    Process PDF from Supabase URL and extract content as Markdown chunks for LLM workflows
    """
    try:
        # Validate PDF URL
        if not validate_pdf_url(request.pdf_url):
            raise HTTPException(status_code=400, detail="Invalid PDF URL")
        
        # Generate processing job ID
        job_id = str(uuid.uuid4())
        
        logger.info("Starting PDF processing",
                   job_id=job_id,
                   pdf_url=request.pdf_url,
                   options=request.options)
        
        # Process PDF using PyMuPDF4LLM
        result = await pdf_processor.process_pdf_from_url(
            pdf_url=request.pdf_url,
            options=request.options,
            job_id=job_id
        )
        
        # Store results in Supabase
        storage_result = await supabase_client.store_processing_result(
            job_id=job_id,
            pdf_url=request.pdf_url,
            chunks=result.chunks,
            metadata=result.metadata,
            images=result.images
        )
        
        logger.info("PDF processing completed",
                   job_id=job_id,
                   chunks_count=len(result.chunks),
                   images_count=len(result.images))
        
        return PDFProcessResponse(
            job_id=job_id,
            status="completed",
            chunks_count=len(result.chunks),
            images_count=len(result.images),
            processing_time=result.processing_time,
            supabase_storage_id=storage_result.storage_id,
            chunks_preview=result.chunks[:3] if result.chunks else []
        )
        
    except Exception as e:
        logger.error("PDF processing failed",
                    job_id=job_id if 'job_id' in locals() else "unknown",
                    error=str(e))
        
        # Try ConvertAPI fallback if enabled
        if settings.CONVERTAPI_FALLBACK_ENABLED:
            try:
                fallback_result = await convertapi_fallback.process_pdf(
                    pdf_url=request.pdf_url,
                    job_id=job_id if 'job_id' in locals() else str(uuid.uuid4())
                )
                return fallback_result
            except Exception as fallback_error:
                logger.error("ConvertAPI fallback also failed", error=str(fallback_error))
        
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/job/{job_id}", response_model=PDFProcessResponse)
async def get_job_status(job_id: str):
    """Get processing job status and results"""
    try:
        result = await supabase_client.get_processing_result(job_id)
        if not result:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return result
    except Exception as e:
        logger.error("Failed to get job status", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chunks/{job_id}", response_model=List[ChunkResponse])
async def get_chunks(job_id: str, page: int = 1, limit: int = 50):
    """Get paginated chunks for a processing job"""
    try:
        chunks = await supabase_client.get_chunks_paginated(
            job_id=job_id,
            page=page,
            limit=limit
        )
        return chunks
    except Exception as e:
        logger.error("Failed to get chunks", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 4. PyMuPDF4LLM Processor Service

#### app/services/pdf_processor.py
```python
import asyncio
import httpx
import pymupdf4llm
import tempfile
import os
from typing import Dict, List, Any, Optional
from datetime import datetime
import structlog
from pathlib import Path

from ..models.response_models import ProcessingResult, ChunkData, ImageData
from ..models.request_models import ProcessingOptions
from ..config.settings import get_settings

logger = structlog.get_logger()

class PyMuPDF4LLMProcessor:
    """PDF processor using PyMuPDF4LLM for LLM-optimized content extraction"""
    
    def __init__(self):
        self.settings = get_settings()
    
    async def process_pdf_from_url(
        self,
        pdf_url: str,
        options: Optional[ProcessingOptions] = None,
        job_id: str = None
    ) -> ProcessingResult:
        """
        Download PDF from URL and process it using PyMuPDF4LLM
        """
        start_time = datetime.utcnow()
        
        try:
            # Download PDF from Supabase URL
            pdf_content = await self._download_pdf(pdf_url)
            
            # Process with PyMuPDF4LLM
            result = await self._process_pdf_content(
                pdf_content=pdf_content,
                options=options or ProcessingOptions(),
                job_id=job_id
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            result.processing_time = processing_time
            
            return result
            
        except Exception as e:
            logger.error("PDF processing failed",
                        job_id=job_id,
                        pdf_url=pdf_url,
                        error=str(e))
            raise
    
    async def _download_pdf(self, pdf_url: str) -> bytes:
        """Download PDF from URL"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(pdf_url)
            response.raise_for_status()
            return response.content
    
    async def _process_pdf_content(
        self,
        pdf_content: bytes,
        options: ProcessingOptions,
        job_id: str
    ) -> ProcessingResult:
        """Process PDF content using PyMuPDF4LLM"""
        
        # Create temporary file for processing
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
            temp_file.write(pdf_content)
            temp_path = temp_file.name
        
        try:
            # Configure PyMuPDF4LLM options
            pymupdf_options = {
                'page_chunks': options.enable_chunking,
                'write_images': options.extract_images,
                'image_size_limit': options.max_image_size or 2048,
                'extract_words': options.extract_words,
                'margins': (options.margin_left, options.margin_top, options.margin_right, options.margin_bottom)
            }
            
            # Process PDF to markdown
            markdown_content = pymupdf4llm.to_markdown(
                temp_path,
                **pymupdf_options
            )
            
            # Extract metadata
            metadata = await self._extract_metadata(temp_path)
            
            # Create chunks from markdown content
            chunks = await self._create_chunks(
                markdown_content=markdown_content,
                options=options,
                job_id=job_id
            )
            
            # Extract images if requested
            images = []
            if options.extract_images:
                images = await self._extract_images(temp_path, job_id)
            
            return ProcessingResult(
                chunks=chunks,
                metadata=metadata,
                images=images,
                total_pages=metadata.get('page_count', 0),
                processing_time=0  # Will be set by caller
            )
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    async def _extract_metadata(self, pdf_path: str) -> Dict[str, Any]:
        """Extract PDF metadata"""
        import fitz  # PyMuPDF
        
        doc = fitz.open(pdf_path)
        metadata = doc.metadata
        
        return {
            'title': metadata.get('title', ''),
            'author': metadata.get('author', ''),
            'subject': metadata.get('subject', ''),
            'creator': metadata.get('creator', ''),
            'producer': metadata.get('producer', ''),
            'creation_date': metadata.get('creationDate', ''),
            'modification_date': metadata.get('modDate', ''),
            'page_count': doc.page_count,
            'file_size': os.path.getsize(pdf_path)
        }
    
    async def _create_chunks(
        self,
        markdown_content: str,
        options: ProcessingOptions,
        job_id: str
    ) -> List[ChunkData]:
        """Create chunks from markdown content"""
        
        if not options.enable_chunking:
            # Return single chunk with all content
            return [ChunkData(
                chunk_id=f"{job_id}_chunk_0",
                content=markdown_content,
                page_numbers=[],
                chunk_index=0,
                word_count=len(markdown_content.split()),
                character_count=len(markdown_content)
            )]
        
        # Split content into chunks based on options
        chunk_size = options.chunk_size or 1000
        overlap = options.chunk_overlap or 100
        
        chunks = []
        words = markdown_content.split()
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i:i + chunk_size]
            chunk_content = ' '.join(chunk_words)
            
            chunks.append(ChunkData(
                chunk_id=f"{job_id}_chunk_{len(chunks)}",
                content=chunk_content,
                page_numbers=[],  # Would need page mapping logic
                chunk_index=len(chunks),
                word_count=len(chunk_words),
                character_count=len(chunk_content)
            ))
        
        return chunks
    
    async def _extract_images(self, pdf_path: str, job_id: str) -> List[ImageData]:
        """Extract images from PDF"""
        import fitz
        
        doc = fitz.open(pdf_path)
        images = []
        
        for page_num in range(doc.page_count):
            page = doc[page_num]
            image_list = page.get_images()
            
            for img_index, img in enumerate(image_list):
                try:
                    xref = img[0]
                    pix = fitz.Pixmap(doc, xref)
                    
                    if pix.n - pix.alpha < 4:  # GRAY or RGB
                        img_data = pix.tobytes("png")
                        
                        images.append(ImageData(
                            image_id=f"{job_id}_img_{page_num}_{img_index}",
                            page_number=page_num + 1,
                            image_data=img_data,
                            format="png",
                            width=pix.width,
                            height=pix.height,
                            size=len(img_data)
                        ))
                    
                    pix = None  # Free memory
                    
                except Exception as e:
                    logger.warning("Failed to extract image",
                                 page=page_num,
                                 image_index=img_index,
                                 error=str(e))
        
        doc.close()
        return images
```

### 5. Supabase Client Service

#### app/services/supabase_client.py
```python
import asyncio
from supabase import create_client, Client
from typing import Dict, List, Any, Optional
import structlog
from datetime import datetime
import json
import base64

from ..models.response_models import ProcessingResult, ChunkData, ImageData, PDFProcessResponse
from ..config.settings import get_settings

logger = structlog.get_logger()

class SupabaseStorageResult:
    def __init__(self, storage_id: str):
        self.storage_id = storage_id

class SupabaseClient:
    """Supabase client for storing and retrieving PDF processing results"""
    
    def __init__(self):
        self.settings = get_settings()
        self.client: Client = create_client(
            self.settings.SUPABASE_URL,
            self.settings.SUPABASE_ANON_KEY
        )
    
    async def test_connection(self) -> bool:
        """Test Supabase connection"""
        try:
            # Simple query to test connection
            result = self.client.table('pdf_processing_jobs').select('id').limit(1).execute()
            return True
        except Exception as e:
            logger.error("Supabase connection test failed", error=str(e))
            return False
    
    async def store_processing_result(
        self,
        job_id: str,
        pdf_url: str,
        chunks: List[ChunkData],
        metadata: Dict[str, Any],
        images: List[ImageData]
    ) -> SupabaseStorageResult:
        """Store PDF processing results in Supabase"""
        
        try:
            # Store main job record
            job_data = {
                'id': job_id,
                'pdf_url': pdf_url,
                'status': 'completed',
                'metadata': metadata,
                'chunks_count': len(chunks),
                'images_count': len(images),
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            self.client.table('pdf_processing_jobs').insert(job_data).execute()
            
            # Store chunks
            if chunks:
                chunk_records = []
                for chunk in chunks:
                    chunk_records.append({
                        'id': chunk.chunk_id,
                        'job_id': job_id,
                        'content': chunk.content,
                        'chunk_index': chunk.chunk_index,
                        'page_numbers': chunk.page_numbers,
                        'word_count': chunk.word_count,
                        'character_count': chunk.character_count,
                        'created_at': datetime.utcnow().isoformat()
                    })
                
                self.client.table('pdf_chunks').insert(chunk_records).execute()
            
            # Store images in Supabase Storage
            if images:
                await self._store_images(job_id, images)
            
            logger.info("Successfully stored processing results",
                       job_id=job_id,
                       chunks_count=len(chunks),
                       images_count=len(images))
            
            return SupabaseStorageResult(storage_id=job_id)
            
        except Exception as e:
            logger.error("Failed to store processing results",
                        job_id=job_id,
                        error=str(e))
            raise
    
    async def _store_images(self, job_id: str, images: List[ImageData]):
        """Store images in Supabase Storage"""
        
        image_records = []
        
        for image in images:
            try:
                # Upload image to Supabase Storage
                file_path = f"pdf-images/{job_id}/{image.image_id}.{image.format}"
                
                upload_result = self.client.storage.from_('pdf-images').upload(
                    file_path,
                    image.image_data,
                    file_options={'content-type': f'image/{image.format}'}
                )
                
                # Get public URL
                public_url = self.client.storage.from_('pdf-images').get_public_url(file_path)
                
                # Store image metadata
                image_records.append({
                    'id': image.image_id,
                    'job_id': job_id,
                    'page_number': image.page_number,
                    'storage_path': file_path,
                    'public_url': public_url,
                    'format': image.format,
                    'width': image.width,
                    'height': image.height,
                    'size': image.size,
                    'created_at': datetime.utcnow().isoformat()
                })
                
            except Exception as e:
                logger.warning("Failed to store image",
                             image_id=image.image_id,
                             error=str(e))
        
        if image_records:
            self.client.table('pdf_images').insert(image_records).execute()
    
    async def get_processing_result(self, job_id: str) -> Optional[PDFProcessResponse]:
        """Get processing result by job ID"""
        
        try:
            # Get job record
            job_result = self.client.table('pdf_processing_jobs').select('*').eq('id', job_id).execute()
            
            if not job_result.data:
                return None
            
            job_data = job_result.data[0]
            
            # Get chunks preview (first 3)
            chunks_result = self.client.table('pdf_chunks').select('*').eq('job_id', job_id).limit(3).execute()
            chunks_preview = [
                ChunkData(
                    chunk_id=chunk['id'],
                    content=chunk['content'],
                    page_numbers=chunk['page_numbers'],
                    chunk_index=chunk['chunk_index'],
                    word_count=chunk['word_count'],
                    character_count=chunk['character_count']
                )
                for chunk in chunks_result.data
            ]
            
            return PDFProcessResponse(
                job_id=job_id,
                status=job_data['status'],
                chunks_count=job_data['chunks_count'],
                images_count=job_data['images_count'],
                processing_time=0,  # Could be calculated from timestamps
                supabase_storage_id=job_id,
                chunks_preview=chunks_preview
            )
            
        except Exception as e:
            logger.error("Failed to get processing result",
                        job_id=job_id,
                        error=str(e))
            raise
    
    async def get_chunks_paginated(
        self,
        job_id: str,
        page: int = 1,
        limit: int = 50
    ) -> List[ChunkData]:
        """Get paginated chunks for a job"""
        
        try:
            offset = (page - 1) * limit
            
            result = self.client.table('pdf_chunks').select('*').eq('job_id', job_id).range(offset, offset + limit - 1).execute()
            
            return [
                ChunkData(
                    chunk_id=chunk['id'],
                    content=chunk['content'],
                    page_numbers=chunk['page_numbers'],
                    chunk_index=chunk['chunk_index'],
                    word_count=chunk['word_count'],
                    character_count=chunk['character_count']
                )
                for chunk in result.data
            ]
            
        except Exception as e:
            logger.error("Failed to get paginated chunks",
                        job_id=job_id,
                        error=str(e))
            raise
):
    """
    Process PDF file and convert to HTML with advanced features
    """
    request_id = generate_request_id()
    logger.info("PDF processing request received", request_id=request_id, filename=file.filename)
    
    try:
        # Validate file
        await validate_pdf_file(file)
        
        # Parse processing options
        processing_options = ProcessingOptions()
        if options:
            try:
                import json
                options_dict = json.loads(options)
                processing_options = ProcessingOptions(**options_dict)
            except Exception as e:
                logger.warning("Invalid options provided, using defaults", error=str(e))
        
        # Save uploaded file temporarily
        temp_file_path = await file_handler.save_temp_file(file)
        
        try:
            # Process with PyMuPDF
            result = await pdf_processor.process_pdf(
                temp_file_path, 
                processing_options,
                request_id
            )
            
            # If PyMuPDF fails and fallback is enabled, try ConvertAPI
            if not result.success and processing_options.enable_fallback:
                logger.info("PyMuPDF processing failed, trying ConvertAPI fallback", request_id=request_id)
                result = await convertapi_fallback.process_pdf(
                    temp_file_path,
                    processing_options,
                    request_id
                )
            
            # Schedule cleanup
            background_tasks.add_task(file_handler.cleanup_temp_file, temp_file_path)
            
            return result
            
        except Exception as e:
            # Ensure cleanup on error
            background_tasks.add_task(file_handler.cleanup_temp_file, temp_file_path)
            raise e
            
    except Exception as e:
        logger.error("PDF processing failed", request_id=request_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/batch-process")
async def batch_process_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    options: Optional[str] = None
):
    """
    Process multiple PDF files in batch
    """
    if len(files) > settings.max_batch_size:
        raise HTTPException(
            status_code=400, 
            detail=f"Batch size exceeds maximum of {settings.max_batch_size}"
        )
    
    batch_id = generate_batch_id()
    logger.info("Batch processing request received", batch_id=batch_id, file_count=len(files))
    
    # Process files concurrently
    tasks = []
    for file in files:
        task = asyncio.create_task(process_single_file(file, options, batch_id))
        tasks.append(task)
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return {
        "batch_id": batch_id,
        "total_files": len(files),
        "results": results,
        "timestamp": datetime.utcnow()
    }

def generate_request_id() -> str:
    """Generate unique request ID"""
    import uuid
    return str(uuid.uuid4())

def generate_batch_id() -> str:
    """Generate unique batch ID"""
    import uuid
    return f"batch_{str(uuid.uuid4())[:8]}"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 4. PyMuPDF Processing Service

#### app/services/pdf_processor.py
```python
import fitz  # PyMuPDF
import asyncio
import structlog
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import json
import base64
from io import BytesIO
from PIL import Image

from ..models.response_models import PDFProcessResponse, ProcessingMetrics, ExtractedContent
from ..models.request_models import ProcessingOptions
from .html_converter import HTMLConverter
from .image_extractor import ImageExtractor
from .layout_analyzer import LayoutAnalyzer

logger = structlog.get_logger()

class PyMuPDFProcessor:
    """
    Advanced PDF processing using PyMuPDF with comprehensive feature set
    """
    
    def __init__(self):
        self.html_converter = HTMLConverter()
        self.image_extractor = ImageExtractor()
        self.layout_analyzer = LayoutAnalyzer()
    
    async def process_pdf(
        self, 
        file_path: str, 
        options: ProcessingOptions,
        request_id: str
    ) -> PDFProcessResponse:
        """
        Main PDF processing method with comprehensive feature extraction
        """
        logger.info("Starting PyMuPDF processing", request_id=request_id, file_path=file_path)
        
        try:
            # Open PDF document
            doc = fitz.open(file_path)
            
            # Extract metadata
            metadata = self._extract_metadata(doc)
            
            # Initialize processing metrics
            metrics = ProcessingMetrics(
                total_pages=len(doc),
                processing_time_ms=0,
                file_size_bytes=Path(file_path).stat().st_size,
                engine_used="PyMuPDF",
                success=True
            )
            
            # Process pages
            pages_content = []
            extracted_images = []
            
            start_time = asyncio.get_event_loop().time()
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Extract page content based on options
                page_content = await self._process_page(
                    page, 
                    page_num, 
                    options,
                    request_id
                )
                
                pages_content.append(page_content)
                
                # Extract images if requested
                if options.extract_images:
                    page_images = await self.image_extractor.extract_page_images(
                        page, 
                        page_num,
                        request_id
                    )
                    extracted_images.extend(page_images)
            
            # Calculate processing time
            end_time = asyncio.get_event_loop().time()
            metrics.processing_time_ms = int((end_time - start_time) * 1000)
            
            # Generate HTML output
            html_content = await self.html_converter.generate_html(
                pages_content,
                metadata,
                options,
                request_id
            )
            
            # Perform layout analysis if requested
            layout_analysis = None
            if options.analyze_layout:
                layout_analysis = await self.layout_analyzer.analyze_document(
                    doc,
                    pages_content,
                    request_id
                )
            
            # Create response
            response = PDFProcessResponse(
                success=True,
                request_id=request_id,
                html_content=html_content,
                extracted_content=ExtractedContent(
                    text=self._extract_full_text(pages_content),
                    images=extracted_images,
                    metadata=metadata,
                    layout_analysis=layout_analysis
                ),
                metrics=metrics,
                processing_options=options
            )
            
            doc.close()
            logger.info("PyMuPDF processing completed successfully", request_id=request_id)
            
            return response
            
        except Exception as e:
            logger.error("PyMuPDF processing failed", request_id=request_id, error=str(e))
            
            return PDFProcessResponse(
                success=False,
                request_id=request_id,
                error_message=str(e),
                metrics=ProcessingMetrics(
                    total_pages=0,
                    processing_time_ms=0,
                    file_size_bytes=Path(file_path).stat().st_size,
                    engine_used="PyMuPDF",
                    success=False
                )
            )
    
    async def _process_page(
        self, 
        page: fitz.Page, 
        page_num: int, 
        options: ProcessingOptions,
        request_id: str
    ) -> Dict:
        """
        Process individual page with comprehensive content extraction
        """
        page_content = {
            "page_number": page_num + 1,
            "text": "",
            "html_blocks": [],
            "images": [],
            "tables": [],
            "annotations": [],
            "layout_info": {}
        }
        
        # Extract text with formatting
        if options.preserve_formatting:
            # Get text with detailed formatting information
            text_dict = page.get_text("dict")
            page_content["text"] = self._extract_formatted_text(text_dict)
            page_content["html_blocks"] = self._convert_to_html_blocks(text_dict)
        else:
            # Simple text extraction
            page_content["text"] = page.get_text()
        
        # Extract tables if requested
        if options.extract_tables:
            tables = page.find_tables()
            for table in tables:
                table_data = table.extract()
                page_content["tables"].append({
                    "bbox": table.bbox,
                    "data": table_data
                })
        
        # Extract annotations if requested
        if options.extract_annotations:
            annotations = page.annots()
            for annot in annotations:
                page_content["annotations"].append({
                    "type": annot.type[1],
                    "content": annot.content,
                    "rect": list(annot.rect)
                })
        
        # Layout analysis
        if options.analyze_layout:
            page_content["layout_info"] = await self.layout_analyzer.analyze_page_layout(
                page,
                page_num,
                request_id
            )
        
        return page_content
    
    def _extract_metadata(self, doc: fitz.Document) -> Dict:
        """Extract comprehensive document metadata"""
        metadata = doc.metadata
        
        return {
            "title": metadata.get("title", ""),
            "author": metadata.get("author", ""),
            "subject": metadata.get("subject", ""),
            "creator": metadata.get("creator", ""),
            "producer": metadata.get("producer", ""),
            "creation_date": metadata.get("creationDate", ""),
            "modification_date": metadata.get("modDate", ""),
            "page_count": len(doc),
            "is_encrypted": doc.needs_pass,
            "is_pdf_a": doc.is_pdf,
            "version": doc.pdf_version() if hasattr(doc, 'pdf_version') else None
        }
    
    def _extract_formatted_text(self, text_dict: Dict) -> str:
        """Extract text while preserving basic formatting"""
        text_parts = []
        
        for block in text_dict.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    line_text = ""
                    for span in line.get("spans", []):
                        line_text += span.get("text", "")
                    text_parts.append(line_text)
                text_parts.append("\n")
        
        return "".join(text_parts)
    
    def _convert_to_html_blocks(self, text_dict: Dict) -> List[Dict]:
        """Convert PyMuPDF text dict to HTML-ready blocks"""
        html_blocks = []
        
        for block in text_dict.get("blocks", []):
            if "lines" in block:
                block_html = {
                    "type": "text_block",
                    "bbox": block.get("bbox", []),
                    "lines": []
                }
                
                for line in block["lines"]:
                    line_html = {
                        "bbox": line.get("bbox", []),
                        "spans": []
                    }
                    
                    for span in line.get("spans", []):
                        span_html = {
                            "text": span.get("text", ""),
                            "font": span.get("font", ""),
                            "size": span.get("size", 12),
                            "flags": span.get("flags", 0),
                            "color": span.get("color", 0),
                            "bbox": span.get("bbox", [])
                        }
                        line_html["spans"].append(span_html)
                    
                    block_html["lines"].append(line_html)
                
                html_blocks.append(block_html)
        
        return html_blocks
    
    def _extract_full_text(self, pages_content: List[Dict]) -> str:
        """Combine text from all pages"""
        full_text = []
        
        for page_content in pages_content:
            full_text.append(f"--- Page {page_content['page_number']} ---")
            full_text.append(page_content["text"])
            full_text.append("")
        
        return "\n".join(full_text)
```

### 5. PM2 Process Management

#### ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'pdf-api',
    script: 'python',
    args: '-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4',
    cwd: '/opt/pdf-api',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PYTHONPATH: '/opt/pdf-api'
    },
    error_file: '/opt/pdf-api/logs/err.log',
    out_file: '/opt/pdf-api/logs/out.log',
    log_file: '/opt/pdf-api/logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

## Deployment Process

### 1. Application Deployment

```bash
# Create application directory
sudo mkdir -p /opt/pdf-api
sudo chown $USER:$USER /opt/pdf-api

# Clone or upload your application code
cd /opt/pdf-api

# Create Python virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir -p logs temp static

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Test the application
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. PM2 Setup

```bash
# Start the application with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions provided by PM2

# Monitor the application
pm2 status
pm2 logs pdf-api
pm2 monit
```

### 3. Security Configuration

```bash
# Configure firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Secure SSH (optional but recommended)
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Set up log rotation
sudo tee /etc/logrotate.d/pdf-api << EOF
/opt/pdf-api/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reload pdf-api
    endscript
}
EOF
```

## Integration with Main Platform

### 1. Update Node.js Service

#### src/services/pdfMicroservice.ts
```typescript
import { ApiService } from './base/ApiService';

interface PDFProcessingOptions {
  preserveFormatting?: boolean;
  extractImages?: boolean;
  extractTables?: boolean;
  extractAnnotations?: boolean;
  analyzeLayout?: boolean;
  enableFallback?: boolean;
  outputFormat?: 'html' | 'json';
  qualityLevel?: 'fast' | 'balanced' | 'high';
}

interface PDFProcessingResult {
  success: boolean;
  requestId: string;
  htmlContent?: string;
  extractedContent?: {
    text: string;
    images?: Array<{
      id: string;
      base64: string;
      format: string;
      bbox: number[];
      pageNumber: number;
    }>;
    metadata?: {
      title: string;
      author: string;
      pageCount: number;
      creationDate: string;
    };
    layoutAnalysis?: {
      columns: number;
      readingOrder: string[];
      textBlocks: Array<{
        id: string;
        text: string;
        bbox: number[];
        confidence: number;
      }>;
    };
  };
  metrics?: {
    processingTimeMs: number;
    totalPages: number;
    fileSizeBytes: number;
    engineUsed: 'PyMuPDF' | 'ConvertAPI';
    success: boolean;
  };
  errorMessage?: string;
}

class PDFMicroserviceClient extends ApiService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor() {
    super();
    this.baseUrl = process.env.PDF_MICROSERVICE_URL || 'https://your-domain.com/api';
    this.apiKey = process.env.PDF_MICROSERVICE_API_KEY;
  }

  async processPDF(
    file: File | Buffer,
    options: PDFProcessingOptions = {}
  ): Promise<PDFProcessingResult> {
    const formData = new FormData();
    
    if (file instanceof File) {
      formData.append('file', file);
    } else {
      formData.append('file', new Blob([file]), 'document.pdf');
    }
    
    if (Object.keys(options).length > 0) {
      formData.append('options', JSON.stringify(options));
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/process`, {
        method: 'POST',
        body: formData,
        headers,
      });

      if (!response.ok) {
        throw new Error(`PDF processing failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('PDF microservice error:', error);
      throw error;
    }
  }

  async batchProcessPDFs(
    files: Array<File | Buffer>,
    options: PDFProcessingOptions = {}
  ): Promise<{
    batchId: string;
    totalFiles: number;
    results: PDFProcessingResult[];
  }> {
    const formData = new FormData();
    
    files.forEach((file, index) => {
      if (file instanceof File) {
        formData.append('files', file);
      } else {
        formData.append('files', new Blob([file]), `document_${index}.pdf`);
      }
    });
    
    if (Object.keys(options).length > 0) {
      formData.append('options', JSON.stringify(options));
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/batch-process`, {
        method: 'POST',
        body: formData,
        headers,
      });

      if (!response.ok) {
        throw new Error(`Batch PDF processing failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('PDF batch processing error:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: string;
    service: string;
    version: string;
    pymupdfVersion: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  }
}

export { PDFMicroserviceClient, type PDFProcessingOptions, type PDFProcessingResult };
```

### 2. Update Hybrid PDF Pipeline

#### src/services/hybridPDFPipeline.ts (Updated Integration)
```typescript
import { PDFMicroserviceClient, type PDFProcessingOptions, type PDFProcessingResult } from './pdfMicroservice';
import { ConvertAPIService } from './convertapi';

export class HybridPDFPipeline {
  private pdfMicroservice: PDFMicroserviceClient;
  private convertAPI: ConvertAPIService;

  constructor() {
    this.pdfMicroservice = new PDFMicroserviceClient();
    this.convertAPI = new ConvertAPIService();
  }

  async processDocument(
    file: File,
    options: {
      preferredEngine?: 'pymupdf' | 'convertapi' | 'auto';
      fallbackEnabled?: boolean;
      qualityThreshold?: number;
    } = {}
  ): Promise<PDFProcessingResult> {
    const {
      preferredEngine = 'auto',
      fallbackEnabled = true,
      qualityThreshold = 0.8
    } = options;

    // Primary processing attempt
    let result: PDFProcessingResult;
    
    if (preferredEngine === 'pymupdf' || preferredEngine === 'auto') {
      try {
        result = await this.pdfMicroservice.processPDF(file, {
          preserveFormatting: true,
          extractImages: true,
          extractTables: true,
          analyzeLayout: true,
          enableFallback: false,
          qualityLevel: 'high'
        });

        // Check quality metrics
        if (result.success && this.assessQuality(result) >= qualityThreshold) {
          return result;
        }
      } catch (error) {
        console.warn('PyMuPDF processing failed:', error);
      }
    }

    // Fallback to ConvertAPI if enabled
    if (fallbackEnabled && (preferredEngine === 'convertapi' || preferredEngine === 'auto')) {
      try {
        console.log('Falling back to ConvertAPI processing');
        result = await this.convertAPI.processPDF(file);
        
        if (result.success) {
          result.metrics = {
            ...result.metrics,
            engineUsed: 'ConvertAPI'
          };
          return result;
        }
      } catch (error) {
        console.error('ConvertAPI fallback failed:', error);
      }
    }

    throw new Error('All PDF processing engines failed');
  }

  private assessQuality(result: PDFProcessingResult): number {
    if (!result.success || !result.extractedContent) {
      return 0;
    }

    let score = 0.5; // Base score for successful processing

    // Text extraction quality
    const textLength = result.extractedContent.text?.length || 0;
    if (textLength > 100) score += 0.2;
    if (textLength > 1000) score += 0.1;

    // Layout analysis quality
    if (result.extractedContent.layoutAnalysis) {
      score += 0.2;
      if (result.extractedContent.layoutAnalysis.textBlocks?.length > 0) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }
}
```

## Monitoring and Maintenance

### 1. System Monitoring

#### Monitoring Stack Setup
```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# Setup log monitoring
sudo tee /etc/rsyslog.d/50-pdf-api.conf << EOF
# PDF API logging
local0.*    /var/log/pdf-api.log
EOF

sudo systemctl restart rsyslog
```

#### Health Check Script
```bash
#!/bin/bash
# /opt/pdf-api/scripts/health-check.sh

API_URL="https://your-domain.com/api/health"
LOG_FILE="/var/log/pdf-api-health.log"

# Check API health
response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL")

if [ "$response" = "200" ]; then
    echo "$(date): API healthy" >> "$LOG_FILE"
else
    echo "$(date): API unhealthy (HTTP $response)" >> "$LOG_FILE"
    
    # Restart service if unhealthy
    pm2 restart pdf-api
    
    # Send alert (configure with your notification system)
    # curl -X POST "your-webhook-url" -d "PDF API is down"
fi
```

#### Cron Job for Health Checks
```bash
# Add to crontab
*/5 * * * * /opt/pdf-api/scripts/health-check.sh
```

### 2. Performance Optimization

#### NGINX Optimization
```nginx
# Add to /etc/nginx/sites-available/pdf-api

# Gzip compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Connection optimization
keepalive_timeout 65;
keepalive_requests 100;

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;
```

#### Python Performance Tuning
```python
# app/config/settings.py
import os
from pydantic import BaseSettings

class Settings(BaseSettings):
    # Performance settings
    max_workers: int = 4
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    max_batch_size: int = 10
    temp_file_ttl: int = 3600  # 1 hour
    
    # PyMuPDF settings
    pymupdf_max_memory: int = 512 * 1024 * 1024  # 512MB
    
    # Concurrency settings
    async_timeout: int = 300  # 5 minutes
    
    class Config:
        env_file = ".env"

def get_settings():
    return Settings()
```

### 3. Backup and Recovery

#### Database Backup (if using database)
```bash
#!/bin/bash
# /opt/pdf-api/scripts/backup.sh

BACKUP_DIR="/opt/pdf-api/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup application files
tar -czf "$BACKUP_DIR/pdf-api-$DATE.tar.gz" \
    --exclude="logs/*" \
    --exclude="temp/*" \
    --exclude="__pycache__" \
    /opt/pdf-api/

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "pdf-api-*.tar.gz" -mtime +7 -delete

echo "Backup completed: pdf-api-$DATE.tar.gz"
```

## Security Considerations

### 1. API Security

#### Authentication Middleware
```python
# app/middleware/auth.py
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from ..config.settings import get_settings

security = HTTPBearer()
settings = get_settings()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token for API access"""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
```

#### Rate Limiting
```python
# app/middleware/rate_limit.py
from fastapi import HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

# Apply to main app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Usage in endpoints
@app.post("/process")
@limiter.limit("10/minute")
async def process_pdf(request: Request, ...):
    # Processing logic
    pass
```

### 2. File Security

#### File Validation
```python
# app/utils/validators.py
import magic
from fastapi import HTTPException, UploadFile

async def validate_pdf_file(file: UploadFile):
    """Comprehensive PDF file validation"""
    
    # Check file extension
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Check MIME type
    file_content = await file.read()
    await file.seek(0)  # Reset file pointer
    
    mime_type = magic.from_buffer(file_content, mime=True)
    if mime_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="Invalid PDF file")
    
    # Check file size
    if len(file_content) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=400, detail="File too large")
    
    # Basic PDF structure validation
    if not file_content.startswith(b'%PDF-'):
        raise HTTPException(status_code=400, detail="Invalid PDF structure")
    
    return True
```

## Testing Strategy

### 1. Unit Tests

#### Test Structure
```python
# tests/test_pdf_processor.py
import pytest
import asyncio
from pathlib import Path
from app.services.pdf_processor import PyMuPDFProcessor
from app.models.request_models import ProcessingOptions

class TestPyMuPDFProcessor:
    
    @pytest.fixture
    def processor(self):
        return PyMuPDFProcessor()
    
    @pytest.fixture
    def sample_pdf_path(self):
        return Path(__file__).parent / "fixtures" / "sample.pdf"
    
    @pytest.mark.asyncio
    async def test_basic_processing(self, processor, sample_pdf_path):
        """Test basic PDF processing functionality"""
        options = ProcessingOptions()
        result = await processor.process_pdf(
            str(sample_pdf_path),
            options,
            "test-request-001"
        )
        
        assert result.success is True
        assert result.html_content is not None
        assert result.extracted_content.text is not None
        assert result.metrics.total_pages > 0
    
    @pytest.mark.asyncio
    async def test_image_extraction(self, processor, sample_pdf_path):
        """Test image extraction functionality"""
        options = ProcessingOptions(extract_images=True)
        result = await processor.process_pdf(
            str(sample_pdf_path),
            options,
            "test-request-002"
        )
        
        assert result.success is True
        # Verify images were extracted if present in PDF
        if result.extracted_content.images:
            assert len(result.extracted_content.images) > 0
    
    @pytest.mark.asyncio
    async def test_layout_analysis(self, processor, sample_pdf_path):
        """Test layout analysis functionality"""
        options = ProcessingOptions(analyze_layout=True)
        result = await processor.process_pdf(
            str(sample_pdf_path),
            options,
            "test-request-003"
        )
        
        assert result.success is True
        assert result.extracted_content.layout_analysis is not None
```

### 2. Integration Tests

#### API Integration Tests
```python
# tests/test_api_integration.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestAPIIntegration:
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy"
        assert "pymupdf_version" in data
    
    def test_pdf_processing_endpoint(self):
        """Test PDF processing endpoint"""
        with open("tests/fixtures/sample.pdf", "rb") as f:
            response = client.post(
                "/process",
                files={"file": ("sample.pdf", f, "application/pdf")}
            )
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "html_content" in data
        assert "extracted_content" in data
    
    def test_invalid_file_upload(self):
        """Test handling of invalid file uploads"""
        with open("tests/fixtures/invalid.txt", "rb") as f:
            response = client.post(
                "/process",
                files={"file": ("invalid.txt", f, "text/plain")}
            )
        
        assert response.status_code == 400
```

### 3. Load Testing

#### Load Test Script
```python
# tests/load_test.py
import asyncio
import aiohttp
import time
from pathlib import Path

async def upload_pdf(session, pdf_path, url):
    """Upload a PDF file to the API"""
    with open(pdf_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('file', f, filename='test.pdf', content_type='application/pdf')
        
        start_time = time.time()
        async with session.post(url, data=data) as response:
            result = await response.json()
            end_time = time.time()
            
            return {
                'status': response.status,
                'success': result.get('success', False),
                'processing_time': end_time - start_time,
                'api_processing_time': result.get('metrics', {}).get('processing_time_ms', 0)
            }

async def run_load_test(concurrent_requests=10, total_requests=100):
    """Run load test with specified parameters"""
    url = "http://localhost:8000/process"
    pdf_path = Path("tests/fixtures/sample.pdf")
    
    connector = aiohttp.TCPConnector(limit=concurrent_requests)
    async with aiohttp.ClientSession(connector=connector) as session:
        
        tasks = []
        for i in range(total_requests):
            task = upload_pdf(session, pdf_path, url)
            tasks.append(task)
        
        print(f"Starting load test: {total_requests} requests, {concurrent_requests} concurrent")
        start_time = time.time()
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Analyze results
        successful = sum(1 for r in results if isinstance(r, dict) and r['success'])
        failed = total_requests - successful
        avg_response_time = sum(r['processing_time'] for r in results if isinstance(r, dict)) / len(results)
        
        print(f"Load test completed in {total_time:.2f}s")
        print(f"Successful requests: {successful}/{total_requests}")
        print(f"Failed requests: {failed}")
        print(f"Average response time: {avg_response_time:.2f}s")
        print(f"Requests per second: {total_requests/total_time:.2f}")

if __name__ == "__main__":
    asyncio.run(run_load_test())
```

## Deployment Checklist

### Pre-Deployment
- [ ] Server provisioned and configured
- [ ] Domain name configured with DNS
- [ ] SSL certificate obtained
- [ ] Application code deployed
- [ ] Dependencies installed
- [ ] Environment variables configured
- [ ] NGINX configured and tested
- [ ] PM2 configured and tested
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Backup scripts configured

### Deployment Steps
1. **Final Code Deployment**
   ```bash
   cd /opt/pdf-api
   git pull origin main  # or upload final code
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configuration Verification**
   ```bash
   # Test configuration
   python -c "from app.config.settings import get_settings; print(get_settings())"
   
   # Test PyMuPDF import
   python -c "import fitz; print(f'PyMuPDF version: {fitz.version[0]}')"
   ```

3. **Service Startup**
   ```bash
   # Start with PM2
   pm2 start ecosystem.config.js
   pm2 save
   
   # Verify service
   pm2 status
   pm2 logs pdf-api
   ```

4. **NGINX Restart**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **Health Check**
   ```bash
   curl -f https://your-domain.com/api/health
   ```

### Post-Deployment
- [ ] Health checks passing
- [ ] API endpoints responding correctly
- [ ] SSL certificate working
- [ ] Monitoring alerts configured
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team notified of new service

## 9. AI Model Integration Strategy

### 9.1 AI-Enhanced Processing Pipeline

#### 9.1.1 Document Intelligence Layer
```python
# AI-powered document analysis
class DocumentIntelligenceService:
    def __init__(self):
        self.layout_analyzer = LayoutAnalysisModel()
        self.content_classifier = ContentClassificationModel()
        self.quality_assessor = QualityAssessmentModel()
    
    async def analyze_document_structure(self, pdf_path: str) -> DocumentStructure:
        """AI-powered document structure analysis"""
        pass
    
    async def classify_content_regions(self, page_data: dict) -> ContentRegions:
        """Classify text, images, tables, headers, footers"""
        pass
    
    async def assess_extraction_quality(self, extracted_content: dict) -> QualityMetrics:
        """AI-based quality assessment of extraction results"""
        pass
```

#### 9.1.2 Smart Content Enhancement
- **Text Correction**: AI models to fix OCR errors and improve text quality
- **Layout Reconstruction**: ML-based layout understanding for better HTML structure
- **Semantic Segmentation**: AI-powered content categorization (headings, paragraphs, lists)
- **Image Context Analysis**: Computer vision for image description and context

### 9.2 Recommended AI Models and Services

#### 9.2.1 Local AI Models (On-Droplet)
```python
# Lightweight models for real-time processing
AI_MODELS = {
    "layout_analysis": {
        "model": "microsoft/layoutlmv3-base",
        "purpose": "Document layout understanding",
        "memory_requirement": "2GB",
        "processing_time": "~2s per page"
    },
    "text_classification": {
        "model": "distilbert-base-uncased",
        "purpose": "Content type classification",
        "memory_requirement": "500MB",
        "processing_time": "~100ms per text block"
    },
    "ocr_correction": {
        "model": "custom-transformer-small",
        "purpose": "Post-OCR text correction",
        "memory_requirement": "1GB",
        "processing_time": "~50ms per text block"
    }
}
```

#### 9.2.2 Cloud AI Services (Fallback/Advanced)
```python
# External AI services for complex processing
CLOUD_AI_SERVICES = {
    "google_document_ai": {
        "endpoint": "https://documentai.googleapis.com/v1/",
        "capabilities": ["advanced_layout", "form_parsing", "table_extraction"],
        "cost": "$1.50 per 1000 pages",
        "use_case": "Complex document structures"
    },
    "azure_form_recognizer": {
        "endpoint": "https://cognitiveservices.azure.com/",
        "capabilities": ["custom_models", "prebuilt_models", "layout_analysis"],
        "cost": "$1.00 per 1000 pages",
        "use_case": "Form and table processing"
    },
    "openai_vision": {
        "endpoint": "https://api.openai.com/v1/chat/completions",
        "capabilities": ["image_analysis", "content_description", "structure_understanding"],
        "cost": "$0.01 per image",
        "use_case": "Complex visual content analysis"
    }
}
```

### 9.3 AI-Enhanced API Endpoints

#### 9.3.1 Intelligent Processing Endpoint
```python
@app.post("/api/v1/pdf/process-intelligent")
async def process_pdf_intelligent(
    file: UploadFile,
    ai_features: AIFeatures = AIFeatures(),
    quality_threshold: float = 0.8
) -> IntelligentProcessingResponse:
    """
    AI-enhanced PDF processing with intelligent content analysis
    
    Features:
    - Smart layout detection
    - Content quality assessment
    - Automatic error correction
    - Semantic structure recognition
    """
    pass

class AIFeatures(BaseModel):
    enable_layout_analysis: bool = True
    enable_content_classification: bool = True
    enable_quality_assessment: bool = True
    enable_text_correction: bool = False  # Optional, resource-intensive
    enable_image_analysis: bool = False   # Optional, requires vision models
```

#### 9.3.2 Quality-Driven Processing
```python
@app.post("/api/v1/pdf/process-adaptive")
async def process_pdf_adaptive(
    file: UploadFile,
    target_quality: float = 0.9,
    max_processing_time: int = 30
) -> AdaptiveProcessingResponse:
    """
    Adaptive processing that automatically selects best AI models
    based on document complexity and quality requirements
    """
    pass
```

### 9.4 AI Model Management

#### 9.4.1 Model Loading and Caching
```python
class AIModelManager:
    def __init__(self):
        self.model_cache = {}
        self.model_configs = AI_MODELS
    
    async def load_model(self, model_name: str):
        """Lazy loading of AI models with memory management"""
        if model_name not in self.model_cache:
            # Load model with memory optimization
            pass
    
    async def unload_unused_models(self):
        """Memory management for AI models"""
        pass
    
    def get_model_recommendations(self, document_type: str) -> List[str]:
        """Recommend optimal AI models based on document characteristics"""
        pass
```

#### 9.4.2 Performance Optimization
```python
# AI processing optimization strategies
AI_OPTIMIZATION = {
    "batch_processing": {
        "enabled": True,
        "batch_size": 5,
        "description": "Process multiple pages simultaneously"
    },
    "model_quantization": {
        "enabled": True,
        "precision": "int8",
        "description": "Reduce model size for faster inference"
    },
    "gpu_acceleration": {
        "enabled": False,  # Optional for droplet setup
        "device": "cuda:0",
        "description": "GPU acceleration for AI models"
    },
    "caching_strategy": {
        "cache_embeddings": True,
        "cache_predictions": True,
        "ttl": 3600  # 1 hour
    }
}
```

### 9.5 Hybrid AI Processing Strategy

#### 9.5.1 Processing Decision Tree
```python
async def determine_processing_strategy(document_metadata: dict) -> ProcessingStrategy:
    """
    Intelligent routing based on document characteristics:
    
    1. Simple documents (text-only, good quality) → PyMuPDF only
    2. Complex layouts → PyMuPDF + Local AI models
    3. Poor quality/scanned → PyMuPDF + OCR correction + Cloud AI
    4. Forms/tables → PyMuPDF + Specialized AI models
    5. Fallback → ConvertAPI + AI post-processing
    """
    pass

class ProcessingStrategy(BaseModel):
    primary_engine: str  # "pymupdf", "convertapi"
    ai_models: List[str]  # ["layout_analysis", "text_correction"]
    cloud_services: List[str]  # ["google_document_ai"]
    estimated_cost: float
    estimated_time: int
```

#### 9.5.2 Quality-Based Fallback
```python
async def process_with_quality_fallback(
    pdf_data: bytes,
    target_quality: float = 0.8
) -> ProcessingResult:
    """
    Multi-tier processing with quality assessment:
    
    Tier 1: PyMuPDF + Basic AI → Quality check
    Tier 2: PyMuPDF + Advanced AI → Quality check  
    Tier 3: Cloud AI services → Quality check
    Tier 4: ConvertAPI + AI enhancement → Final result
    """
    pass
```

### 9.6 AI Infrastructure Requirements

#### 9.6.1 Droplet Specifications (AI-Enhanced)
```yaml
# Enhanced droplet requirements for AI processing
droplet_specs:
  cpu: "4 vCPUs (Intel/AMD)"
  memory: "16GB RAM"  # Increased for AI models
  storage: "100GB SSD"  # Additional space for models
  gpu: "Optional - NVIDIA GPU for acceleration"
  
ai_model_storage:
  base_models: "~8GB"
  cache_space: "~4GB"
  temp_processing: "~4GB"
```

#### 9.6.2 Environment Setup
```bash
# AI-specific dependencies
pip install torch torchvision transformers
pip install layoutparser detectron2
pip install opencv-python pillow
pip install sentence-transformers
pip install google-cloud-documentai  # Optional
pip install azure-ai-formrecognizer   # Optional
```

### 9.7 Cost and Performance Optimization

#### 9.7.1 AI Processing Costs
```python
# Cost estimation for AI features
AI_PROCESSING_COSTS = {
    "local_models": {
        "cost_per_page": 0.001,  # Computational cost
        "setup_cost": 50,        # One-time model download
        "maintenance": 10        # Monthly model updates
    },
    "cloud_services": {
        "google_document_ai": 0.0015,  # Per page
        "azure_form_recognizer": 0.001,
        "openai_vision": 0.01           # Per image
    },
    "hybrid_approach": {
        "average_cost_per_page": 0.002,
        "quality_improvement": "40-60%",
        "processing_time_increase": "2-3x"
    }
}
```

#### 9.7.2 Performance Benchmarks
```python
# Expected performance improvements with AI
AI_PERFORMANCE_METRICS = {
    "text_extraction_accuracy": {
        "baseline": 85,      # PyMuPDF only
        "with_ai": 95,       # AI-enhanced
        "improvement": "12%"
    },
    "layout_preservation": {
        "baseline": 70,
        "with_ai": 90,
        "improvement": "29%"
    },
    "table_extraction": {
        "baseline": 60,
        "with_ai": 85,
        "improvement": "42%"
    },
    "processing_time": {
        "simple_docs": "1.2x slower",
        "complex_docs": "2.5x slower",
        "quality_gain": "Significant"
    }
}
```

---

## Conclusion

This comprehensive implementation plan provides a complete roadmap for deploying the PDF2HTML microservice using PyMuPDF with AI enhancements on a simple DigitalOcean droplet infrastructure. The approach prioritizes:

1. **Simplicity**: Single-server deployment with standard tools
2. **Reliability**: PyMuPDF primary engine with ConvertAPI fallback
3. **Performance**: Optimized NGINX and Python configuration with AI acceleration
4. **Security**: Authentication, validation, and monitoring
5. **Maintainability**: Clear structure and comprehensive testing
6. **Intelligence**: AI-powered document analysis and quality enhancement

The plan includes detailed code examples, configuration files, deployment scripts, AI model integration strategies, and testing approaches to ensure successful implementation and ongoing operation of the microservice.

**AI Enhancement Benefits:**
- **40-60% quality improvement** in text extraction and layout preservation
- **Intelligent document routing** based on complexity and content type
- **Adaptive processing strategies** with quality-driven fallbacks
- **Smart error correction** and content enhancement capabilities
- **Cost-effective hybrid approach** balancing local and cloud AI services

**Next Steps:**
1. Provision enhanced DigitalOcean droplet (16GB RAM for AI models)
2. Follow infrastructure setup procedures
3. Deploy PyMuPDF API application with AI integration
4. Configure NGINX and SSL
5. Set up AI model management and caching
6. Integrate with main platform
7. Conduct thorough testing including AI feature validation
8. Monitor and optimize performance (both processing and AI inference)

This implementation will provide a robust, intelligent, and scalable PDF processing solution that significantly enhances the Material Kai Vision Platform's capabilities while maintaining architectural simplicity and operational efficiency. The AI integration transforms basic PDF processing into an intelligent document understanding system capable of handling complex layouts, poor quality scans, and diverse document types with superior accuracy and reliability.


### 6. Data Models

#### app/models/request_models.py
```python
from pydantic import BaseModel, HttpUrl, Field
from typing import Optional, List
from enum import Enum

class ProcessingOptions(BaseModel):
    """Options for PDF processing with PyMuPDF4LLM"""
    enable_chunking: bool = Field(default=True, description="Enable content chunking")
    chunk_size: Optional[int] = Field(default=1000, description="Words per chunk")
    chunk_overlap: Optional[int] = Field(default=100, description="Overlap between chunks")
    extract_images: bool = Field(default=True, description="Extract images from PDF")
    extract_words: bool = Field(default=False, description="Extract word-level data")
    max_image_size: Optional[int] = Field(default=2048, description="Maximum image dimension")
    margin_left: float = Field(default=0, description="Left margin in points")
    margin_top: float = Field(default=0, description="Top margin in points")
    margin_right: float = Field(default=0, description="Right margin in points")
    margin_bottom: float = Field(default=0, description="Bottom margin in points")

class PDFProcessRequest(BaseModel):
    """Request model for PDF processing"""
    pdf_url: HttpUrl = Field(..., description="Supabase URL to PDF file")
    options: Optional[ProcessingOptions] = Field(default_factory=ProcessingOptions)
    callback_url: Optional[HttpUrl] = Field(None, description="Optional webhook URL for completion notification")
```

#### app/models/response_models.py
```python
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class ChunkData(BaseModel):
    """Individual chunk of processed content"""
    chunk_id: str = Field(..., description="Unique chunk identifier")
    content: str = Field(..., description="Markdown content of the chunk")
    page_numbers: List[int] = Field(default_factory=list, description="Source page numbers")
    chunk_index: int = Field(..., description="Sequential chunk number")
    word_count: int = Field(..., description="Number of words in chunk")
    character_count: int = Field(..., description="Number of characters in chunk")

class ImageData(BaseModel):
    """Image extracted from PDF"""
    image_id: str = Field(..., description="Unique image identifier")
    page_number: int = Field(..., description="Source page number")
    image_data: bytes = Field(..., description="Binary image data")
    format: str = Field(..., description="Image format (png, jpg, etc.)")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    size: int = Field(..., description="Image size in bytes")

class ProcessingResult(BaseModel):
    """Complete processing result"""
    chunks: List[ChunkData] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    images: List[ImageData] = Field(default_factory=list)
    total_pages: int = Field(default=0)
    processing_time: float = Field(default=0.0)

class ChunkResponse(BaseModel):
    """API response for chunk data"""
    chunk_id: str
    content: str
    page_numbers: List[int]
    chunk_index: int
    word_count: int
    character_count: int

class PDFProcessResponse(BaseModel):
    """API response for PDF processing"""
    job_id: str = Field(..., description="Processing job identifier")
    status: str = Field(..., description="Processing status")
    chunks_count: int = Field(..., description="Number of chunks created")
    images_count: int = Field(..., description="Number of images extracted")
    processing_time: float = Field(..., description="Processing time in seconds")
    supabase_storage_id: str = Field(..., description="Supabase storage identifier")
    chunks_preview: List[ChunkResponse] = Field(default_factory=list, description="First 3 chunks preview")

class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    pymupdf4llm_available: bool = Field(..., description="PyMuPDF4LLM availability")
    supabase_connected: bool = Field(..., description="Supabase connection status")
    timestamp: datetime = Field(..., description="Health check timestamp")
```

### 7. Configuration Management

#### app/config/settings.py
```python
from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    """Application settings"""
    
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_WORKERS: int = 1
    DEBUG: bool = False
    
    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    
    # ConvertAPI Fallback
    CONVERTAPI_SECRET: Optional[str] = None
    CONVERTAPI_FALLBACK_ENABLED: bool = False
    
    # Processing Configuration
    MAX_FILE_SIZE_MB: int = 50
    MAX_PROCESSING_TIME_SECONDS: int = 300
    TEMP_DIR: str = "/tmp"
    
    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Security
    ALLOWED_ORIGINS: list = ["https://your-vercel-app.vercel.app"]
    API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True

def get_settings() -> Settings:
    """Get application settings singleton"""
    return Settings()
```

### 8. Supabase Database Schema

#### SQL Schema for Supabase
```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PDF Processing Jobs Table
CREATE TABLE pdf_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pdf_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    chunks_count INTEGER DEFAULT 0,
    images_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    processing_time_seconds FLOAT
);

-- PDF Chunks Table
CREATE TABLE pdf_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES pdf_processing_jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_numbers INTEGER[] DEFAULT '{}',
    word_count INTEGER NOT NULL,
    character_count INTEGER NOT NULL,
    embedding VECTOR(1536), -- For future vector search integration
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(job_id, chunk_index)
);

-- PDF Images Table
CREATE TABLE pdf_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES pdf_processing_jobs(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    format VARCHAR(10) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_pdf_jobs_status ON pdf_processing_jobs(status);
CREATE INDEX idx_pdf_jobs_created_at ON pdf_processing_jobs(created_at);
CREATE INDEX idx_pdf_chunks_job_id ON pdf_chunks(job_id);
CREATE INDEX idx_pdf_chunks_chunk_index ON pdf_chunks(job_id, chunk_index);
CREATE INDEX idx_pdf_images_job_id ON pdf_images(job_id);

-- Row Level Security (RLS) Policies
ALTER TABLE pdf_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_images ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust based on your auth requirements)
CREATE POLICY "Allow authenticated users to read their jobs" ON pdf_processing_jobs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert jobs" ON pdf_processing_jobs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to jobs" ON pdf_processing_jobs
    FOR ALL USING (auth.role() = 'service_role');

-- Similar policies for chunks and images
CREATE POLICY "Allow authenticated users to read chunks" ON pdf_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pdf_processing_jobs 
            WHERE id = pdf_chunks.job_id 
            AND auth.role() = 'authenticated'
        )
    );

CREATE POLICY "Allow service role full access to chunks" ON pdf_chunks
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated users to read images" ON pdf_images
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pdf_processing_jobs 
            WHERE id = pdf_images.job_id 
            AND auth.role() = 'authenticated'
        )
    );

CREATE POLICY "Allow service role full access to images" ON pdf_images
    FOR ALL USING (auth.role() = 'service_role');

-- Storage bucket for PDF images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('pdf-images', 'pdf-images', true);

-- Storage policies
CREATE POLICY "Allow authenticated users to upload images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'pdf-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Allow public access to images" ON storage.objects
    FOR SELECT USING (bucket_id = 'pdf-images');
```

## Deployment & Testing Strategy

### 1. Development Environment Setup

```bash
# Create Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations in Supabase
# Execute the SQL schema in your Supabase SQL editor

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Testing Approach

#### Unit Tests
```python
# tests/test_pdf_processor.py
import pytest
from app.services.pdf_processor import PyMuPDF4LLMProcessor
from app.models.request_models import ProcessingOptions

@pytest.mark.asyncio
async def test_pdf_processing():
    processor = PyMuPDF4LLMProcessor()
    options = ProcessingOptions(enable_chunking=True, chunk_size=500)
    
    # Test with sample PDF URL
    result = await processor.process_pdf_from_url(
        pdf_url="https://example.com/sample.pdf",
        options=options,
        job_id="test-job-123"
    )
    
    assert result.chunks
    assert result.metadata
    assert result.processing_time > 0
```

#### Integration Tests
```python
# tests/test_api_integration.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_process_pdf_endpoint():
    payload = {
        "pdf_url": "https://your-supabase-url.com/storage/v1/object/public/pdfs/sample.pdf",
        "options": {
            "enable_chunking": True,
            "chunk_size": 1000,
            "extract_images": True
        }
    }
    
    response = client.post("/process-pdf", json=payload)
    assert response.status_code == 200
    assert "job_id" in response.json()
```

### 3. Production Deployment

#### Digital Ocean Droplet Setup
```bash
# 1. Create and configure droplet
# 2. Install dependencies
sudo apt update
sudo apt install python3 python3-pip python3-venv nginx

# 3. Clone and setup application
git clone <your-repo>
cd pdf-processing-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Configure systemd service
sudo nano /etc/systemd/system/pdf-processor.service
```

#### Systemd Service Configuration
```ini
[Unit]
Description=PDF Processing Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/pdf-processor
Environment=PATH=/var/www/pdf-processor/venv/bin
ExecStart=/var/www/pdf-processor/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

#### NGINX Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for large PDF processing
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

## Integration with Material Kai Vision Platform

### 1. Frontend Integration

#### TypeScript Service Client
```typescript
// src/services/pdfProcessingService.ts
export interface PDFProcessingOptions {
  enableChunking?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  extractImages?: boolean;
  extractWords?: boolean;
  maxImageSize?: number;
}

export interface PDFProcessingResult {
  jobId: string;
  status: string;
  chunksCount: number;
  imagesCount: number;
  processingTime: number;
  supabaseStorageId: string;
  chunksPreview: ChunkData[];
}

export class PDFProcessingService {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_PDF_SERVICE_URL!) {
    this.baseUrl = baseUrl;
  }

  async processPDF(
    pdfUrl: string, 
    options?: PDFProcessingOptions
  ): Promise<PDFProcessingResult> {
    const response = await fetch(`${this.baseUrl}/process-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdf_url: pdfUrl,
        options: options || {}
      })
    });

    if (!response.ok) {
      throw new Error(`PDF processing failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getJobStatus(jobId: string): Promise<PDFProcessingResult> {
    const response = await fetch(`${this.baseUrl}/job/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  }

  async getChunks(
    jobId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<ChunkData[]> {
    const response = await fetch(
      `${this.baseUrl}/chunks/${jobId}?page=${page}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get chunks: ${response.statusText}`);
    }

    return response.json();
  }
}
```

### 2. React Hook Integration
```typescript
// src/hooks/usePDFProcessing.ts
import { useState, useCallback } from 'react';
import { PDFProcessingService, PDFProcessingOptions, PDFProcessingResult } from '../services/pdfProcessingService';

export const usePDFProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PDFProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pdfService = new PDFProcessingService();

  const processPDF = useCallback(async (
    pdfUrl: string, 
    options?: PDFProcessingOptions
  ) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await pdfService.processPDF(pdfUrl, options);
      setResult(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const getJobStatus = useCallback(async (jobId: string) => {
    try {
      const result = await pdfService.getJobStatus(jobId);
      setResult(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  }, []);

  return {
    processPDF,
    getJobStatus,
    isProcessing,
    result,
    error,
    clearError: () => setError(null)
  };
};
```

## LLM Integration & RAG Search Strategy with LlamaIndex

### 1. LlamaIndex Integration Overview

**Strategic Decision: LlamaIndex as Primary RAG Framework**

Based on the excellent synergy between PyMuPDF4LLM and LlamaIndex, we're adopting LlamaIndex as our primary RAG framework. This provides:

- **60-70% reduction in custom RAG code**
- **Production-ready document processing pipeline**
- **Native Supabase vector store integration**
- **Advanced chunking and retrieval strategies**
- **Built-in evaluation and monitoring tools**

#### Core Dependencies
```python
# requirements.txt additions for LlamaIndex integration
llama-index==0.10.0
llama-index-vector-stores-supabase==0.1.0
llama-index-embeddings-openai==0.1.0
llama-index-llms-openai==0.1.0
llama-index-readers-file==0.1.0
pymupdf4llm==0.0.5
```

### 2. LlamaIndex + PyMuPDF4LLM Integration

#### Document Processing with LlamaIndex
```python
from llama_index.core import Document, VectorStoreIndex, Settings
from llama_index.vector_stores.supabase import SupabaseVectorStore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.node_parser import MarkdownNodeParser
import pymupdf4llm

class LlamaIndexPDFProcessor:
    def __init__(self, supabase_client):
        # Configure LlamaIndex settings
        Settings.embed_model = OpenAIEmbedding(
            model="text-embedding-3-small",
            api_key=os.getenv("OPENAI_API_KEY")
        )
        Settings.llm = OpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.1
        )
        
        # Initialize Supabase vector store
        self.vector_store = SupabaseVectorStore(
            postgres_connection_string=os.getenv("SUPABASE_DB_URL"),
            collection_name="document_chunks",
            dimension=1536
        )
        
        # Initialize node parser for markdown
        self.node_parser = MarkdownNodeParser(
            include_metadata=True,
            include_prev_next_rel=True
        )
        
        self.supabase = supabase_client
    
    async def process_pdf_document(self, pdf_path: str, document_id: str) -> dict:
        """Process PDF using PyMuPDF4LLM and index with LlamaIndex"""
        
        try:
            # 1. Extract markdown using PyMuPDF4LLM
            markdown_content = pymupdf4llm.to_markdown(
                pdf_path,
                pages=None,  # Process all pages
                write_images=True,
                image_path=f"temp_images/{document_id}",
                image_format="png",
                dpi=150
            )
            
            # 2. Create LlamaIndex Document
            document = Document(
                text=markdown_content,
                metadata={
                    "document_id": document_id,
                    "source_type": "pdf",
                    "processing_method": "pymupdf4llm",
                    "created_at": datetime.utcnow().isoformat()
                }
            )
            
            # 3. Parse into nodes (chunks) using markdown-aware parser
            nodes = self.node_parser.get_nodes_from_documents([document])
            
            # 4. Add document-specific metadata to each node
            for i, node in enumerate(nodes):
                node.metadata.update({
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_type": self._determine_chunk_type(node.text),
                    "word_count": len(node.text.split()),
                    "character_count": len(node.text)
                })
            
            # 5. Create vector index and store in Supabase
            index = VectorStoreIndex(
                nodes=nodes,
                vector_store=self.vector_store
            )
            
            # 6. Update document status in Supabase
            await self.supabase.table("pdf_documents").update({
                "processing_status": "completed",
                "total_chunks": len(nodes),
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", document_id).execute()
            
            return {
                "status": "success",
                "document_id": document_id,
                "chunks_created": len(nodes),
                "index_id": index.index_id
            }
            
        except Exception as e:
            # Update document status to failed
            await self.supabase.table("pdf_documents").update({
                "processing_status": "failed",
                "error_message": str(e),
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", document_id).execute()
            
            raise Exception(f"PDF processing failed: {str(e)}")
    
    def _determine_chunk_type(self, text: str) -> str:
        """Determine chunk type based on content"""
        if "| " in text and "---" in text:
            return "table"
        elif "![" in text:
            return "image_caption"
        elif text.startswith("#"):
            return "header"
        else:
            return "text"
```

### 3. Enhanced Database Schema for LlamaIndex

#### Supabase Schema with LlamaIndex Support
```sql
-- Enhanced schema optimized for LlamaIndex
CREATE TABLE pdf_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_filename TEXT NOT NULL,
    supabase_storage_path TEXT NOT NULL,
    total_pages INTEGER,
    total_chunks INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'pending',
    index_id TEXT, -- LlamaIndex index identifier
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LlamaIndex will automatically manage the vector storage
-- But we can create additional tables for enhanced metadata
CREATE TABLE document_chunks_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES pdf_documents(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL, -- LlamaIndex node ID
    chunk_index INTEGER NOT NULL,
    chunk_type TEXT NOT NULL,
    page_number INTEGER,
    section_title TEXT,
    word_count INTEGER,
    character_count INTEGER,
    has_tables BOOLEAN DEFAULT FALSE,
    has_images BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(document_id, chunk_index)
);

-- Indexes for efficient querying
CREATE INDEX idx_chunks_metadata_document_id ON document_chunks_metadata(document_id);
CREATE INDEX idx_chunks_metadata_node_id ON document_chunks_metadata(node_id);
CREATE INDEX idx_documents_status ON pdf_documents(processing_status);
```

### 4. LlamaIndex RAG Query Engine

#### Advanced RAG Implementation
```python
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.postprocessor import SimilarityPostprocessor
from llama_index.core.response_synthesizers import ResponseMode

class LlamaIndexRAGService:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.vector_store = SupabaseVectorStore(
            postgres_connection_string=os.getenv("SUPABASE_DB_URL"),
            collection_name="document_chunks",
            dimension=1536
        )
        
        # Create index from existing vector store
        self.index = VectorStoreIndex.from_vector_store(
            vector_store=self.vector_store
        )
    
    async def create_query_engine(self, document_id: str = None, similarity_threshold: float = 0.7):
        """Create a query engine with optional document filtering"""
        
        # Configure retriever
        retriever = VectorIndexRetriever(
            index=self.index,
            similarity_top_k=5,
            # Add document filtering if specified
            filters={"document_id": document_id} if document_id else None
        )
        
        # Configure post-processor for similarity filtering
        postprocessor = SimilarityPostprocessor(
            similarity_cutoff=similarity_threshold
        )
        
        # Create query engine
        query_engine = RetrieverQueryEngine(
            retriever=retriever,
            node_postprocessors=[postprocessor],
            response_mode=ResponseMode.COMPACT
        )
        
        return query_engine
    
    async def search_and_answer(self, query: str, document_id: str = None,
                               similarity_threshold: float = 0.7) -> dict:
        """Perform RAG search and generate answer using LlamaIndex"""
        
        try:
            # Create query engine
            query_engine = await self.create_query_engine(
                document_id=document_id,
                similarity_threshold=similarity_threshold
            )
            
            # Execute query
            response = query_engine.query(query)
            
            # Extract source information
            sources = []
            for node in response.source_nodes:
                sources.append({
                    "node_id": node.node_id,
                    "document_id": node.metadata.get("document_id"),
                    "chunk_index": node.metadata.get("chunk_index"),
                    "page_number": node.metadata.get("page_number"),
                    "similarity_score": node.score,
                    "content_preview": node.text[:200] + "..." if len(node.text) > 200 else node.text
                })
            
            return {
                "answer": str(response),
                "sources": sources,
                "context_nodes_used": len(response.source_nodes),
                "query": query,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            return {
                "error": f"RAG query failed: {str(e)}",
                "query": query,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    async def get_document_summary(self, document_id: str) -> dict:
        """Generate a summary of a specific document"""
        
        query_engine = await self.create_query_engine(document_id=document_id)
        
        summary_query = "Provide a comprehensive summary of this document, including main topics, key findings, and important details."
        response = query_engine.query(summary_query)
        
        return {
            "document_id": document_id,
            "summary": str(response),
            "generated_at": datetime.utcnow().isoformat()
        }
```

### 5. Complete RAG Workflow Integration

#### API Endpoint for LlamaIndex RAG Search
```python
@app.post("/search")
async def llamaindex_rag_search(request: RAGSearchRequest):
    """Perform RAG search using LlamaIndex across processed documents"""
    
    rag_service = LlamaIndexRAGService(supabase)
    
    result = await rag_service.search_and_answer(
        query=request.query,
        document_id=request.document_id,
        similarity_threshold=request.similarity_threshold
    )
    
    return RAGSearchResponse(
        query=request.query,
        answer=result["answer"],
        sources=result["sources"],
        context_nodes_used=result["context_nodes_used"],
        timestamp=result["timestamp"]
    )

@app.post("/summarize/{document_id}")
async def summarize_document(document_id: str):
    """Generate a summary of a specific document using LlamaIndex"""
    
    rag_service = LlamaIndexRAGService(supabase)
    result = await rag_service.get_document_summary(document_id)
    
    return result

# Enhanced data models for LlamaIndex
class RAGSearchRequest(BaseModel):
    query: str
    document_id: Optional[str] = None
    similarity_threshold: float = 0.7
    max_results: int = 5

class RAGSearchResponse(BaseModel):
    query: str
    answer: str
    sources: List[dict]
    context_nodes_used: int
    timestamp: str
    error: Optional[str] = None
```

#### Frontend Integration for LlamaIndex RAG Search
```typescript
// Enhanced RAG Search Service with LlamaIndex support
export class LlamaIndexRAGService {
    private baseUrl: string;
    
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }
    
    async searchDocuments(
        query: string,
        documentId?: string,
        similarityThreshold: number = 0.7
    ): Promise<RAGSearchResponse> {
        const response = await fetch(`${this.baseUrl}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                document_id: documentId,
                similarity_threshold: similarityThreshold,
                max_results: 5
            })
        });
        
        if (!response.ok) {
            throw new Error(`LlamaIndex RAG search failed: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async summarizeDocument(documentId: string): Promise<DocumentSummary> {
        const response = await fetch(`${this.baseUrl}/summarize/${documentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`Document summarization failed: ${response.statusText}`);
        }
        
        return response.json();
    }
}

// Enhanced React Hook for LlamaIndex RAG Search
export const useLlamaIndexRAG = () => {
    const [isSearching, setIsSearching] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [searchResults, setSearchResults] = useState<RAGSearchResponse | null>(null);
    const [summary, setSummary] = useState<DocumentSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const searchDocuments = async (
        query: string,
        documentId?: string,
        similarityThreshold: number = 0.7
    ) => {
        setIsSearching(true);
        setError(null);
        
        try {
            const ragService = new LlamaIndexRAGService(process.env.NEXT_PUBLIC_PDF_API_URL!);
            const results = await ragService.searchDocuments(query, documentId, similarityThreshold);
            setSearchResults(results);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setIsSearching(false);
        }
    };
    
    const summarizeDocument = async (documentId: string) => {
        setIsSummarizing(true);
        setError(null);
        
        try {
            const ragService = new LlamaIndexRAGService(process.env.NEXT_PUBLIC_PDF_API_URL!);
            const result = await ragService.summarizeDocument(documentId);
            setSummary(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Summarization failed');
        } finally {
            setIsSummarizing(false);
        }
    };
    
    return {
        searchDocuments,
        summarizeDocument,
        isSearching,
        isSummarizing,
        searchResults,
        summary,
        error
    };
};
```

### 6. LlamaIndex vs Alternative Vector Databases

#### LlamaIndex + Supabase (Recommended Approach)
**Pros:**
- **Production-ready RAG framework** with built-in best practices
- **Native Supabase integration** via SupabaseVectorStore
- **Advanced chunking strategies** with MarkdownNodeParser
- **Built-in evaluation and monitoring** capabilities
- **Unified data management** with existing Supabase infrastructure
- **60-70% reduction in custom code** compared to manual implementation

**Cons:**
- Additional dependency on LlamaIndex framework
- Learning curve for LlamaIndex-specific concepts

#### Alternative: Custom Implementation + Specialized Vector DB
```python
# Alternative with Pinecone (if needed for scale)
from llama_index.vector_stores.pinecone import PineconeVectorStore
import pinecone

class PineconeLlamaIndexService:
    def __init__(self):
        pinecone.init(
            api_key=os.getenv("PINECONE_API_KEY"),
            environment=os.getenv("PINECONE_ENVIRONMENT")
        )
        
        # Use LlamaIndex's Pinecone integration
        self.vector_store = PineconeVectorStore(
            pinecone_index=pinecone.Index("pdf-chunks"),
            namespace="documents"
        )
        
        self.index = VectorStoreIndex.from_vector_store(
            vector_store=self.vector_store
        )
```

### 7. Image Processing & Visual Similarity Search Integration

#### Integration with Material Kai Vision Platform
The PDF2Markdown microservice will leverage existing platform capabilities for advanced image processing and visual similarity matching:

```python
class ImageProcessingService:
    def __init__(self, platform_api_client):
        self.platform_api = platform_api_client
        self.vision_service = MaterialKaiVisionService()
    
    async def process_extracted_images(self, document_id: str, image_paths: List[str]) -> List[dict]:
        """Process extracted images using platform vision capabilities"""
        
        processed_images = []
        
        for image_path in image_paths:
            try:
                # 1. Upload image to platform storage
                image_url = await self.platform_api.upload_image(image_path)
                
                # 2. Generate image embeddings using platform vision models
                image_embedding = await self.vision_service.generate_image_embedding(image_url)
                
                # 3. Extract image features and metadata
                image_analysis = await self.vision_service.analyze_image(image_url)
                
                # 4. Perform similarity search against existing images
                similar_images = await self.find_similar_images(image_embedding)
                
                processed_image = {
                    "document_id": document_id,
                    "image_url": image_url,
                    "image_path": image_path,
                    "embedding": image_embedding,
                    "analysis": {
                        "detected_objects": image_analysis.get("objects", []),
                        "text_content": image_analysis.get("ocr_text", ""),
                        "image_type": image_analysis.get("type", "unknown"),
                        "dimensions": image_analysis.get("dimensions", {}),
                        "quality_score": image_analysis.get("quality", 0.0)
                    },
                    "similar_images": similar_images,
                    "created_at": datetime.utcnow().isoformat()
                }
                
                processed_images.append(processed_image)
                
            except Exception as e:
                logger.error(f"Failed to process image {image_path}: {str(e)}")
                continue
        
        return processed_images
    
    async def find_similar_images(self, query_embedding: List[float], threshold: float = 0.8) -> List[dict]:
        """Find similar images using platform's visual search capabilities"""
        
        # Use platform's existing image similarity search
        similar_results = await self.platform_api.search_similar_images(
            embedding=query_embedding,
            similarity_threshold=threshold,
            max_results=10
        )
        
        return similar_results
```

#### Enhanced Database Schema for Image Management
```sql
-- Add image tracking to existing schema
CREATE TABLE document_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES pdf_documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES document_chunks_metadata(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_path TEXT NOT NULL,
    image_embedding VECTOR(512), -- Platform vision model embeddings
    image_analysis JSONB, -- OCR text, objects, metadata
    similar_images JSONB, -- Array of similar image references
    page_number INTEGER,
    position_metadata JSONB, -- Position within page/document
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Index for efficient image retrieval
    UNIQUE(document_id, image_path)
);

-- Index for image similarity search
CREATE INDEX idx_document_images_embedding ON document_images USING ivfflat (image_embedding vector_cosine_ops);
CREATE INDEX idx_document_images_document_id ON document_images(document_id);
```

#### Platform Integration Service
```python
class MaterialKaiVisionService:
    def __init__(self):
        self.vision_api_url = os.getenv("MATERIAL_KAI_VISION_API_URL")
        self.api_key = os.getenv("MATERIAL_KAI_API_KEY")
    
    async def generate_image_embedding(self, image_url: str) -> List[float]:
        """Generate image embeddings using platform's vision models"""
        
        response = await self._make_api_request(
            endpoint="/vision/embeddings",
            data={
                "image_url": image_url,
                "model": "clip-vit-large-patch14"  # Platform's default vision model
            }
        )
        
        return response["embedding"]
    
    async def analyze_image(self, image_url: str) -> dict:
        """Comprehensive image analysis using platform capabilities"""
        
        # Use platform's multi-modal analysis
        analysis = await self._make_api_request(
            endpoint="/vision/analyze",
            data={
                "image_url": image_url,
                "features": [
                    "object_detection",
                    "ocr_text_extraction",
                    "image_classification",
                    "quality_assessment"
                ]
            }
        )
        
        return analysis
    
    async def search_similar_images(self, embedding: List[float], threshold: float = 0.8) -> List[dict]:
        """Search for visually similar images across the platform"""
        
        results = await self._make_api_request(
            endpoint="/vision/similarity-search",
            data={
                "query_embedding": embedding,
                "similarity_threshold": threshold,
                "max_results": 10,
                "include_metadata": True
            }
        )
        
        return results.get("similar_images", [])
    
    async def _make_api_request(self, endpoint: str, data: dict) -> dict:
        """Make authenticated API request to platform"""
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.vision_api_url}{endpoint}",
                json=data,
                headers=headers
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Platform API error: {response.status}")
```

#### Enhanced PDF Processing with Image Integration
```python
class EnhancedLlamaIndexPDFProcessor(LlamaIndexPDFProcessor):
    def __init__(self, supabase_client):
        super().__init__(supabase_client)
        self.image_service = ImageProcessingService(MaterialKaiPlatformClient())
    
    async def process_pdf_document(self, pdf_path: str, document_id: str) -> dict:
        """Enhanced processing with image extraction and analysis"""
        
        try:
            # 1. Extract markdown and images using PyMuPDF4LLM
            image_dir = f"temp_images/{document_id}"
            markdown_content = pymupdf4llm.to_markdown(
                pdf_path,
                pages=None,
                write_images=True,
                image_path=image_dir,
                image_format="png",
                dpi=150
            )
            
            # 2. Process extracted images through platform vision services
            extracted_images = glob.glob(f"{image_dir}/*.png")
            processed_images = await self.image_service.process_extracted_images(
                document_id, extracted_images
            )
            
            # 3. Create LlamaIndex Document with enhanced metadata
            document = Document(
                text=markdown_content,
                metadata={
                    "document_id": document_id,
                    "source_type": "pdf",
                    "processing_method": "pymupdf4llm",
                    "image_count": len(processed_images),
                    "has_visual_content": len(processed_images) > 0,
                    "created_at": datetime.utcnow().isoformat()
                }
            )
            
            # 4. Parse into nodes with image context
            nodes = self.node_parser.get_nodes_from_documents([document])
            
            # 5. Enhance nodes with image references
            for i, node in enumerate(nodes):
                # Find images that belong to this text chunk
                relevant_images = self._find_relevant_images(node, processed_images)
                
                node.metadata.update({
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_type": self._determine_chunk_type(node.text),
                    "word_count": len(node.text.split()),
                    "character_count": len(node.text),
                    "associated_images": relevant_images,
                    "has_visual_content": len(relevant_images) > 0
                })
            
            # 6. Store images in database
            await self._store_image_metadata(document_id, processed_images)
            
            # 7. Create vector index
            index = VectorStoreIndex(
                nodes=nodes,
                vector_store=self.vector_store
            )
            
            # 8. Update document status
            await self.supabase.table("pdf_documents").update({
                "processing_status": "completed",
                "total_chunks": len(nodes),
                "total_images": len(processed_images),
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", document_id).execute()
            
            return {
                "status": "success",
                "document_id": document_id,
                "chunks_created": len(nodes),
                "images_processed": len(processed_images),
                "index_id": index.index_id
            }
            
        except Exception as e:
            await self.supabase.table("pdf_documents").update({
                "processing_status": "failed",
                "error_message": str(e),
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", document_id).execute()
            
            raise Exception(f"Enhanced PDF processing failed: {str(e)}")
    
    def _find_relevant_images(self, node, processed_images: List[dict]) -> List[dict]:
        """Find images that are contextually relevant to a text node"""
        
        relevant_images = []
        node_text_lower = node.text.lower()
        
        for image in processed_images:
            # Check if image is mentioned in text
            image_filename = os.path.basename(image["image_path"]).lower()
            if image_filename.replace('.png', '') in node_text_lower:
                relevant_images.append({
                    "image_url": image["image_url"],
                    "image_analysis": image["analysis"],
                    "similarity_matches": image["similar_images"]
                })
        
        return relevant_images
    
    async def _store_image_metadata(self, document_id: str, processed_images: List[dict]):
        """Store image metadata in database"""
        
        image_records = []
        for image in processed_images:
            image_record = {
                "document_id": document_id,
                "image_url": image["image_url"],
                "image_path": image["image_path"],
                "image_embedding": image["embedding"],
                "image_analysis": image["analysis"],
                "similar_images": image["similar_images"]
            }
            image_records.append(image_record)
        
        if image_records:
            await self.supabase.table("document_images").insert(image_records).execute()
```

### 8. Complete LlamaIndex Workflow Summary

#### End-to-End Process Flow with Image Integration
1. **PDF Upload** → Supabase Storage
2. **PDF Processing** → PyMuPDF4LLM extracts Markdown content + images
3. **Image Analysis** → Platform vision services process extracted images
4. **Visual Similarity Search** → Find matching images across platform
5. **Document Creation** → LlamaIndex Document with image metadata
6. **Node Parsing** → MarkdownNodeParser creates semantic chunks with image context
7. **Vector Indexing** → Text and image embeddings stored in Supabase
8. **User Query** → LlamaIndex QueryEngine with visual context
9. **Retrieval** → Advanced similarity search including visual relevance
10. **Response Generation** → Context-aware answer with image references
11. **Response Delivery** → Structured response with visual content traceability

#### Key Benefits of Enhanced Integration
- **Reduced Development Time**: 60-70% less custom RAG code required
- **Visual Intelligence**: Leverages existing platform vision capabilities
- **Cross-Document Image Matching**: Find similar images across all processed documents
- **Multimodal Search**: Text and visual content search in unified interface
- **Platform Synergy**: Reuses existing Material Kai Vision infrastructure
- **Production-Ready**: Battle-tested framework with enterprise features
- **Advanced Retrieval**: Multiple retrieval strategies including visual similarity
- **Comprehensive Analysis**: OCR, object detection, and image classification

## Success Metrics & Monitoring

### 1. Key Performance Indicators (KPIs)

- **Processing Speed**: Average time to process PDFs of different sizes
- **Accuracy**: Quality of Markdown extraction and chunking
- **Reliability**: Success rate of PDF processing operations
- **Scalability**: Concurrent processing capacity
- **Cost Efficiency**: Processing cost per PDF

### 2. Monitoring Setup

#### Application Metrics
```python
# app/middleware/metrics.py
from prometheus_client import Counter, Histogram, Gauge
import time

# Metrics
pdf_processing_requests = Counter('pdf_processing_requests_total', 'Total PDF processing requests')
pdf_processing_duration = Histogram('pdf_processing_duration_seconds', 'PDF processing duration')
active_processing_jobs = Gauge('active_processing_jobs', 'Number of active processing jobs')

class MetricsMiddleware:
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/process"):
            pdf_processing_requests.inc()
            start_time = time.time()
            active_processing_jobs.inc()
            
            try:
                await self.app(scope, receive, send)
            finally:
                processing_time = time.time() - start_time
                pdf_processing_duration.observe(processing_time)
                active_processing_jobs.dec()
        else:
            await self.app(scope, receive, send)
```

### 3. Health Checks & Alerts

#### Comprehensive Health Check
```python
@app.get("/health/detailed")
async def detailed_health_check():
    """Comprehensive health check with dependency status"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "checks": {}
    }
    
    # Check PyMuPDF4LLM
    try:
        import pymupdf4llm
        health_status["checks"]["pymupdf4llm"] = "available"
    except ImportError:
        health_status["checks"]["pymupdf4llm"] = "unavailable"
        health_status["status"] = "degraded"
    
    # Check Supabase connection
    try:
        supabase_status = await supabase_client.test_connection()
        health_status["checks"]["supabase"] = "connected" if supabase_status else "disconnected"
        if not supabase_status:
            health_status["status"] = "degraded"
    except Exception:
        health_status["checks"]["supabase"] = "error"
        health_status["status"] = "unhealthy"
    
    # Check disk space
    import shutil
    disk_usage = shutil.disk_usage("/tmp")
    free_space_gb = disk_usage.free / (1024**3)
    health_status["checks"]["disk_space"] = f"{free_space_gb:.2f}GB free"
    
    if free_space_gb < 1:  # Less than 1GB free
        health_status["status"] = "degraded"
    
    return health_status
```

## Service Responsibility Matrix

### 🔧 **PDF2Markdown Microservice** (Digital Ocean Droplet)

**Core Responsibilities:**
- **PDF Content Extraction**: PyMuPDF4LLM processing to extract markdown chunks
- **Embedding Generation**: Create vector embeddings using OpenAI/Local LLM
- **Chunk Storage**: Store processed chunks and embeddings in Supabase
- **Health Monitoring**: Internal service health checks and metrics
- **Error Handling**: Robust processing error management with fallback mechanisms

**Specific Components:**
- ✅ **Content Extraction** → PyMuPDF4LLM processes to Markdown chunks
- ✅ **Embedding Generation** → OpenAI/Local model creates vector embeddings
- ✅ **Storage** → Chunks and embeddings stored in Supabase with metadata
- ✅ **Monitoring & Health Checks** → Comprehensive metrics, logging, and alerting
- ✅ **Error Handling** → Robust error management with fallback mechanisms

### 🌐 **Material Kai Vision Platform** (Vercel - Existing App)

**Core Responsibilities:**
- **User Interface**: PDF upload, processing status, and results display
- **Authentication**: User session management and access control
- **File Management**: PDF upload orchestration to Supabase Storage
- **Query Processing**: User questions and RAG search coordination
- **Results Presentation**: Display answers with source attribution and pagination

**Specific Components:**
- ✅ **PDF Upload** → Supabase Storage (via existing app)
- ✅ **Query Processing** → User questions converted to embeddings (via microservice)
- ✅ **Vector Search** → Similar chunks retrieved using cosine similarity (via microservice)
- ✅ **Context Assembly** → Relevant chunks combined with source attribution (via microservice)
- ✅ **Answer Generation** → LLM generates responses using retrieved context (via microservice)
- ✅ **Frontend Integration** → Ready-to-use TypeScript services and React hooks
- ✅ **Testing Framework** → Unit, integration, and end-to-end test strategies
- ✅ **Deployment Strategy** → Existing Vercel deployment (no changes needed)

### 🔄 **End-to-End Workflow Distribution**

## **PHASE 1: PDF PROCESSING WORKFLOW**

| Step | Who Does It | What They Do | Technical Details | Location |
|------|-------------|--------------|-------------------|----------|
| **1. User Uploads PDF** | **Material Kai App** | • Display file upload UI<br>• Validate file type/size<br>• Upload to Supabase Storage<br>• Show upload progress | `supabase.storage.from('pdfs').upload()` | Vercel |
| **2. Trigger Processing** | **Material Kai App** | • Call microservice API<br>• Pass PDF URL from Supabase<br>• Create processing job record<br>• Show "Processing..." status | `POST /api/v1/process-pdf`<br>`{ pdf_url, user_id, job_id }` | Vercel |
| **3. Download PDF** | **PDF2Markdown Service** | • Download PDF from Supabase Storage<br>• Validate file integrity<br>• Load into memory for processing | `supabase.storage.from('pdfs').download()` | Digital Ocean |
| **4. Extract Content** | **PDF2Markdown Service** | • Run PyMuPDF4LLM extraction<br>• Generate markdown chunks<br>• Extract images and metadata<br>• Handle tables and formatting | `pymupdf4llm.to_markdown()`<br>Chunk size: 1000 tokens | Digital Ocean |
| **5. Generate Embeddings** | **PDF2Markdown Service** | • Send chunks to OpenAI/Local LLM<br>• Generate vector embeddings<br>• Batch process for efficiency | `openai.embeddings.create()`<br>Model: `text-embedding-3-small` | Digital Ocean |
| **6. Store Data** | **PDF2Markdown Service** | • Insert document record<br>• Insert chunks with embeddings<br>• Update processing status<br>• Clean up temp files | `INSERT INTO pdf_documents`<br>`INSERT INTO document_chunks` | Digital Ocean |
| **7. Notify Completion** | **PDF2Markdown Service** | • Update job status to "completed"<br>• Send webhook/notification to app<br>• Log processing metrics | WebSocket or polling endpoint | Digital Ocean |
| **8. Update UI** | **Material Kai App** | • Receive completion notification<br>• Update UI to show "Ready"<br>• Enable search functionality<br>• Display document summary | Real-time status updates | Vercel |

## **PHASE 2: RAG SEARCH WORKFLOW**

| Step | Who Does It | What They Do | Technical Details | Location |
|------|-------------|--------------|-------------------|----------|
| **1. User Asks Question** | **Material Kai App** | • Display search input UI<br>• Validate question length<br>• Show loading state<br>• Handle user session | React form with validation | Vercel |
| **2. Send Query** | **Material Kai App** | • Call microservice search API<br>• Pass user question + context<br>• Include document filters<br>• Handle authentication | `POST /api/v1/search`<br>`{ query, document_ids, user_id }` | Vercel |
| **3. Generate Query Embedding** | **PDF2Markdown Service** | • Convert question to embedding<br>• Use same model as documents<br>• Normalize vector for search | `openai.embeddings.create()`<br>Same model as indexing | Digital Ocean |
| **4. Vector Search** | **PDF2Markdown Service** | • Query Supabase pgvector<br>• Find similar chunks<br>• Apply similarity threshold<br>• Rank by relevance score | `SELECT * FROM match_documents()`<br>Cosine similarity > 0.7 | Digital Ocean |
| **5. Context Assembly** | **PDF2Markdown Service** | • Retrieve top matching chunks<br>• Combine with metadata<br>• Prepare context for LLM<br>• Include source attribution | Max 4000 tokens context<br>Include page numbers | Digital Ocean |
| **6. Generate Answer** | **PDF2Markdown Service** | • Send context + question to LLM<br>• Generate comprehensive answer<br>• Include source citations<br>• Format response | `openai.chat.completions.create()`<br>Model: `gpt-4o-mini` | Digital Ocean |
| **7. Return Results** | **PDF2Markdown Service** | • Format final response<br>• Include source chunks<br>• Add confidence scores<br>• Log search metrics | JSON response with sources | Digital Ocean |
| **8. Display Answer** | **Material Kai App** | • Render formatted answer<br>• Show source citations<br>• Enable source navigation<br>• Allow follow-up questions | React components with links | Vercel |

## **PHASE 3: ONGOING OPERATIONS**

| Operation | Who Does It | What They Do | Technical Details | Location |
|-----------|-------------|--------------|-------------------|----------|
| **Document Management** | **Material Kai App** | • List user's documents<br>• Delete documents<br>• View processing status<br>• Manage permissions | `GET /api/v1/documents`<br>`DELETE /api/v1/documents/{id}` | Vercel |
| **Health Monitoring** | **PDF2Markdown Service** | • Monitor system health<br>• Track processing metrics<br>• Handle error recovery<br>• Scale resources | `GET /health/detailed`<br>Prometheus metrics | Digital Ocean |
| **User Authentication** | **Material Kai App** | • Handle user login/logout<br>• Manage sessions<br>• Enforce access controls<br>• Rate limiting | Supabase Auth integration | Vercel |
| **Error Handling** | **Both Services** | • Log errors appropriately<br>• Provide user feedback<br>• Implement retry logic<br>• Escalate critical issues | Structured logging<br>Error boundaries | Both |

### 🎯 **Integration Points & Data Storage**

## **Data Storage Strategy**

**All PDF processing data is stored in Supabase (shared database):**
- **PDF Documents**: Stored in Supabase Storage buckets
- **Processed Chunks**: Stored in Supabase PostgreSQL with pgvector extension
- **Vector Embeddings**: Stored alongside chunks in the same database
- **Processing Status**: Tracked in Supabase tables
- **User Sessions**: Managed through Supabase Auth

**No data duplication** - both services access the same Supabase instance with different permissions.

## **API Endpoints (Microservice → App)**

```typescript
// Material Kai App calls these microservice endpoints
POST /api/v1/process-pdf     // Trigger PDF processing
  // Request: { pdf_url: string, user_id: string, job_id: string }
  // Response: { job_id: string, status: "processing" }
  // Storage: Creates job record in Supabase, processes PDF, stores chunks

GET  /api/v1/status/{job_id} // Check processing status
  // Response: { status: "processing" | "completed" | "failed", progress: number }
  // Storage: Reads job status from Supabase

POST /api/v1/search          // Perform RAG search
  // Request: { query: string, document_ids?: string[], user_id: string }
  // Response: { answer: string, sources: Array<{chunk_id, page, similarity}> }
  // Storage: Queries Supabase pgvector, returns results (no storage)

GET  /api/v1/documents       // List processed documents
  // Response: Array<{ id, title, status, created_at, chunk_count }>
  // Storage: Reads from Supabase pdf_documents table
```

## **What Gets Removed from Material Kai Platform**

### ❌ **Components to Remove/Replace:**
1. **Existing PDF Processing Logic**:
   - Current PDF parsing functions
   - HTML conversion utilities
   - Local PDF storage handling
   - Any ConvertAPI direct calls for primary processing

2. **PDF-Related Database Operations**:
   - Local PDF metadata storage
   - Document processing status tracking
   - Search indexing logic

3. **PDF Search Functionality**:
   - Current text search implementations
   - Document querying logic
   - Results formatting (will be replaced with RAG responses)

### ✅ **Components to Keep in Material Kai Platform:**
1. **User Interface Components**:
   - File upload UI components
   - Document list displays
   - Search input forms
   - Results display components (modified for RAG responses)

2. **Authentication & Authorization**:
   - User login/logout
   - Session management
   - Access control logic
   - Rate limiting

3. **API Integration Layer**:
   - HTTP client services
   - Error handling
   - Loading states
   - Notification systems

4. **ConvertAPI Integration** (as fallback):
   - Keep existing ConvertAPI code as secondary option
   - Modify to be triggered only when microservice fails

## **Shared Resources:**
- **Supabase Database**: Both services read/write (with proper RLS policies)
- **Supabase Storage**: App uploads, microservice downloads for processing
- **Environment Variables**: Shared API keys and configuration
- **Authentication**: Shared Supabase Auth tokens for user identification

### 🛡️ **Security & Access Control**

**Material Kai App:**
- User authentication and session management
- File upload validation and virus scanning
- Rate limiting for user requests
- UI-level access controls

**PDF2Markdown Microservice:**
- API key authentication for service-to-service calls
- Supabase RLS policy enforcement
- Input validation and sanitization
- Resource usage monitoring and limits

## Conclusion

This comprehensive implementation plan provides a complete roadmap for transitioning from HTML-based PDF processing to a modern, LLM-optimized Markdown extraction system using PyMuPDF4LLM and Supabase. The solution offers:

### Key Benefits

1. **🤖 LLM-Optimized**: Purpose-built for RAG workflows with intelligent chunking
2. **☁️ Cloud-Native**: Fully integrated with Supabase for scalable data management
3. **📦 Zero Local Storage**: In-memory processing with cloud persistence
4. **🔄 Hybrid Reliability**: ConvertAPI fallback ensures high availability
5. **⚡ High Performance**: Optimized for speed and concurrent processing
6. **🛡️ Production Ready**: Comprehensive monitoring, testing, and deployment strategies
7. **🔀 Clear Separation**: Well-defined responsibilities between microservice and main app

### Next Steps

1. **Phase 1**: Set up development environment and core PyMuPDF4LLM integration
2. **Phase 2**: Implement Supabase database schema and storage integration
3. **Phase 3**: Build and test the FastAPI microservice
4. **Phase 4**: Deploy to Digital Ocean droplet with NGINX
5. **Phase 5**: Integrate with Material Kai Vision Platform frontend
6. **Phase 6**: Monitor, optimize, and scale based on usage patterns

This implementation plan ensures a smooth transition to a modern, scalable PDF processing solution that aligns perfectly with LLM-RAG workflows while maintaining clear architectural boundaries and the reliability requirements of the Material Kai Vision Platform.
