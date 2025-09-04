+++
id = "SPEC-MATERIAL-IMPORT-SYSTEM-V1"
title = "Material Import System: XML/JSON Import Functionality Specification"
context_type = "specification"
scope = "Comprehensive technical specification for implementing XML/JSON material import functionality"
target_audience = ["roo-commander", "core-architect", "dev-react", "dev-python", "data-specialist"]
granularity = "detailed"
status = "draft"
last_updated = "2025-07-15"
tags = ["import", "materials", "xml", "json", "field-mapping", "deduplication", "automation", "rag", "knowledge-base"]
related_context = [
    "src/types/materials.ts",
    "src/services/ragService.ts", 
    "src/services/enhancedRAGService.ts",
    "supabase/migrations/",
    ".ruru/context/stack_profile.json"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Defines complete import system architecture and implementation plan"
+++

# Material Import System: XML/JSON Import Functionality Specification

## 1. Executive Summary

This specification defines a comprehensive XML/JSON import system for the Material Recognition and Knowledge Platform. The system will enable users to import materials with custom fields, provide intelligent field mapping, prevent duplicates, support automated re-importing, and integrate with the existing RAG/knowledge base system.

## 2. Current System Analysis

### 2.1 Existing Architecture
- **Material Structure**: Complex Material interface with properties, chemical composition, safety data, standards, and embeddings
- **Dynamic Metadata Fields**: Configurable field system via `material_metadata_fields` table supporting multiple field types
- **RAG Integration**: Dual RAG services (basic and enhanced) with multiple embedding types and knowledge extraction
- **Database**: Supabase PostgreSQL with comprehensive schema including 42+ migration files
- **Service Layer**: 136+ specialized services including ML, AI integrations, and workflow services
- **No Existing Import/Export**: Clean slate implementation opportunity

### 2.2 Key Integration Points
- **Material Catalog**: `materials_catalog` table with RLS enabled
- **Metadata Fields**: `material_metadata_fields` dynamic configuration system
- **Knowledge Base**: `knowledge_base_entries` and `enhanced_knowledge_base` tables
- **Embeddings**: `material_embeddings` with multi-modal support
- **RAG Services**: Integration with search and knowledge extraction capabilities

## 3. System Requirements

### 3.1 Functional Requirements

#### 3.1.1 Import Capabilities
- **File Format Support**: XML and JSON file imports
- **URL Import**: Support for remote file URLs with validation
- **Field Detection**: Automatic identification of material fields in import files
- **Custom Field Handling**: Support for non-standard fields not in current schema

#### 3.1.2 Field Mapping System
- **Intelligent Mapping**: AI-powered field identification and mapping suggestions
- **User Interface**: Interactive field mapping interface with preview
- **Field Creation**: Option to create new metadata fields during import
- **Validation**: Field type validation and data format checking

#### 3.1.3 Deduplication System
- **Unique Field Selection**: User-defined unique identifier fields
- **Duplicate Detection**: Intelligent matching based on selected unique fields
- **Merge Options**: Update existing vs. skip vs. create new material options
- **Conflict Resolution**: User interface for handling field conflicts

#### 3.1.4 Automation Features
- **Scheduled Imports**: Cron-based automatic re-importing from URLs
- **Manual Re-import**: On-demand re-import functionality
- **Import History**: Tracking of import sessions and results
- **Error Handling**: Comprehensive error logging and recovery

#### 3.1.5 Knowledge Base Integration
- **RAG Database Updates**: Automatic embedding generation for imported materials
- **Knowledge Extraction**: Integration with enhanced RAG service for material knowledge
- **Search Integration**: Immediate availability in search systems
- **Relationship Mapping**: Automatic relationship detection between materials

### 3.2 Non-Functional Requirements

#### 3.2.1 Performance
- **Batch Processing**: Support for large file imports (1000+ materials)
- **Background Processing**: Asynchronous import processing with progress tracking
- **Memory Efficiency**: Streaming processing for large files
- **Database Optimization**: Bulk insert operations with transaction management

#### 3.2.2 Security
- **File Validation**: Comprehensive validation of import files
- **URL Security**: Safe handling of remote URLs with timeout and size limits
- **Access Control**: Integration with existing RLS and user permissions
- **Data Sanitization**: Protection against malicious input

#### 3.2.3 Reliability
- **Error Recovery**: Graceful handling of partial import failures
- **Data Integrity**: Transactional imports with rollback capability
- **Audit Trail**: Complete logging of import operations
- **Backup Integration**: Coordination with existing backup systems

## 4. Technical Architecture

### 4.1 Database Schema Extensions

#### 4.1.1 New Tables

```sql
-- Import sessions tracking
CREATE TABLE import_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    session_name TEXT NOT NULL,
    import_type TEXT NOT NULL CHECK (import_type IN ('file', 'url')),
    source_url TEXT,
    source_file_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    field_mappings JSONB,
    unique_fields TEXT[],
    duplicate_strategy TEXT DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'update', 'create_new')),
    auto_reimport_enabled BOOLEAN DEFAULT false,
    reimport_schedule TEXT, -- cron expression
    last_reimport_at TIMESTAMPTZ,
    next_reimport_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Import records tracking individual material imports
CREATE TABLE import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_session_id UUID REFERENCES import_sessions(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials_catalog(id),
    source_data JSONB NOT NULL,
    mapped_data JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
    error_message TEXT,
    duplicate_of UUID REFERENCES materials_catalog(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Field mapping templates for reuse
CREATE TABLE field_mapping_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    template_name TEXT NOT NULL,
    description TEXT,
    field_mappings JSONB NOT NULL,
    is_public BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled import jobs
CREATE TABLE scheduled_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_session_id UUID REFERENCES import_sessions(id),
    cron_expression TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    max_failures INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 4.1.2 Indexes and Constraints

```sql
-- Performance indexes
CREATE INDEX idx_import_sessions_user_id ON import_sessions(user_id);
CREATE INDEX idx_import_sessions_status ON import_sessions(status);
CREATE INDEX idx_import_sessions_next_reimport ON import_sessions(next_reimport_at) WHERE auto_reimport_enabled = true;
CREATE INDEX idx_import_records_session_id ON import_records(import_session_id);
CREATE INDEX idx_import_records_material_id ON import_records(material_id);
CREATE INDEX idx_scheduled_imports_next_run ON scheduled_imports(next_run_at) WHERE is_active = true;

-- RLS policies
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_imports ENABLE ROW LEVEL SECURITY;

-- RLS policies for user access
CREATE POLICY "Users can manage their own import sessions" ON import_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own import records" ON import_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM import_sessions 
            WHERE import_sessions.id = import_records.import_session_id 
            AND import_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own field mapping templates" ON field_mapping_templates
    FOR ALL USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can manage their own scheduled imports" ON scheduled_imports
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM import_sessions 
            WHERE import_sessions.id = scheduled_imports.import_session_id 
            AND import_sessions.user_id = auth.uid()
        )
    );
