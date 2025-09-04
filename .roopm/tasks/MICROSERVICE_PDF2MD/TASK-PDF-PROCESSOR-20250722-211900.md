+++
id = "TASK-PDF-PROCESSOR-20250722-211900"
title = "Implement Core PDF Processing Service with PyMuPDF4LLM"
status = "🟡 To Do"
type = "🌟 Feature"
assigned_to = "dev-python"
coordinator = "manager-product"
priority = "high"
estimated_hours = 4
created_date = "2025-07-22T21:19:00Z"
updated_date = "2025-07-22T21:19:00Z"
related_docs = [
    "docs/011_pymupdf_api_infrastructure_implementation_plan_2025.md"
]
tags = ["pdf-processing", "pymupdf4llm", "markdown", "image-extraction", "core-service"]
dependencies = ["TASK-SETUP-20250722-210600"]
+++

# Implement Core PDF Processing Service with PyMuPDF4LLM

## Description

Implement the core PDF processing service that uses PyMuPDF4LLM to extract markdown content and images from PDF documents. This service will be the foundation of our microservice, providing clean markdown output optimized for LLM workflows and RAG applications.

## Acceptance Criteria

- [ ] PDF processor service class implemented with PyMuPDF4LLM integration
- [ ] Markdown extraction functionality working correctly
- [ ] Image extraction and processing capabilities
- [ ] Proper error handling and logging
- [ ] Configuration management for processing options
- [ ] Comprehensive type hints and documentation
- [ ] Unit tests for core functionality
- [ ] Integration with existing FastAPI structure

## Technical Requirements

### Core Service Implementation

**File: `app/services/pdf_processor.py`**

```python
from typing import List, Dict, Any, Optional, Tuple
import pymupdf4llm
import tempfile
import os
import uuid
from pathlib import Path
import logging
from dataclasses import dataclass
from datetime import datetime

@dataclass
class PDFProcessingResult:
    """Result of PDF processing operation"""
    document_id: str
    markdown_content: str
    extracted_images: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    processing_time: float
    page_count: int
    word_count: int
    character_count: int
    
class PDFProcessor:
    """Core PDF processing service using PyMuPDF4LLM"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
    async def process_pdf_from_bytes(
        self, 
        pdf_bytes: bytes, 
        document_id: Optional[str] = None,
        processing_options: Optional[Dict[str, Any]] = None
    ) -> PDFProcessingResult:
        """Process PDF from bytes and return markdown + images"""
        
    async def process_pdf_from_url(
        self, 
        pdf_url: str, 
        document_id: Optional[str] = None,
        processing_options: Optional[Dict[str, Any]] = None
    ) -> PDFProcessingResult:
        """Process PDF from URL and return markdown + images"""
        
    async def extract_markdown_content(
        self, 
        pdf_path: str,
        processing_options: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """Extract markdown content using PyMuPDF4LLM"""
        
    async def extract_images(
        self, 
        pdf_path: str, 
        document_id: str,
        processing_options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Extract images from PDF and return metadata"""
        
    def _create_temp_directory(self, document_id: str) -> str:
        """Create temporary directory for processing"""
        
    def _cleanup_temp_files(self, temp_dir: str) -> None:
        """Clean up temporary files after processing"""
        
    def _calculate_content_metrics(self, content: str) -> Dict[str, int]:
        """Calculate word count, character count, etc."""
```

### Processing Options Configuration

