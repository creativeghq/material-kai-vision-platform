# Future Features Roadmap

This document tracks planned features that have database tables created but are not yet implemented.

---

## 🛒 E-Commerce Features

### **Credit & Subscription System**
**Status:** Planned  
**Database Tables:**
- `credit_packages` - Available credit packages
- `credit_transactions` - Credit purchase/usage history
- `user_credits` - User credit balances
- `subscription_plans` - Available subscription tiers
- `user_subscriptions` - User subscription status

**Description:**
Monetization system with credits for AI operations and subscription tiers for premium features.

**Use Cases:**
- Pay-per-use AI analysis
- Monthly subscription plans
- Enterprise tier with unlimited access

---

### **Quote & Proposal System**
**Status:** Planned  
**Database Tables:**
- `quote_requests` - Material quote requests
- `proposals` - Project proposals
- `moodboard_quote_requests` - Moodboard-based quotes

**Description:**
Allow users to request quotes from suppliers and create project proposals.

**Use Cases:**
- Request pricing from multiple suppliers
- Generate project proposals with selected materials
- Track quote status and responses

---

## 🎨 Moodboard System

**Status:** Partially Implemented  
**Database Tables:**
- `moodboards` - Moodboard collections
- `moodboard_items` - Items in moodboards
- `moodboard_products` - Products in moodboards
- `moodboard_quote_requests` - Quote requests from moodboards

**Description:**
Visual collection system for materials and products, similar to Pinterest boards.

**Current Status:**
- Frontend UI exists
- Backend tables created
- Full integration pending

**Use Cases:**
- Create mood boards for design projects
- Share collections with clients
- Request quotes for entire moodboard

---

## 🤖 Agent & Chat Features

### **Agent Chat System**
**Status:** Planned  
**Database Tables:**
- `agent_chat_conversations` - Chat conversation threads
- `agent_chat_messages` - Individual chat messages
- `agent_uploaded_files` - Files uploaded in chat

**Description:**
Conversational AI interface for material discovery and project assistance.

**Use Cases:**
- Multi-turn conversations with AI agents
- Upload reference images in chat
- Persistent conversation history

---

### **Material Agents**
**Status:** Planned  
**Database Tables:**
- `material_agents` - Specialized AI agents for materials

**Description:**
Specialized AI agents with expertise in specific material categories or use cases.

**Use Cases:**
- Flooring specialist agent
- Sustainable materials agent
- Budget-conscious agent

---

## 📊 Advanced Analytics

### **Search Analytics**
**Status:** Partially Implemented
**Database Tables:**
- `saved_searches` - ✅ IMPLEMENTED (savedSearchesService.ts)
- `search_analytics` - ✅ IMPLEMENTED (SearchAnalyticsDashboard.tsx)
- `search_suggestions` - ✅ IMPLEMENTED (search-suggestions.md)
- `popular_searches` - ✅ IMPLEMENTED (materialized view)
- `material_demand_analytics` - ✅ IMPLEMENTED (materialized view)
- `search_query_corrections` - ❌ NOT IMPLEMENTED (documented but no code)
- `search_sessions` - ❌ NOT IMPLEMENTED (documented but no code)
- `search_suggestion_clicks` - ❌ NOT IMPLEMENTED (documented but no code)
- `trending_searches` - ❌ NOT IMPLEMENTED (documented but no code)
- `query_intelligence` - ❌ NOT IMPLEMENTED (documented but no code)

**Description:**
Comprehensive search analytics and intelligence system.

**Current Status:**
- Basic search analytics dashboard exists
- Saved searches feature implemented
- Search suggestions system implemented
- Need to implement: query corrections, session tracking, click tracking, trending searches

**Use Cases:**
- Track popular searches ✅ DONE
- Improve search suggestions ✅ DONE
- Understand user intent ❌ TODO
- Optimize search performance ❌ TODO
- Query typo correction ❌ TODO
- Session-based search tracking ❌ TODO
- Click-through rate analysis ❌ TODO
- Trending search detection ❌ TODO

