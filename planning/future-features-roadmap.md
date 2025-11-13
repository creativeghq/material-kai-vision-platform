# Future Features Roadmap

This document tracks planned features that have database tables created but are not yet implemented.

---

## 🛒 E-Commerce Features

### **Shopping Cart System**
**Status:** Planned  
**Database Tables:**
- `cart_items` - Shopping cart items
- `shopping_carts` - Shopping cart sessions

**Description:**
Allow users to add materials/products to a shopping cart for bulk ordering or quote requests.

**Use Cases:**
- Interior designers collecting materials for a project
- Bulk material ordering
- Quote request preparation

---

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
**Status:** Planned  
**Database Tables:**
- `saved_searches` - User saved searches
- `search_analytics` - Search performance metrics
- `search_query_corrections` - Query correction tracking
- `search_sessions` - Search session tracking
- `search_suggestion_clicks` - Suggestion click tracking
- `search_suggestions` - Search suggestions
- `trending_searches` - Trending search queries
- `query_intelligence` - Query understanding metrics

**Description:**
Comprehensive search analytics and intelligence system.

**Use Cases:**
- Track popular searches
- Improve search suggestions
- Understand user intent
- Optimize search performance

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
- Edge Function API exists (`crm-contacts-api`)
- Database tables created
- Frontend integration pending

**Use Cases:**
- Manage supplier contacts
- Track client relationships
- Contact history and notes

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
**Status:** Planned  
**Database Tables:**
- `chunk_boundaries` - Chunk boundary detection
- `chunk_classifications` - Chunk classification
- `chunk_quality_flags` - Chunk quality flags
- `chunk_validation_scores` - Chunk validation scores

**Description:**
Advanced semantic chunking with quality validation and classification.

---

### **Document Analysis**
**Status:** Planned  
**Database Tables:**
- `document_layout_analysis` - Layout analysis results
- `document_quality_metrics` - Document quality metrics

**Description:**
Advanced document layout analysis and quality assessment.

---

## 📋 Next Steps

1. **Prioritize features** based on user demand
2. **Create detailed specs** for each feature
3. **Implement incrementally** starting with highest priority
4. **Test thoroughly** before production release

---

**Note:** All database tables are already created and ready for implementation. This allows for rapid feature development when needed.

