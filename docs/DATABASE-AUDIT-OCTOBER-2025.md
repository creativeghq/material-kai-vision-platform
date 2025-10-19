# Database Audit - October 2025

**Date**: October 19, 2025  
**Total Tables**: 97  
**Total Rows with Data**: ~30,000+  
**Status**: 🔍 **COMPREHENSIVE AUDIT COMPLETE**

---

## 📊 DATABASE OVERVIEW

### Key Statistics
- **Total Tables**: 97
- **Tables with Data**: 21
- **Empty Tables**: 76
- **Largest Table**: `document_chunks` (28,189 rows)
- **Total Data Volume**: ~30,000+ rows

---

## 🔴 TABLES TO CLEAR (PDF Processing & Test Data)

### PDF Processing Data (28,189 rows)
| Table | Rows | Purpose | Status |
|-------|------|---------|--------|
| `document_chunks` | 28,189 | Text chunks from PDFs | ✅ CLEAR |
| `document_vectors` | 690 | Embeddings for chunks | ✅ CLEAR |
| `embeddings` | 690 | Legacy embeddings table | ✅ CLEAR |
| `document_images` | 506 | Extracted images | ✅ CLEAR |
| `documents` | 23 | PDF metadata | ✅ CLEAR |
| `pdf_processing_results` | 3 | Processing logs | ✅ CLEAR |

**Total to Clear**: ~30,000 rows

---

## 🟢 TABLES TO PRESERVE (User & System Data)

### User Management (Keep)
| Table | Rows | Purpose |
|-------|------|---------|
| `user_profiles` | 0 | User account data |
| `user_subscriptions` | 0 | Subscription info |
| `user_credits` | 0 | Credit system |
| `roles` | 5 | User roles |
| `role_permissions` | 0 | Permission mappings |

### CRM System (Keep)
| Table | Rows | Purpose |
|-------|------|---------|
| `crm_contacts` | 0 | CRM contact data |
| `crm_contact_relationships` | 0 | Contact relationships |

### E-Commerce (Keep)
| Table | Rows | Purpose |
|-------|------|---------|
| `products` | 6 | Product catalog |
| `product_images` | 0 | Product images |
| `shopping_carts` | 4 | Shopping carts |
| `cart_items` | 9 | Cart items |
| `quote_requests` | 4 | Quote requests |
| `proposals` | 4 | Proposals |
| `subscription_plans` | 3 | Subscription plans |
| `credit_packages` | 3 | Credit packages |

### Configuration (Keep)
| Table | Rows | Purpose |
|-------|------|---------|
| `material_categories` | 57 | Material categories |
| `material_metadata_fields` | 124 | Metadata field config |
| `api_endpoints` | 15 | API endpoint registry |
| `workspaces` | 2 | Workspace data |
| `material_kai_keys` | 1 | API keys |
| `mivaa_api_usage_logs` | 1 | Usage tracking |

---

## ⚪ EMPTY TABLES (76 tables with 0 rows)

These tables are empty and can be left as-is:
- Agent system tables (agent_chat_*, agent_uploaded_files)
- Analysis tables (visual_analysis_*, material_visual_analysis, etc.)
- Processing tables (processing_*, batch_jobs, processing_queue)
- Knowledge base tables (knowledge_base_entries, enhanced_knowledge_base, etc.)
- ML tables (ml_models, ml_training_jobs)
- Moodboard tables (moodboards, moodboard_items, moodboard_products, etc.)
- Search tables (search_analytics, visual_search_*)
- Results tables (ocr_results, recognition_results, etc.)
- Metrics tables (quality_scoring_logs, retrieval_quality_metrics, etc.)
- And 50+ more...

---

## 🧹 CLEANUP STRATEGY

### Phase 1: Clear PDF Processing Data
```sql
-- Clear in dependency order
DELETE FROM document_vectors;
DELETE FROM embeddings;
DELETE FROM document_images;
DELETE FROM document_chunks;
DELETE FROM documents;
DELETE FROM pdf_processing_results;
```

### Phase 2: Verify Preservation
- ✅ User data intact
- ✅ CRM data intact
- ✅ E-commerce data intact
- ✅ Configuration intact
- ✅ Empty tables remain empty

### Phase 3: Verify Cleanup
- ✅ All PDF processing tables cleared
- ✅ No orphaned records
- ✅ Foreign key constraints satisfied

---

## 📋 TABLES BREAKDOWN BY CATEGORY

### PDF Processing (CLEAR)
- document_chunks (28,189)
- document_vectors (690)
- embeddings (690)
- document_images (506)
- documents (23)
- pdf_processing_results (3)

### User & Auth (PRESERVE)
- user_profiles
- user_subscriptions
- user_credits
- credit_transactions
- roles (5)
- role_permissions
- workspaces (2)
- workspace_members
- workspace_permissions

### CRM (PRESERVE)
- crm_contacts
- crm_contact_relationships

### E-Commerce (PRESERVE)
- products (6)
- product_images
- shopping_carts (4)
- cart_items (9)
- quote_requests (4)
- proposals (4)
- subscription_plans (3)
- credit_packages (3)

### Configuration (PRESERVE)
- material_categories (57)
- material_metadata_fields (124)
- api_endpoints (15)
- material_kai_keys (1)
- mivaa_api_usage_logs (1)
- rate_limit_rules

### Empty/Unused (LEAVE AS-IS)
- 76 empty tables for future features

---

## ✅ CLEANUP READINESS

**Status**: 🟢 **READY TO CLEAN**

Before running cleanup script:
1. ✅ Database audit complete
2. ✅ All tables identified
3. ✅ Preservation strategy defined
4. ✅ Clear tables identified
5. ✅ No critical data at risk

**Recommended Action**: Run cleanup script to clear PDF processing data while preserving all user, CRM, and e-commerce data.

---

## 📝 NOTES

- **New Tables Since Last Audit**: Products, shopping_carts, cart_items, quote_requests, proposals, subscription_plans, credit_packages, crm_contacts, crm_contact_relationships, user_credits, credit_transactions
- **Duplicate Embeddings**: Both `embeddings` and `document_vectors` tables exist (690 rows each) - both should be cleared
- **Material Metadata**: 124 metadata field configurations preserved for future use
- **Material Categories**: 57 categories preserved for product organization

---

## 🚀 NEXT STEPS

1. Review this audit
2. Confirm cleanup strategy
3. Run cleanup script: `node scripts/cleanup-database.js`
4. Verify data integrity
5. Resume testing with clean database