**File: `app/models/processing.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum

class ImageFormat(str, Enum):
    PNG = "png"
    JPEG = "jpeg"
    WEBP = "webp"

class ProcessingOptions(BaseModel):
    """Configuration options for PDF processing"""
    
    # PyMuPDF4LLM specific options
    pages: Optional[List[int]] = Field(None, description="Specific pages to process (None for all)")
    write_images: bool = Field(True, description="Extract images from PDF")
    image_format: ImageFormat = Field(ImageFormat.PNG, description="Format for extracted images")
    image_dpi: int = Field(150, description="DPI for image extraction")
    
    # Content processing options
    extract_tables: bool = Field(True, description="Extract table content")
    extract_headers: bool = Field(True, description="Extract header information")
    extract_footers: bool = Field(False, description="Extract footer information")
    
    # Quality settings
    min_image_size: int = Field(100, description="Minimum image size in pixels")
    max_image_size: int = Field(2048, description="Maximum image size in pixels")
    
    # Processing limits
    max_pages: Optional[int] = Field(None, description="Maximum pages to process")
    timeout_seconds: int = Field(300, description="Processing timeout in seconds")

class PDFProcessingRequest(BaseModel):
    """Request model for PDF processing"""
    
    document_id: Optional[str] = Field(None, description="Optional document ID")
    pdf_url: Optional[str] = Field(None, description="URL to PDF file")
    processing_options: Optional[ProcessingOptions] = Field(default_factory=ProcessingOptions)
    
class PDFProcessingResponse(BaseModel):
    """Response model for PDF processing"""
    
    document_id: str
    status: str
    markdown_content: str
    extracted_images: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    processing_time: float
    created_at: str
```

### Error Handling

**File: `app/utils/exceptions.py`**

```python
class PDFProcessingError(Exception):
    """Base exception for PDF processing errors"""
    pass

class PDFDownloadError(PDFProcessingError):
    """Error downloading PDF from URL"""
    pass

class PDFParsingError(PDFProcessingError):
    """Error parsing PDF content"""
    pass

class ImageExtractionError(PDFProcessingError):
    """Error extracting images from PDF"""
    pass

class ProcessingTimeoutError(PDFProcessingError):
    """Processing timeout exceeded"""
    pass
```

## Implementation Checklist

### Core Service Development
- [ ] Create `app/services/pdf_processor.py` with PDFProcessor class
- [ ] Implement `process_pdf_from_bytes()` method
- [ ] Implement `process_pdf_from_url()` method  
- [ ] Implement `extract_markdown_content()` using PyMuPDF4LLM
- [ ] Implement `extract_images()` with proper metadata
- [ ] Add temporary file management utilities
- [ ] Implement content metrics calculation

### Data Models
- [ ] Create `app/models/processing.py` with Pydantic models
- [ ] Define ProcessingOptions with all configuration parameters
- [ ] Create PDFProcessingRequest and PDFProcessingResponse models
- [ ] Add proper validation and field descriptions

### Error Handling & Logging
- [ ] Create `app/utils/exceptions.py` with custom exceptions
- [ ] Add comprehensive error handling in processor
- [ ] Implement proper logging throughout the service
- [ ] Add timeout handling for long-running operations

### Configuration Integration
- [ ] Update `app/config.py` to include PDF processing settings
- [ ] Add environment variables for processing defaults
- [ ] Configure image storage paths and cleanup policies

### Testing
- [ ] Create `tests/test_pdf_processor.py` with unit tests
- [ ] Test with various PDF formats and sizes
- [ ] Test error conditions and edge cases
- [ ] Test image extraction functionality
- [ ] Verify markdown output quality

### Integration
- [ ] Update main FastAPI app to include processor service
- [ ] Add dependency injection for processor in routes
- [ ] Ensure proper async/await usage throughout
- [ ] Verify compatibility with existing project structure

## Definition of Done

- PDF processor service successfully extracts markdown from various PDF formats
- Image extraction works correctly with proper metadata
- All error conditions are handled gracefully with appropriate exceptions
- Comprehensive logging provides visibility into processing steps
- Unit tests cover core functionality with good coverage
- Service integrates cleanly with FastAPI application structure
- Code follows Python best practices with proper type hints
- Documentation is clear and comprehensive

## Notes

- Focus on PyMuPDF4LLM integration as the primary extraction engine
- Ensure extracted markdown is optimized for LLM consumption
- Pay special attention to image handling and metadata extraction
- Implement robust error handling for various PDF edge cases
- Consider memory usage for large PDF files
- Prepare for future integration with LlamaIndex and Supabase services

## Technical References

- PyMuPDF4LLM documentation: https://github.com/pymupdf/PyMuPDF4LLM
- FastAPI async patterns: https://fastapi.tiangolo.com/async/
- Pydantic models: https://docs.pydantic.dev/latest/