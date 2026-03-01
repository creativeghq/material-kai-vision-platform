# Features Guide

Complete reference of all platform features and capabilities.

---

## 🎯 Core Features

### 1. Intelligent PDF Processing

**14-Stage Pipeline**:
- Product discovery with AI
- Focused extraction (product pages only)
- Semantic text chunking
- Multi-vector embeddings
- Image analysis with OCR
- Product creation with validation
- Metafield extraction
- Quality enhancement

**Capabilities**:
- ✅ Automatic product identification
- ✅ Metadata extraction (200+ types)
- ✅ Image analysis and OCR
- ✅ Checkpoint recovery on failure
- ✅ Real-time progress tracking
- ✅ Batch processing support

---

### 2. Multi-Modal Search

**Search Types**:

**Status:** ✅ All 6 strategies + 7-vector fusion implemented (100% complete)

**1. Semantic Search** ✅
- Natural language understanding with MMR diversity
- Understands intent and context
- Lambda: 0.5 (balanced relevance + diversity)
- Response time: <150ms
- Accuracy: 85%+

**2. Vector Search** ✅
- Pure similarity matching (no diversity)
- Fast lookup using pgvector
- Lambda: 1.0 (pure relevance)
- Response time: <100ms
- Precision: 88%+

**3. Multi-Vector Search** ✅
- 7-vector fusion: text (1024D, Voyage AI), visual (768D, SigLIP2), understanding (1024D, Voyage AI), color, texture, style, material (768D each, SigLIP2)
- All vectors stored as **halfvec** (float16) — 50% storage savings, zero accuracy loss
- Understanding embeddings enable spec-based search (dimensions, finishes, properties) from Qwen3-VL structured analysis
- **Query-adaptive weight profiles**: 7 profiles (product_name, color_finish, specification, texture_pattern, style_aesthetic, material_search, balanced) automatically selected based on query intent
- GPT-4o-mini parses query → selects optimal weights → adjusts fusion scoring per search
- Response time: <200ms
- Best for: Complex queries

**4. Hybrid Search** ✅
- Combines semantic (70%) + keyword matching (30%)
- PostgreSQL full-text search integration
- Best accuracy for technical terms
- Response time: <180ms
- Accuracy: 90%+

**5. Material Search** ✅
- Property-based filtering using JSONB
- Filter by material_type, dimensions, slip_resistance, etc.
- GIN index for performance
- Response time: <50ms
- Precision: 95%+

**6. Image Search** ✅
- Visual similarity using CLIP embeddings
- Accepts image URL or base64
- Find visually similar products
- Response time: <150ms
- Accuracy: 88%+

**7. All Strategies Combined** ✅
- Runs all 6 strategies in parallel
- Merges and deduplicates results
- Relevance-based ranking
- Response time: <800ms
- Recommended for comprehensive search

**Overall Performance**:
- Accuracy: 85-95% (strategy-dependent)
- Recall: 90%+
- Precision: 88-95%
- Concurrent queries: 1000+/minute

---

### 3. Materials Catalog

**Features**:
- Browse all materials
- Filter by category
- Sort by relevance
- View material details
- See related materials
- Visual preview
- Specifications display

**Capabilities**:
- ✅ Infinite scroll
- ✅ Advanced filtering
- ✅ Sorting options
- ✅ Search integration
- ✅ Favorites/bookmarks
- ✅ Export functionality

---

### 4. Product Management

**CRUD Operations**:
- Create products
- Read product details
- Update metadata
- Delete products
- Bulk operations

**Product Information**:
- Name and description
- Metafields (200+ types)
- Associated chunks
- Associated images
- Quality scores
- Confidence metrics

---

### 5. Admin Dashboard

**Monitoring**:
- Real-time job tracking
- Progress visualization
- Error monitoring
- Performance metrics
- System health

**Management**:
- User management
- Workspace management
- Document management
- Product management
- Metafield management
- Agent configurations (AI prompts)

**Analytics**:
- Search analytics
- Processing statistics
- AI model usage
- Cost tracking
- Performance trends

**Features**:
- ✅ Live progress updates
- ✅ Job history
- ✅ Error logs
- ✅ Performance charts
- ✅ Export reports

---

### 6. RAG System (Retrieval-Augmented Generation)

**Capabilities**:
- Document upload and indexing
- Semantic search
- Chat interface
- Multi-document retrieval
- Context-aware responses

**Features**:
- ✅ Document management
- ✅ Query interface
- ✅ Chat history
- ✅ Source attribution
- ✅ Relevance scoring

---

### 7. Real-Time Monitoring

**Progress Tracking**:
- Live progress percentage
- Current stage display
- Estimated time remaining
- Detailed metrics
- Error notifications

**Features**:
- ✅ Server-Sent Events (SSE)
- ✅ WebSocket support
- ✅ Real-time updates
- ✅ Progress persistence
- ✅ Checkpoint tracking

---

### 8. Metadata Management