```

### 4.2 Service Layer Architecture

#### 4.2.1 Core Import Service

```typescript
// src/services/materialImportService.ts
interface ImportSession {
  id: string;
  sessionName: string;
  importType: 'file' | 'url';
  sourceUrl?: string;
  sourceFileName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  fieldMappings: FieldMapping[];
  uniqueFields: string[];
  duplicateStrategy: 'skip' | 'update' | 'create_new';
  autoReimportEnabled: boolean;
  reimportSchedule?: string;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  fieldType: 'text' | 'number' | 'dropdown' | 'boolean' | 'date';
  isRequired: boolean;
  defaultValue?: any;
  transformation?: string; // JavaScript expression for data transformation
}

interface ImportResult {
  sessionId: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  skippedRecords: number;
  errors: ImportError[];
  createdMaterials: string[];
  updatedMaterials: string[];
}

class MaterialImportService {
  async createImportSession(config: ImportSessionConfig): Promise<ImportSession>;
  async uploadFile(sessionId: string, file: File): Promise<void>;
  async analyzeImportFile(sessionId: string): Promise<FieldAnalysis>;
  async saveFieldMappings(sessionId: string, mappings: FieldMapping[]): Promise<void>;
  async executeImport(sessionId: string): Promise<ImportResult>;
  async getImportProgress(sessionId: string): Promise<ImportProgress>;
  async cancelImport(sessionId: string): Promise<void>;
  async scheduleReimport(sessionId: string, cronExpression: string): Promise<void>;
  async executeReimport(sessionId: string): Promise<ImportResult>;
}
```

#### 4.2.2 Field Analysis Service

```typescript
// src/services/fieldAnalysisService.ts
interface FieldAnalysis {
  detectedFields: DetectedField[];
  suggestedMappings: SuggestedMapping[];
  dataQualityReport: DataQualityReport;
  sampleData: Record<string, any>[];
}