**Implementation Priority:**
1. **High Priority:** `search_query_corrections` - Typo correction and query suggestions
2. **High Priority:** `trending_searches` - Real-time trending search queries
3. **Medium Priority:** `search_sessions` - Session-based search tracking
4. **Medium Priority:** `search_suggestion_clicks` - Click-through rate tracking
5. **Low Priority:** `query_intelligence` - Advanced query understanding metrics

---

### **User Behavior Analytics**
**Status:** Planned  
**Database Tables:**
- `user_behavior_profiles` - User behavior patterns
- `user_interaction_events` - User interaction tracking
- `user_preferences` - User preferences

**Description:**
Track user behavior to personalize experience and improve recommendations.

**Use Cases:**
- Personalized material recommendations
- User preference learning
- A/B testing and optimization

---

### **Recommendation Analytics**
**Status:** Planned  
**Database Tables:**
- `recommendation_analytics` - Recommendation performance tracking

**Description:**
Track recommendation quality and user engagement with recommendations.

---

## 🏢 CRM System

**Status:** Partially Implemented
**Database Tables:**
- `crm_contacts` - CRM contact records
- `crm_contact_relationships` - Contact relationships

**Description:**
Customer relationship management for suppliers and clients.

**Current Status:**
- ✅ Edge Function API exists (`crm-contacts-api`)
- ✅ Database tables created
- ❌ Frontend integration pending

**Use Cases:**
- Manage supplier contacts
- Track client relationships
- Contact history and notes

**Implementation Priority:**
- **High Priority:** Frontend UI for CRM contacts management
- **Medium Priority:** Contact relationship visualization
- **Low Priority:** Advanced CRM features (notes, history, tags)

---

## 📥 Data Import System

**Status:** Planned  
**Database Tables:**
- `data_import_jobs` - Import job tracking
- `data_import_history` - Import history
- `xml_mapping_templates` - XML data mapping templates

**Description:**
Bulk import materials from supplier catalogs (XML, CSV, etc.).

**Use Cases:**
- Import supplier catalogs
- Scheduled catalog updates
- Custom data mapping

---

## 🕷️ Web Scraping System

**Status:** Planned  
**Database Tables:**
- `scraping_sessions` - Scraping session tracking
- `scraping_pages` - Scraped page records
- `scraped_materials_temp` - Temporary scraped data

**Description:**
Automated web scraping for material data from supplier websites.

**Use Cases:**
- Scrape supplier websites
- Extract material specifications
- Keep catalog data up-to-date

---

## 🎙️ Voice Conversion

**Status:** Planned  
**Database Tables:**
- `voice_conversion_results` - Voice conversion results

**Description:**
Voice-to-text for material search and AI interactions.

**Use Cases:**
- Voice search for materials
- Voice commands for AI agents
- Accessibility features

---

## 🏗️ 3D Spatial Analysis (Spaceformer)

**Status:** Planned
**Service File:** `spaceformerAnalysisService.ts` (preserved for future integration)

**Description:**
Advanced 3D spatial reasoning for room layout optimization, material placement, and accessibility analysis.

**Features:**
- **Room Layout Suggestions:** AI-powered furniture and material placement based on 3D room scans
- **NeRF Integration:** Analyze NeRF (Neural Radiance Field) reconstructions for spatial understanding
- **Accessibility Analysis:** ADA compliance checking, barrier-free path detection, accessibility scoring
- **Traffic Flow Optimization:** Analyze movement patterns, identify bottlenecks, suggest improvements
- **Material Placement:** Recommend optimal material placement based on spatial context
- **User Preferences:** Style, budget, color, material, and lighting preferences integration

**Technical Capabilities:**
- 3D spatial feature detection (walls, windows, doors, furniture)
- Position and rotation recommendations with confidence scores
- Alternative placement suggestions
- Surface area calculations for material applications
- Clearance and weight limit validation
- Spatial constraint enforcement

