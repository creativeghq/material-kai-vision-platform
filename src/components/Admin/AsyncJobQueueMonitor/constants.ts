import {
  Clock,
  FileText,
  Zap,
  Package,
  Link,
  Activity,
  Download,
  CheckCircle,
  Terminal,
  Image as ImageIcon,
  Flame,
  Cpu,
  Search,
} from 'lucide-react';

// Global Pipeline Definition for the Monitor (PDF Processing - default)
// Stages map 1:1 to backend checkpoint stages from ProcessingStage enum
export const GLOBAL_PIPELINE_FLOW = [
  { id: 'initialized', name: 'Initialized', icon: Clock, checkpoint: 'initialized' },
  { id: 'warmup', name: 'AI Warmup', icon: Flame, checkpoint: 'warmup_complete' },
  // Stage 1 (structure-first): the PaddleOCR structural pass runs BEFORE discovery —
  // one call per physical page → layout regions + OCR text + figure boxes →
  // document_layout_analysis cache. Discovery then reads that cache.
  { id: 'layout_precompute', name: 'PaddleOCR Layout+OCR', icon: Cpu, checkpoint: 'stage_1_5_layout_precompute' },
  { id: 'discovery', name: 'Discovery', icon: Search, checkpoint: 'products_detected' },
  { id: 'extraction', name: 'PDF Extract', icon: FileText, checkpoint: 'pdf_extracted' },
  { id: 'chunking', name: 'Chunking', icon: FileText, checkpoint: 'chunks_created' },
  { id: 'text_embeddings', name: 'Embeddings', icon: Cpu, checkpoint: 'text_embeddings_generated' },
  { id: 'images', name: 'Images', icon: ImageIcon, checkpoint: 'images_extracted' },
  { id: 'processing', name: 'Products', icon: Package, checkpoint: 'products_created' },
  { id: 'relationships', name: 'Relations', icon: Link, checkpoint: 'relationships_created' },
  { id: 'completed', name: 'Complete', icon: CheckCircle, checkpoint: 'completed' },
];

// XML Import Pipeline Stages
export const XML_IMPORT_PIPELINE_FLOW = [
  { id: 'initialized', name: 'Job Initialized', icon: Clock, checkpoint: 'initialized' },
  { id: 'products_parsed', name: 'Products Parsed', icon: FileText, checkpoint: 'products_parsed' },
  { id: 'images_downloaded', name: 'Images Downloaded', icon: Download, checkpoint: 'images_downloaded' },
  { id: 'images_classified', name: 'Images Classified', icon: ImageIcon, checkpoint: 'images_classified' },
  { id: 'clips_generated', name: 'SLIG Embeddings', icon: Zap, checkpoint: 'clips_generated' },
  { id: 'chunks_created', name: 'Chunks Created', icon: FileText, checkpoint: 'chunks_created' },
  { id: 'embeddings_queued', name: 'Embeddings Queued', icon: Activity, checkpoint: 'embeddings_queued' },
  { id: 'completed', name: 'Completed', icon: CheckCircle, checkpoint: 'completed' },
];

// Web Scraping Pipeline Stages
export const WEB_SCRAPING_PIPELINE_FLOW = [
  { id: 'initialized', name: 'Job Initialized', icon: Clock, checkpoint: 'initialized' },
  { id: 'pages_scraped', name: 'Pages Scraped', icon: Terminal, checkpoint: 'pages_scraped' },
  { id: 'products_discovered', name: 'Products Discovered', icon: Package, checkpoint: 'products_discovered' },
  { id: 'images_extracted', name: 'Images Extracted', icon: ImageIcon, checkpoint: 'images_extracted' },
  { id: 'images_downloaded', name: 'Images Downloaded', icon: Download, checkpoint: 'images_downloaded' },
  { id: 'images_classified', name: 'Images Classified', icon: ImageIcon, checkpoint: 'images_classified' },
  { id: 'clips_generated', name: 'SLIG Embeddings', icon: Zap, checkpoint: 'clips_generated' },
  { id: 'chunks_created', name: 'Chunks Created', icon: FileText, checkpoint: 'chunks_created' },
  { id: 'embeddings_queued', name: 'Embeddings Queued', icon: Activity, checkpoint: 'embeddings_queued' },
  { id: 'completed', name: 'Completed', icon: CheckCircle, checkpoint: 'completed' },
];

// Helper function to get pipeline stages based on job type
export const getPipelineForJobType = (jobType: string) => {
  switch (jobType) {
    case 'xml_import':
      return XML_IMPORT_PIPELINE_FLOW;
    case 'web_scraping':
      return WEB_SCRAPING_PIPELINE_FLOW;
    case 'pdf_processing':
    case 'product_discovery_upload':
    default:
      return GLOBAL_PIPELINE_FLOW;
  }
};

// Enhanced Product Stages with detailed sub-steps
export const PRODUCT_STAGES = [
  {
    id: 'extraction',
    name: 'Page Extraction',
    icon: FileText,
    description: 'Map catalog pages to PDF pages (layout read from PaddleOCR cache)',
  },
  {
    id: 'chunking',
    name: 'Text Chunking',
    icon: FileText,
    description: 'Create semantic chunks + embeddings',
  },
  {
    id: 'images',
    name: 'Image Processing',
    icon: ImageIcon,
    description: '4-layer extraction + Vision classification',
  },
  {
    id: 'creation',
    name: 'Product Creation',
    icon: Package,
    description: 'Create product record + metadata',
  },
  {
    id: 'relationships',
    name: 'Relationships',
    icon: Link,
    description: 'Link entities + create relations',
  },
];