**Metafield Types** (200+):
- Material composition
- Dimensions (length, width, height)
- Weight and density
- Color and finish
- Texture and pattern
- Application and use case
- Care instructions
- Certifications
- Pricing and availability
- Supplier information

**Features**:
- ✅ Dynamic metafield creation
- ✅ Type validation
- ✅ Multi-value support
- ✅ Relationship linking
- ✅ Search integration

---

### 9. Image Management

**Capabilities**:
- Automatic image extraction
- OCR on material specs
- Quality scoring
- Visual embeddings
- Storage management

**Features**:
- ✅ Batch processing
- ✅ Quality analysis
- ✅ Metadata extraction
- ✅ Visual search
- ✅ Storage optimization

---

### 10. Workspace Isolation

**Multi-Tenancy**:
- User workspaces
- Data isolation
- Row-Level Security (RLS)
- Separate indexes
- Independent quotas

**Features**:
- ✅ Workspace creation
- ✅ User management
- ✅ Permission control
- ✅ Data privacy
- ✅ Audit logging

---

### 11. Batch Processing

**Capabilities**:
- Batch PDF upload
- Batch image analysis
- Batch product creation
- Batch embeddings
- Batch search

**Features**:
- ✅ Async processing
- ✅ Progress tracking
- ✅ Error handling
- ✅ Result aggregation
- ✅ Performance optimization

---

### 12. API Gateway

**Features**:
- Unified API interface
- Request routing
- Response formatting
- Error handling
- Rate limiting
- Authentication

**Endpoints**:
- 74+ REST endpoints
- 9 categories
- Comprehensive documentation
- OpenAPI schema

---

## 🔐 Security Features

✅ **Authentication**:
- Supabase JWT
- MIVAA JWT
- API keys

✅ **Authorization**:
- Row-Level Security (RLS)
- Role-based access control
- Workspace isolation

✅ **Data Protection**:
- HTTPS/TLS encryption
- Database encryption
- Secure storage
- Audit logging

✅ **API Security**:
- Rate limiting
- Input validation
- SQL injection prevention
- CORS configuration

---

## 📊 Analytics & Reporting

**Available Metrics**:
- Search analytics
- Processing statistics
- AI model usage
- Cost tracking
- Performance trends
- Error rates
- User activity

**Export Options**:
- CSV export
- JSON export
- PDF reports
- Custom queries

---

## 🚀 Performance Features

**Optimization**:
- ✅ Query caching
- ✅ Result caching
- ✅ Batch processing
- ✅ Lazy loading
- ✅ Pagination
- ✅ Compression

**Scalability**:
- ✅ Horizontal scaling
- ✅ Load balancing
- ✅ Connection pooling
- ✅ Index optimization
- ✅ Query optimization

---

## 🔄 Integration Features

**External Services**:
- Anthropic (Claude Sonnet/Haiku 4.5 + built-in web search for B2B)
- OpenAI (GPT-4o, GPT-4o-mini for query parsing)
- Voyage AI (voyage-3.5 text + understanding embeddings)
- HuggingFace Endpoint (Qwen3-VL 32B vision analysis)
- SigLIP2 via HuggingFace Endpoint (5 visual embedding types, 768D each)
- Replicate (14 interior design generation models)
- WorldLabs Marble (3D Gaussian Splat VR world generation)
- Supabase (Database, auth, storage, edge functions)
- Direct Vector DB RAG (Claude 4.5)

**Capabilities**:
- ✅ API integration
- ✅ Webhook support
- ✅ Data sync
- ✅ Error handling
- ✅ Retry logic

---

### 15. Duplicate Detection & Merging

**Purpose**: Maintain data quality by identifying and consolidating duplicate products

**Key Features**:
- ✅ Factory-based duplicate detection (CRITICAL: same factory only)
- ✅ Multi-metric similarity scoring (name, description, metadata)
- ✅ Confidence levels (high, medium, low)
- ✅ Product merging with data consolidation
- ✅ Merge history tracking with full audit trail
- ✅ Undo capability with snapshot restoration
- ✅ Batch duplicate scanning
- ✅ Caching for performance

**Detection Rules**:
- **MUST have same factory/manufacturer** (primary filter)
- Visual similarity alone does NOT create duplicates
- Different factories = NOT duplicates (even if identical)

**Similarity Scoring**:
- Name similarity: 50% weight
- Description similarity: 30% weight
- Metadata similarity: 20% weight
- Overall score: 0.0-1.0

**Confidence Levels**:
- High: 85%+ (very likely duplicate)
- Medium: 70-85% (possible duplicate)
- Low: 55-70% (review needed)

**API Endpoints** (7 total):
- `POST /api/duplicates/detect` - Detect for single product
- `POST /api/duplicates/batch-detect` - Scan workspace
- `GET /api/duplicates/cached` - Get cached results
- `POST /api/duplicates/update-status` - Update status
- `POST /api/duplicates/merge` - Merge products
- `POST /api/duplicates/undo-merge` - Undo merge
- `GET /api/duplicates/merge-history` - Get history