**Use Cases:**
- Interior designers planning room layouts
- Accessibility consultants evaluating spaces
- Material suppliers suggesting optimal product placement
- Architects optimizing traffic flow
- Real estate staging recommendations

**Implementation Priority:** Medium (Phase 3)

**Dependencies:**
- 3D room scanning capability (NeRF or similar)
- Spatial reasoning AI models
- 3D visualization frontend
- Room dimension input system

---

## 🧠 Advanced ML Features

### **ML Model Management**
**Status:** Planned  
**Database Tables:**
- `ml_models` - ML model registry
- `ml_training_jobs` - ML training job tracking

**Description:**
Custom ML model training and management for material classification and recommendations.

---

### **Advanced Chunk Processing**
**Status:** ✅ IMPLEMENTED
**Database Tables:**
- `chunk_boundaries` - ✅ IMPLEMENTED (ChunkAnalysisService.ts)
- `chunk_classifications` - ✅ IMPLEMENTED (ChunkAnalysisService.ts)
- `chunk_quality_flags` - ✅ IMPLEMENTED (ChunkQualityDashboard.tsx)
- `chunk_validation_scores` - ✅ IMPLEMENTED (ChunkAnalysisService.ts)

**Description:**
Advanced semantic chunking with quality validation and classification.

**Current Status:**
- ✅ Chunk boundary detection implemented
- ✅ Content classification system implemented
- ✅ Quality flagging for low-quality chunks implemented
- ✅ Validation scoring system implemented
- ✅ Admin dashboard for chunk quality review implemented

---

### **Document Analysis**
**Status:** Planned  
**Database Tables:**
- `document_layout_analysis` - Layout analysis results
- `document_quality_metrics` - Document quality metrics

**Description:**
Advanced document layout analysis and quality assessment.

---

## 📋 Implementation Roadmap

### **Phase 1: Complete Existing Features (High Priority)**
1. **Search Analytics Enhancements**
   - Implement `search_query_corrections` (typo correction)
   - Implement `trending_searches` (real-time trending)
   - Implement `search_sessions` (session tracking)
   - Implement `search_suggestion_clicks` (CTR tracking)
   - Implement `query_intelligence` (advanced metrics)

2. **CRM Frontend Integration**
   - Build CRM contacts management UI
   - Implement contact relationship visualization
   - Add contact notes and history

### **Phase 2: E-Commerce Features (Medium Priority)**
3. **Credit & Subscription System**
   - Design monetization model
   - Implement credit packages
   - Build subscription tiers
   - Payment integration

4. **Quote & Proposal System**
   - Complete quote request workflow
   - Build proposal generation
   - Supplier integration

### **Phase 3: Advanced Features (Low Priority)**
5. **Data Import System**
   - XML import enhancements
   - CSV import support
   - Scheduled imports

6. **Web Scraping System**
   - Scraping infrastructure
   - Material data extraction
   - Automated updates

7. **Voice Conversion**
   - Voice-to-text for search
   - Voice commands for agents
   - Accessibility features

---

## ✅ Tables Removed (Cleanup Complete)

### **Duplicate Tables ✅ REMOVED**
- `document_vectors` - ✅ REMOVED (using `embeddings` instead)
- `enhanced_knowledge_base` - ✅ REMOVED (using `document_chunks` instead)
- `knowledge_base_entries` - ✅ REMOVED (using `document_chunks` instead)
- `knowledge_relationships` - ✅ REMOVED (not used)

### **Unused ML Tables ✅ REMOVED**
- `ml_models` - ✅ REMOVED (not needed)
- `ml_training_jobs` - ✅ REMOVED (not needed)
- `crewai_agents` - ✅ REMOVED (deprecated, using LangChain now)
- `voice_conversion_results` - ✅ REMOVED (not needed)

**Total Removed:** 8 tables
**Date:** November 13, 2025
**Database:** Reduced from 135 to 127 tables (6% reduction)

---

**Note:** All database tables are already created and ready for implementation. This allows for rapid feature development when needed.

