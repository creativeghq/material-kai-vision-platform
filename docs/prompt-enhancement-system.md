# Prompt Enhancement System

## Overview

The **Prompt Enhancement System** transforms simple agent prompts (e.g., "Search for Nova") into detailed, comprehensive extraction prompts using admin-configured templates and contextual enrichment.

This system enables:
- **Admin Control**: Customize extraction prompts through admin panel
- **Agent Simplicity**: Agents send simple requests, backend handles complexity
- **Quality Assurance**: Consistent, high-quality extraction across all documents
- **Flexibility**: Easy to update prompts without code changes

---

## Architecture

┌─────────────────┐
│  Agent Request  │  "Search for Nova"
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  PromptEnhancementService               │
│  1. Parse agent intent                  │
│  2. Load admin template from database   │
│  3. Add workspace context               │
│  4. Build enhanced prompt               │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Enhanced Prompt                        │
│  "Analyze this PDF catalog and         │
│   identify ALL products...              │
│   SPECIAL: Focus on finding 'Nova'...  │
│   [Full detailed instructions]"         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Claude/GPT AI  │  Processes with full context
└─────────────────┘

---

## How It Works

### 1. Agent Sends Simple Prompt

Agent requests are intentionally simple, such as:
- "extract products"
- "search for NOVA"
- "find certificates"
- "get all logos"

### 2. System Enhances Prompt

The `PromptEnhancementService` enhances the prompt by:

1. **Parsing Intent**: Understands what the agent wants
   - "search for NOVA" → Find specific product named "NOVA"
   - "extract products" → Extract all products comprehensively

2. **Loading Admin Template**: Retrieves custom prompt from database
   - Stage: `discovery`
   - Category: `products`
   - Workspace: User's workspace ID

3. **Adding Context**: Enriches with workspace settings
   - Quality thresholds
   - Document metadata
   - Previous extraction results

4. **Building Final Prompt**: Combines everything
   - Admin template (detailed instructions)
   - Agent intent (specific focus)
   - Workspace context (quality requirements)
   - PDF content (actual data to analyze)

### 3. AI Processes Enhanced Prompt

Claude/GPT receives the full, detailed prompt and returns comprehensive results.

---

## Admin Prompt Management

### Database Schema

**Table: `prompts`** (Unified table for all AI prompts)

The table stores the following fields: id, workspace_id, prompt_type (e.g., 'extraction', 'agent'), stage (e.g., 'discovery', 'chunking', 'image_analysis', 'entity_creation'), category (e.g., 'products', 'certificates', 'logos', 'specifications'), name, prompt_text (the actual prompt template), system_prompt (optional), description, quality_threshold (default 0.7), is_active (default true), is_custom (default false), version (default 1), created_at, updated_at, created_by, and updated_by.

### Default Prompts

Default prompts are seeded using a seed script located at `cd mivaa-pdf-extractor` then running `python scripts/seed_default_prompts.py`.

**Default Prompts Include:**
- `discovery/products` - Comprehensive product extraction
- `discovery/certificates` - Certificate and compliance discovery
- `discovery/logos` - Logo and brand mark identification
- `discovery/specifications` - Technical specification extraction

### Customizing Prompts

**Via Admin API:**

The admin API provides endpoints to get the current prompt for a given stage and category, update a prompt with a new template, quality threshold, and description, and view the version history for a prompt.

**Via Admin Panel:**
1. Navigate to Admin → Extraction Prompts
2. Select stage and category
3. Edit template in rich text editor
4. Test prompt before saving
5. Save and version automatically increments

---

## Example: "Search for Nova"

### Enhancement Process

**Step 1: Parse Intent** — The system identifies the action as "search", the target as "NOVA", the category as "products", and the specificity as "high".

**Step 2: Load Admin Template** — The full admin template is retrieved from the database, containing detailed instructions for analyzing the PDF catalog and identifying all products with complete metadata.

**Step 3: Add Context** — Workspace settings such as quality threshold and preferred models are combined with document context such as total page count and PDF preview text.

**Step 4: Build Enhanced Prompt** — The final prompt combines the user request, the full admin template instructions, special handling directives to prioritize finding the named product, the required JSON output format, and the PDF content.

---

## API Integration

### Upload with Agent Prompt

Send a multipart form upload to `POST /api/rag/documents/upload` including the PDF file, categories (e.g., "products"), agent_prompt (e.g., "search for NOVA"), enable_prompt_enhancement set to true, and workspace_id.

### Response

The response includes a job_id, document_id, processing status, a status URL for polling, the categories being extracted, the discovery model being used, and a flag confirming prompt enhancement is enabled.

---

## Benefits

### For Admins
✅ **Full Control**: Customize extraction prompts without code changes
✅ **Version History**: Track all prompt changes with audit trail
✅ **Quality Tuning**: Adjust quality thresholds per category
✅ **Testing**: Test prompts before deploying to production

### For Agents
✅ **Simplicity**: Send simple requests like "search for Nova"
✅ **Consistency**: Always get high-quality, detailed results
✅ **Flexibility**: No need to know extraction details

### For System
✅ **Maintainability**: Update prompts without code deployment
✅ **Scalability**: Easy to add new categories and stages
✅ **Quality**: Consistent extraction across all documents
✅ **Auditability**: Full history of prompt changes

---

## Best Practices

### Writing Good Prompts

1. **Be Specific**: Clearly define what to extract
2. **Provide Examples**: Show expected output format
3. **Set Quality Bars**: Define minimum confidence scores
4. **Handle Edge Cases**: Account for variations in documents
5. **Use Structured Output**: Request JSON for easy parsing

### Monitoring Performance

- Track confidence scores per prompt version
- Monitor extraction accuracy
- Review failed extractions
- Iterate on prompts based on results

---

## Future Enhancements

The following enhancements are planned for future releases:

- **A/B Testing for Prompts**: Test multiple prompt variations to optimize extraction quality
- **Auto-Optimization**: Automatically improve prompts based on extraction results and feedback
- **Multi-Language Support**: Support for prompts in multiple languages for international documents
- **Prompt Templates Marketplace**: Community-driven marketplace for sharing and discovering prompt templates
- **AI-Assisted Prompt Generation**: Use AI to automatically generate and refine extraction prompts