interface DetectedField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'array';
  sampleValues: any[];
  nullCount: number;
  uniqueCount: number;
  confidence: number; // 0-1 confidence in type detection
}

interface SuggestedMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  reason: string;
  requiresTransformation: boolean;
  suggestedTransformation?: string;
}

class FieldAnalysisService {
  async analyzeFields(data: Record<string, any>[]): Promise<FieldAnalysis>;
  async suggestMappings(detectedFields: DetectedField[]): Promise<SuggestedMapping[]>;
  async validateFieldMapping(mapping: FieldMapping, sampleData: any[]): Promise<ValidationResult>;
}
```

#### 4.2.3 Deduplication Service

```typescript
// src/services/deduplicationService.ts
interface DuplicateMatch {
  existingMaterialId: string;
  confidence: number;
  matchingFields: string[];
  conflictingFields: ConflictingField[];
}

interface ConflictingField {
  fieldName: string;
  existingValue: any;
  newValue: any;
  suggestedResolution: 'keep_existing' | 'use_new' | 'merge';
}

class DeduplicationService {
  async findDuplicates(
    materialData: Record<string, any>, 
    uniqueFields: string[]
  ): Promise<DuplicateMatch[]>;
  
  async resolveDuplicates(
    materialData: Record<string, any>,
    duplicateMatch: DuplicateMatch,
    strategy: 'skip' | 'update' | 'create_new'
  ): Promise<ResolutionResult>;
}
```

### 4.3 Frontend Components

#### 4.3.1 Import Wizard Component Structure

```
src/components/import/
├── ImportWizard.tsx              # Main wizard container
├── steps/
│   ├── SourceSelection.tsx       # File/URL selection
│   ├── FileUpload.tsx           # File upload interface
│   ├── FieldMapping.tsx         # Interactive field mapping
│   ├── DeduplicationConfig.tsx  # Duplicate handling settings
│   ├── ImportPreview.tsx        # Preview before import
│   └── ImportProgress.tsx       # Real-time progress tracking
├── components/
│   ├── FieldMappingTable.tsx    # Drag-drop field mapping
│   ├── FieldTypeSelector.tsx    # Field type selection
│   ├── DataPreview.tsx          # Sample data display
│   ├── DuplicateResolver.tsx    # Conflict resolution UI
│   └── ScheduleConfig.tsx       # Cron schedule configuration
└── hooks/
    ├── useImportSession.ts      # Import session management
    ├── useFieldAnalysis.ts      # Field analysis hooks
    └── useImportProgress.ts     # Progress tracking
```

#### 4.3.2 Import Management Dashboard

```
src/components/import-management/
├── ImportDashboard.tsx          # Main dashboard
├── ImportSessionList.tsx        # List of import sessions
├── ImportSessionDetails.tsx     # Detailed session view
├── ScheduledImportsList.tsx     # Scheduled imports management
├── ImportHistory.tsx            # Historical import data
└── ImportAnalytics.tsx          # Import statistics and insights
```

### 4.4 API Endpoints

#### 4.4.1 Import Session Management

```typescript
// API Routes
POST   /api/import/sessions                    # Create new import session
GET    /api/import/sessions                    # List user's import sessions
GET    /api/import/sessions/:id                # Get specific session
PUT    /api/import/sessions/:id                # Update session configuration
DELETE /api/import/sessions/:id                # Delete session

POST   /api/import/sessions/:id/upload         # Upload file for analysis
POST   /api/import/sessions/:id/analyze        # Analyze uploaded file
POST   /api/import/sessions/:id/mappings       # Save field mappings
POST   /api/import/sessions/:id/execute        # Execute import
GET    /api/import/sessions/:id/progress       # Get import progress
POST   /api/import/sessions/:id/cancel         # Cancel import

