# Prompt-Based Extraction Architecture

## Overview

All extraction services in the Material Kai Vision Platform follow a **prompt-based architecture** where extraction logic is controlled by AI prompts stored in the database, not hardcoded in services.

This document describes the standardized approach for building extraction services.

---

## Architecture Principles

### 1. Database-Driven Prompts

All extraction prompts are stored in the `prompts` table with:
- `prompt_type` = 'extraction'
- `stage` = extraction stage (discovery, entity_creation, image_analysis, etc.)
- `category` = what to extract (products, factory_documents, icon_metadata, etc.)
- `prompt_text` = detailed AI instructions (2000-10000 chars)
- `workspace_id` = workspace for custom prompts
- `is_active` = true/false
- `version` = version number for tracking changes

### 2. AI-Powered Extraction

Services use AI (Claude/GPT) to interpret data and extract information:
- Load prompt from database
- Pass data to AI with prompt
- Parse structured JSON response
- Store results with confidence scores

### 3. No Hardcoded Logic

The correct approach is to load prompts from the database and use AI to interpret data, rather than embedding hardcoded regex patterns or logic directly in the service code.

---

## Current Extraction Prompts

### 1. Product Discovery
- **Stage:** `discovery`
- **Category:** `products`
- **Name:** Discovery - Products
- **Purpose:** Identify products in PDF catalogs with variants, colors, packaging

### 2. Product Entity Creation
- **Stage:** `entity_creation`
- **Category:** `products`
- **Name:** Product Entity Creation
- **Purpose:** Create structured product entities from discovered data

### 3. Material Properties
- **Stage:** `entity_creation`
- **Category:** `material_properties`
- **Name:** Material Properties Extraction
- **Purpose:** Extract technical specifications and material properties

### 4. Factory Documents
- **Stage:** `entity_creation`
- **Category:** `factory_documents`
- **Name:** Factory Document Extraction
- **Purpose:** Extract factory-level documents (regulations, cleaning, installation, warranty)

### 5. Factory Metadata
- **Stage:** `entity_creation`
- **Category:** `factory_metadata`
- **Name:** Factory Metadata Extraction
- **Purpose:** Extract global factory info (country, certifications, standards)

### 6. Icon Metadata
- **Stage:** `image_analysis`
- **Category:** `icon_metadata`
- **Name:** Icon-Based Metadata Extraction
- **Purpose:** Extract technical specs from icons (R11, A1, CE, PEI ratings)

### 7. Product Image Analysis
- **Stage:** `image_analysis`
- **Category:** `products`
- **Name:** Product Image Analysis
- **Purpose:** Analyze product images for visual characteristics

---

## How to Build a New Extraction Service

### Step 1: Create Database Prompt

Insert a new record into the `prompts` table specifying the workspace ID, prompt type (`extraction`), stage, category, name, detailed AI instructions, status (`active`), active flag, and version number.

### Step 2: Create Service Class

Create a service class that loads the prompt from the database on initialization, then calls the AI model with the combined prompt and data. Parse the structured JSON response returned by the AI.

### Step 3: Integrate into Pipeline

Add service call to appropriate PDF processing stage.

---

## Benefits

1. **Flexibility:** Change extraction logic by updating prompts, no code changes
2. **Versioning:** Track prompt changes with version numbers
3. **Customization:** Workspace-specific prompts for different use cases
4. **Consistency:** All services follow same pattern
5. **Maintainability:** No scattered hardcoded logic
6. **Testability:** Easy to test with different prompts

---

## Admin Management

Prompts can be managed through:
- `/admin/ai-configs` - Extraction prompts tab
- Direct database updates
- API endpoints (future)

All changes are tracked in `prompt_history` table.
