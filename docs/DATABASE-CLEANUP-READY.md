# Database Cleanup - Ready to Execute

**Date**: October 19, 2025  
**Status**: 🟢 **READY TO CLEAN**  
**Audit Complete**: YES  
**Script Updated**: YES

---

## 📊 COMPREHENSIVE AUDIT RESULTS

### Database Overview
- **Total Tables**: 97
- **Tables with Data**: 21
- **Empty Tables**: 76
- **Total Rows**: ~30,000+
- **Largest Table**: `document_chunks` (28,189 rows)

### Data Breakdown
| Category | Rows | Action |
|----------|------|--------|
| PDF Processing | ~30,000 | 🗑️ CLEAR |
| User/Auth | 0 | 🟢 KEEP |
| CRM | 0 | 🟢 KEEP |
| E-Commerce | 30 | 🟢 KEEP |
| Configuration | 198 | 🟢 KEEP |
| Empty Tables | 0 | ⚪ LEAVE |

---

## 🟢 TABLES TO PRESERVE (31 tables)

### Workspace & Auth (6)
- workspaces (2 rows)
- workspace_members
- workspace_permissions
- api_keys
- material_kai_keys (1 row)
- rate_limit_rules

### User Management (6)
- user_profiles
- user_subscriptions
- user_credits
- credit_transactions
- roles (5 rows)
- role_permissions

### CRM System (2)
- crm_contacts
- crm_contact_relationships

### E-Commerce (8)
- products (6 rows)
- product_images
- shopping_carts (4 rows)
- cart_items (9 rows)
- quote_requests (4 rows)
- proposals (4 rows)
- subscription_plans (3 rows)
- credit_packages (3 rows)

### Configuration (3)
- material_categories (57 rows)
- material_metadata_fields (124 rows)
- api_endpoints (15 rows)

### AI/ML (6)
- ml_models
- crewai_agents
- material_agents
- internal_networks
- category_validation_rules
- (+ 1 mivaa_api_usage_logs with 1 row)

---

## 🗑️ TABLES TO CLEAR (66 tables)

### PDF Processing (6 tables - 30,000+ rows)
- documents (23 rows)
- document_chunks (28,189 rows) ⭐ LARGEST
- document_embeddings
- document_images (506 rows)
- document_vectors (690 rows)
- embeddings (690 rows)
- pdf_processing_results (3 rows)

### Document Analysis (5)
- document_layout_analysis
- document_processing_status
- document_quality_metrics
- processed_documents
- uploaded_files

### Processing & Jobs (4)
- processing_jobs
- processing_queue
- processing_results
- processing_metrics
- batch_jobs
- category_extractions

### Knowledge Base (4)
- knowledge_base_entries
- knowledge_relationships
- enhanced_knowledge_base
- material_knowledge_extraction
- query_intelligence

### Materials & Analysis (10)
- materials_catalog
- material_properties
- material_images
- material_style_analysis
- material_visual_analysis
- scraped_materials_temp
- recognition_results
- property_analysis_results
- style_analysis_results
- spaceformer_analysis_results
- svbrdf_extraction_results
- hybrid_analysis_results

### Media & OCR (2)
- voice_conversion_results
- ocr_results

### Visual Search (5)
- visual_search_embeddings
- visual_search_queries
- visual_search_batch_jobs
- visual_search_analysis
- visual_analysis_queue

### ML & Training (1)
- ml_training_jobs

### Moodboards & Scraping (6)
- moodboards
- moodboard_items
- moodboard_products
- moodboard_quote_requests
- scraping_sessions
- scraping_pages

### Generation & 3D (1)
- generation_3d

### Logging & Analytics (9)
- analytics_events
- api_usage_logs
- jwt_tokens_log
- search_analytics
- quality_scoring_logs
- response_quality_metrics
- retrieval_quality_metrics
- embedding_stability_metrics
- health_check
- pdf_integration_health_results

### Agent System (3)
- agent_chat_conversations
- agent_chat_messages
- agent_uploaded_files

---

## ✅ CLEANUP SCRIPT STATUS

**File**: `scripts/database/cleanup-database.js`

### Recent Updates
✅ Added 8 new tables to KEEP list:
- user_profiles, user_subscriptions, user_credits, credit_transactions
- crm_contacts, crm_contact_relationships
- products, product_images, shopping_carts, cart_items
- quote_requests, proposals, subscription_plans, credit_packages

✅ Added 4 new tables to CLEAR list:
- moodboard_products, moodboard_quote_requests
- agent_chat_conversations, agent_chat_messages, agent_uploaded_files
- batch_jobs, category_extractions

✅ Organized tables by category for clarity

### Script Features
- ✅ Preserves 31 critical tables
- ✅ Clears 66 test/processing tables
- ✅ Handles storage cleanup
- ✅ Generates detailed results report
- ✅ Error handling and logging

---

## 🚀 EXECUTION INSTRUCTIONS

### Before Running
1. ✅ Review audit: `docs/DATABASE-AUDIT-OCTOBER-2025.md`
2. ✅ Verify preservation list above
3. ✅ Confirm you want to delete ~30,000 rows
4. ✅ Ensure environment variables are set

### Run Cleanup
```bash
# Set environment variables
export SUPABASE_URL=https://bgbavxtjlbvgplozizxu.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Run cleanup script
node scripts/database/cleanup-database.js
```

### After Cleanup
1. ✅ Review results file: `cleanup-results-[timestamp].json`
2. ✅ Verify all PDF processing data cleared
3. ✅ Verify user/CRM/e-commerce data preserved
4. ✅ Resume testing with clean database

---

## 📋 WHAT WILL BE DELETED

### Data Volume
- **Total Rows**: ~30,000
- **Largest**: document_chunks (28,189 rows)
- **Storage**: All files in storage buckets

### Preserved Data
- **User Accounts**: ✅ SAFE
- **CRM Contacts**: ✅ SAFE
- **Products**: ✅ SAFE (6 products)
- **Shopping Carts**: ✅ SAFE (4 carts)
- **Configuration**: ✅ SAFE (181 rows)

---

## ⚠️ IMPORTANT NOTES

1. **Backup First**: Consider backing up database before cleanup
2. **Service Role Key**: Script requires SUPABASE_SERVICE_ROLE_KEY
3. **Storage Cleanup**: All files in storage buckets will be deleted
4. **Irreversible**: Deleted data cannot be recovered
5. **Test Data Only**: Only test/processing data is deleted

---

## 🎯 NEXT STEPS

1. **Review** this document and the audit
2. **Confirm** you're ready to delete ~30,000 rows
3. **Execute** cleanup script
4. **Verify** results
5. **Resume** testing with clean database

---

## 📝 GIT COMMITS

```
e6563a8 - docs: Add comprehensive database audit - October 2025 (97 tables, 30k+ rows)
7848681 - refactor: Update cleanup script to preserve new user/CRM/e-commerce tables
```

---

**Status**: 🟢 **READY TO EXECUTE**

All preparations complete. Database is ready for cleanup!