POST   /api/import/sessions/:id/schedule       # Schedule automatic reimport
PUT    /api/import/sessions/:id/schedule       # Update schedule
DELETE /api/import/sessions/:id/schedule       # Remove schedule
POST   /api/import/sessions/:id/reimport       # Manual reimport
```

#### 4.4.2 Field Management

```typescript
GET    /api/import/field-templates              # Get field mapping templates
POST   /api/import/field-templates              # Create new template
PUT    /api/import/field-templates/:id          # Update template
DELETE /api/import/field-templates/:id          # Delete template

GET    /api/materials/metadata-fields           # Get available metadata fields
POST   /api/materials/metadata-fields           # Create new metadata field
```

#### 4.4.3 Knowledge Base Integration

```typescript
POST   /api/import/sessions/:id/knowledge-base  # Add imported materials to knowledge base
GET    /api/import/sessions/:id/embeddings      # Get embedding generation status
POST   /api/import/sessions/:id/embeddings      # Trigger embedding generation
```

## 5. Implementation Phases

### Phase 1: Core Infrastructure (Weeks 1-2)
- **Database Schema**: Implement new tables and migrations
- **Basic Import Service**: Core import session management
- **File Upload**: Basic file upload and storage
- **Field Analysis**: Basic field detection and analysis

### Phase 2: Field Mapping System (Weeks 3-4)
- **Field Mapping UI**: Interactive field mapping interface
- **AI-Powered Suggestions**: Intelligent field mapping suggestions
- **Field Creation**: Dynamic metadata field creation
- **Validation System**: Field type validation and data checking

### Phase 3: Deduplication System (Weeks 5-6)
- **Duplicate Detection**: Core deduplication logic
- **Conflict Resolution**: User interface for handling conflicts
- **Merge Strategies**: Implementation of different merge approaches
- **Testing**: Comprehensive deduplication testing

### Phase 4: Automation Features (Weeks 7-8)
- **Scheduled Imports**: Cron-based automatic importing
- **Background Processing**: Asynchronous import processing
- **Progress Tracking**: Real-time progress monitoring
- **Error Handling**: Comprehensive error management

### Phase 5: Knowledge Base Integration (Weeks 9-10)
- **RAG Integration**: Automatic embedding generation
- **Knowledge Extraction**: Enhanced knowledge base updates
- **Search Integration**: Immediate search availability
- **Relationship Mapping**: Automatic material relationships

### Phase 6: Advanced Features & Polish (Weeks 11-12)
- **Import Analytics**: Statistics and insights dashboard
- **Template System**: Reusable field mapping templates
- **Bulk Operations**: Advanced bulk import capabilities
- **Performance Optimization**: Final performance tuning

## 6. Integration Points

### 6.1 Existing Services Integration

#### 6.1.1 RAG Service Integration
- **Embedding Generation**: Automatic embedding creation for imported materials
- **Knowledge Base Updates**: Integration with `enhancedRAGService.ts`
- **Search Indexing**: Immediate availability in search systems

#### 6.1.2 Material Service Integration
- **Material Creation**: Integration with existing material creation workflows
- **Validation**: Use existing material validation logic
- **Metadata Handling**: Integration with dynamic metadata field system

#### 6.1.3 Database Integration
- **Transaction Management**: Ensure data consistency across imports
- **RLS Integration**: Respect existing row-level security policies
- **Audit Trail**: Integration with existing audit systems

### 6.2 UI/UX Integration

#### 6.2.1 Navigation Integration
- **Main Navigation**: Add import section to main navigation
- **Material Management**: Integration with existing material management UI
- **Dashboard Integration**: Import statistics in main dashboard

#### 6.2.2 Design System Integration
- **Component Library**: Use existing design system components
- **Theming**: Consistent with existing application theming
- **Responsive Design**: Mobile-friendly import interfaces

## 7. Security Considerations

### 7.1 File Security
- **File Type Validation**: Strict validation of uploaded files
- **Size Limits**: Reasonable file size restrictions
- **Virus Scanning**: Integration with file scanning services
- **Temporary Storage**: Secure handling of temporary files

### 7.2 URL Security
- **URL Validation**: Comprehensive URL validation and sanitization
- **Timeout Handling**: Reasonable timeouts for remote requests
- **Size Limits**: Maximum download size restrictions
- **SSL/TLS**: Require secure connections for remote imports

### 7.3 Data Security
- **Input Sanitization**: Comprehensive sanitization of import data
- **SQL Injection Prevention**: Parameterized queries and validation
- **XSS Prevention**: Proper output encoding and validation
- **Access Control**: Integration with existing authentication and authorization

## 8. Performance Considerations

### 8.1 Scalability
- **Batch Processing**: Efficient batch processing for large imports
- **Memory Management**: Streaming processing for large files
- **Database Optimization**: Bulk insert operations and indexing
- **Caching**: Strategic caching of field mappings and templates

### 8.2 Monitoring
- **Performance Metrics**: Comprehensive performance monitoring
- **Error Tracking**: Detailed error logging and tracking
- **Usage Analytics**: Import usage statistics and insights
- **Resource Monitoring**: CPU, memory, and database usage tracking

## 9. Testing Strategy

### 9.1 Unit Testing
- **Service Layer**: Comprehensive unit tests for all services
- **Utility Functions**: Testing of field analysis and validation functions
- **Database Operations**: Testing of database operations and migrations
- **API Endpoints**: Testing of all API endpoints

### 9.2 Integration Testing
- **End-to-End Workflows**: Complete import workflow testing
- **Database Integration**: Testing of database operations and constraints
- **External Services**: Testing of RAG and knowledge base integration
- **File Processing**: Testing with various file formats and sizes

### 9.3 Performance Testing
- **Load Testing**: Testing with large import files
- **Concurrent Users**: Testing with multiple simultaneous imports
- **Memory Usage**: Testing memory usage with large datasets
- **Database Performance**: Testing database performance under load

## 10. Deployment Strategy

### 10.1 Database Migrations
- **Migration Scripts**: Comprehensive database migration scripts
- **Rollback Plans**: Rollback procedures for each migration
- **Data Migration**: Migration of existing data if needed
- **Index Creation**: Performance index creation strategies

### 10.2 Feature Rollout
- **Feature Flags**: Gradual rollout using feature flags
- **User Groups**: Phased rollout to different user groups
- **Monitoring**: Comprehensive monitoring during rollout
- **Rollback Plans**: Quick rollback procedures if issues arise

## 11. Maintenance and Support

### 11.1 Documentation
- **User Documentation**: Comprehensive user guides and tutorials
- **API Documentation**: Complete API documentation
- **Developer Documentation**: Technical documentation for developers
- **Troubleshooting Guides**: Common issues and solutions

### 11.2 Monitoring and Alerting
- **System Health**: Monitoring of import system health
- **Error Alerts**: Automated alerts for import failures
- **Performance Monitoring**: Continuous performance monitoring
- **Usage Tracking**: Tracking of import system usage

## 12. Success Metrics

### 12.1 Functional Metrics
- **Import Success Rate**: Percentage of successful imports
- **Processing Time**: Average time for import processing
- **User Adoption**: Number of users using import functionality
- **Data Quality**: Quality of imported material data

### 12.2 Technical Metrics
- **System Performance**: Response times and throughput
- **Error Rates**: Frequency and types of errors
- **Resource Usage**: CPU, memory, and database usage
- **Availability**: System uptime and availability

## 13. Future Enhancements

### 13.1 Advanced Features
- **Machine Learning**: ML-powered field mapping and duplicate detection
- **Data Transformation**: Advanced data transformation capabilities
- **Integration APIs**: APIs for third-party system integration
- **Real-time Sync**: Real-time synchronization with external systems

### 13.2 Additional Formats
- **CSV Support**: Support for CSV file imports
- **Excel Support**: Support for Excel file imports
- **API Integration**: Direct integration with external APIs
- **Database Sync**: Direct database synchronization capabilities

---

This specification provides a comprehensive foundation for implementing the XML/JSON import functionality. The modular design allows for iterative development and testing, while the detailed technical specifications ensure proper integration with the existing system architecture.