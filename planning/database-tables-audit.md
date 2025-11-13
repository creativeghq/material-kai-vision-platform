# Database Tables Audit

## Summary

**Total Tables:** 135  
**Actively Used:** ~40-50 tables  
**Potentially Unused:** ~85-95 tables  

---

## ✅ CORE TABLES (ACTIVELY USED - KEEP)

### **PDF Processing & Knowledge Base**
- `documents` - PDF metadata
- `document_chunks` - Semantic text chunks
- `document_images` - Extracted images
- `embeddings` - Text and image embeddings
- `products` - Extracted products
- `background_jobs` - Processing jobs
- `job_progress` - Job progress tracking
- `job_checkpoints` - Checkpoint recovery
- `processed_documents` - Processed document records

### **User & Authentication**
- `user_profiles` - User profile information
- `workspaces` - Workspace/tenant data
- `workspace_members` - Workspace membership
- `api_keys` - API authentication keys
- `api_usage_logs` - API usage tracking

### **Materials & Catalog**
- `materials_catalog` - Materials catalog entries
- `material_visual_analysis` - Visual analysis results

### **Processing & Quality**
- `processing_results` - Processing results
- `quality_metrics_daily` - Daily quality metrics
- `quality_scoring_logs` - Quality scoring logs

### **Analytics & Tasks**
- `analytics_events` - Analytics events
- `agent_tasks` - Agent task records

### **3D Generation**
- `generation_3d` - 3D generation history

### **Monitoring**
- `ai_call_logs` - AI API call tracking
- `mivaa_api_usage_logs` - MIVAA API usage

---

## ❓ POTENTIALLY UNUSED TABLES (NEED VERIFICATION)

### **Category 1: Duplicate/Legacy Processing Tables**
These tables may be duplicates or legacy versions:
- `processing_jobs` (vs `background_jobs`)
- `processing_queue` (vs `background_jobs`)
- `batch_jobs` (vs `background_jobs`)
- `pdf_processing_results` (vs `processed_documents`)
- `document_processing_status` (vs `background_jobs`)

### **Category 2: Unused Feature Tables**
Tables for features that may not be implemented:
- `crewai_agents` - CrewAI integration (deprecated?)
- `ml_models` - ML model management
- `ml_training_jobs` - ML training
- `voice_conversion_results` - Voice conversion
- `cart_items` - Shopping cart
- `shopping_carts` - Shopping cart
- `credit_packages` - Credit system
- `credit_transactions` - Credit system
- `user_credits` - Credit system
- `subscription_plans` - Subscription system
- `user_subscriptions` - Subscription system
- `proposals` - Proposal system
- `quote_requests` - Quote system
- `moodboard_quote_requests` - Moodboard quotes

### **Category 3: Advanced Features (May Not Be Used)**
- `chunk_boundaries` - Chunk boundary detection
- `chunk_classifications` - Chunk classification
- `chunk_quality_flags` - Chunk quality flags
- `chunk_validation_scores` - Chunk validation
- `document_layout_analysis` - Layout analysis
- `document_quality_metrics` - Quality metrics
- `document_vectors` - Document vectors (vs `embeddings`)
- `enhanced_knowledge_base` - Enhanced KB
- `knowledge_base_entries` - KB entries (vs `document_chunks`)
- `knowledge_relationships` - KB relationships

### **Category 4: Extraction & Validation**
- `category_extractions` - Category extraction
- `category_validation_rules` - Category validation
- `extraction_config` - Extraction config
- `extraction_prompt_history` - Prompt history
- `extraction_prompts` - Extraction prompts
- `validation_results` - Validation results
- `validation_rules` - Validation rules

### **Category 5: Image Processing**
- `image_processing_queue` - Image queue
- `image_product_associations` - Image-product links (vs `product_image_relationships`)
- `image_validations` - Image validation
- `claude_validation_queue` - Claude validation queue
- `ocr_results` - OCR results

### **Category 6: Product Management**
- `product_document_relationships` - Product-document links
- `product_enrichments` - Product enrichments
- `product_merge_history` - Product merge history
- `product_similarity_cache` - Product similarity cache

### **Category 7: Search & Analytics**
- `saved_searches` - Saved searches
- `search_analytics` - Search analytics
- `search_query_corrections` - Query corrections
- `search_sessions` - Search sessions
- `search_suggestion_clicks` - Suggestion clicks
- `search_suggestions` - Search suggestions
- `trending_searches` - Trending searches
- `query_intelligence` - Query intelligence
- `recommendation_analytics` - Recommendation analytics
- `response_quality_metrics` - Response quality
- `retrieval_quality_metrics` - Retrieval quality

### **Category 8: User Behavior**
- `user_behavior_profiles` - User behavior
- `user_interaction_events` - User interactions
- `user_preferences` - User preferences

### **Category 9: Admin & System**
- `admin_prompts` - Admin prompts
- `admin_search_prompts` - Admin search prompts
- `api_endpoints` - API endpoints registry
- `health_check` - Health check
- `internal_networks` - Internal networks
- `jwt_tokens_log` - JWT tokens log
- `performance_alerts` - Performance alerts
- `performance_reports` - Performance reports
- `rate_limit_rules` - Rate limiting
- `system_performance_metrics` - System metrics

### **Category 10: Agent & Chat**
- `agent_chat_conversations` - Agent conversations
- `agent_chat_messages` - Agent messages
- `agent_uploaded_files` - Agent files
- `material_agents` - Material agents

### **Category 11: Moodboard**
- `moodboard_items` - Moodboard items
- `moodboard_products` - Moodboard products
- `moodboards` - Moodboards

### **Category 12: CRM**
- `crm_contact_relationships` - CRM relationships
- `crm_contacts` - CRM contacts

### **Category 13: Data Import**
- `data_import_history` - Import history
- `data_import_jobs` - Import jobs
- `xml_mapping_templates` - XML mapping

### **Category 14: Scraping**
- `scraped_materials_temp` - Scraped materials
- `scraping_pages` - Scraping pages
- `scraping_sessions` - Scraping sessions

### **Category 15: Misc**
- `ai_analysis_queue` - AI analysis queue
- `duplicate_detection_cache` - Duplicate detection
- `embedding_stability_metrics` - Embedding stability
- `material_categories` - Material categories
- `material_images` - Material images (vs `document_images`)
- `material_kai_keys` - Material KAI keys
- `material_knowledge_extraction` - Material extraction
- `material_metadata_fields` - Material metadata
- `material_properties` - Material properties
- `pdf_integration_health_results` - PDF health
- `product_images` - Product images (vs `document_images`)
- `role_permissions` - Role permissions
- `roles` - Roles
- `uploaded_files` - Uploaded files
- `workspace_permissions` - Workspace permissions

---

## 🎯 RECOMMENDED ACTIONS

### **Phase 1: Identify Unused Tables**
Run queries to check row counts and last updated timestamps for all tables.

### **Phase 2: Verify Usage**
Search codebase for references to potentially unused tables.

### **Phase 3: Safe Removal**
1. Backup database
2. Drop unused tables
3. Monitor for errors
4. Document removed tables

---

**Next Steps:** Need to query each table for row counts and check codebase references to confirm which tables are truly unused.