**Database Tables**:
- `product_merge_history` - Merge operations with snapshots
- `duplicate_detection_cache` - Pre-computed duplicate pairs

---

### 16. Quotes System

**Purpose**: Comprehensive quote management system for customers and admins

**Status:** ✅ 100% Complete (Production Ready)

**Customer Features**:
- ✅ Create multiple independent quotes
- ✅ Add products from search, agents, moodboards
- ✅ Custom text-based requests (no products required)
- ✅ Dimensions and area tracking (width, height, sqm)
- ✅ Auto-expiration after 30 days (configurable)
- ✅ Activity tracking extends expiration
- ✅ Submit quote requests
- ✅ View attached extras/upsells
- ✅ Accept/reject individual extras
- ✅ Accept quotes with validation
- ✅ View project timeline (when accepted)

**Admin Features**:
- ✅ View all quote requests
- ✅ Filter by custom status tags
- ✅ Full-page quote detail view with tabs
- ✅ Assign custom status tags with colors
- ✅ Attach upsells/extras to quotes
- ✅ Monitor customer acceptance of extras
- ✅ Update project timeline progress
- ✅ Add notes to timeline steps

**Management Pages**:
- ✅ Status Tags Management (`/admin/status-tags`)
  - Create/edit/delete custom status tags
  - Color picker for tag colors
  - System vs custom tag distinction
  - 6 default system tags (pending, in_progress, quoted, accepted, rejected, expired)

- ✅ Upsells Management (`/admin/upsells`)
  - Create/edit/delete upsell items
  - Set pricing and descriptions
  - Active/inactive status toggle
  - Display order management

- ✅ Timeline Steps Management (`/admin/timeline-steps`)
  - Create/edit/delete timeline steps
  - 9 default steps (Quote Accepted → Project Completed)
  - Display order management
  - Active/inactive status

**Project Timeline**:
- ✅ Auto-initialization when quote accepted
- ✅ 9 predefined steps with descriptions
- ✅ Visual timeline tree with connector lines
- ✅ Status tracking (pending, in_progress, completed, skipped)
- ✅ Admin can update status and add notes
- ✅ Customer read-only view
- ✅ Completed timestamps
- ✅ Color-coded status badges

**Quote Acceptance Workflow**:
- ✅ Validation requiring all extras to be decided
- ✅ Status change to 'accepted'
- ✅ Automatic timeline initialization
- ✅ Timeline button visibility control

**Database Tables** (8 total):
- `quotes` - Core quote data
- `quote_items` - Quote items with dimensions
- `status_tags` - Custom status tags
- `upsells` - Admin-managed upsell items
- `quote_upsells` - Junction table with acceptance tracking
- `timeline_steps` - Predefined timeline steps
- `quote_timeline` - Timeline progress tracking
- `system_settings` - Platform configuration

**API Endpoints**: 30+ methods via QuotesService
- Core quote operations (CRUD)
- Status tags management
- Upsells management
- Timeline management
- Expiration tracking

---

### 17. VR World Generation

**Purpose**: Generate explorable 3D worlds from interior design images using WorldLabs Marble API

**Status:** ✅ Complete (Production Ready)

**Key Features**:
- ✅ One-click "Generate VR" on any interior design image
- ✅ 3D Gaussian Splat rendering via Spark.js
- ✅ Orbit controls (drag to rotate, scroll to zoom)
- ✅ First-person navigation (WASD + mouse look + Shift for speed)
- ✅ Navigation mode toggle (Orbit / Walk)
- ✅ 3 quality levels (Draft 100k, Standard 500k, Full)
- ✅ Fullscreen mode
- ✅ Adaptive status polling with loading animations
- ✅ Credit-based pricing with refund on failure
- ✅ Persists across chat sessions

**Models**:
- `marble-0.1-mini`: 50 credits, ~30-45 seconds
- `marble-0.1-plus`: 200 credits, ~5 minutes

**Output Assets**:
- SPZ files (3 quality levels — Gaussian Splats)
- Collider GLB (collision mesh for navigation)
- Panorama image (360 render)
- Thumbnail (preview)
- AI-generated caption

**Components**:
- Edge Function: `generate-vr-world`
- Frontend: `WorldViewer.tsx` (Spark.js renderer)
- Service: `vrWorldService.ts`
- Database: `vr_worlds` table

**Documentation**: [vr-world-generation.md](vr-world-generation.md)

---

## 📱 User Interface Features

**Frontend Components**:
- Materials catalog
- Search hub
- Admin dashboard
- Real-time monitoring
- Progress visualization
- Error handling
- Responsive design
- Quote management system
- Project timeline viewer

**User Experience**:
- ✅ Intuitive navigation
- ✅ Fast loading
- ✅ Real-time updates
- ✅ Error messages
- ✅ Help documentation
- ✅ Accessibility
- ✅ Tab-based interfaces
- ✅ Modal workflows
- ✅ Visual feedback

---

**Last Updated**: March 1, 2026
**Version**: 3.2.0
**Status**: Production
