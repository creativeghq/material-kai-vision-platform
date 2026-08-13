/**
 * Workflow registry — single source of truth for every multi-step workflow
 * the agent can drive. Used by:
 *   - WorkflowTracker  → resolve step metadata when a chunk arrives
 *   - CommandPalette   → list available workflows + launch a fresh one
 *   - WorkflowInlineForm → render input forms when a step asks for user input
 *
 * Adding a new workflow:
 *   1. Append a new WorkflowDefinition to WORKFLOWS below.
 *   2. Update the agent (prompt + tools) to emit workflow_plan / step_progress
 *      chunks for each step.
 *   3. Optional: add starter examples for the command palette.
 */
import type { WorkflowDefinition } from './types';

const CATALOG_BUILD: WorkflowDefinition = {
  id: 'catalog-build',
  name: 'Build a catalog',
  description: 'Upload manufacturer PDFs → extract sections via Vision → generate PDF → publish behind email-gate → send to CRM categories.',
  icon: 'BookOpen',
  moduleSlug: 'presentation-catalogs',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'Build a complete catalog from these source PDFs: <pdf_id_1>, <pdf_id_2>. Pull all white porcelain tiles, generate the PDF, then publish.',
    'Start a new catalog called "Spring 2026 — Porcelain Range" for Vasilis Imports.',
  ],
  steps: [
    { id: 'create',     order: 1, title: 'Create catalog',  icon: 'Plus',          tool_id: 'create_catalog',
      description: 'Initialize a draft catalog row + cover/back data.',
      awaits_user_input: true,
      input_schema: [
        { name: 'title',       label: 'Catalog title', required: true, placeholder: 'Spring 2026 — Porcelain Range' },
        { name: 'subtitle',    label: 'Subtitle (optional)', placeholder: 'Curated for Vasilis Imports' },
        { name: 'client_name', label: 'Client name (cover)',   placeholder: 'Vasilis Imports' },
      ],
    },
    { id: 'attach',     order: 2, title: 'Attach source PDFs', icon: 'FileText', tool_id: 'attach_catalog_pdfs',
      description: 'Link manufacturer PDFs uploaded at /catalogs/sources.',
      awaits_user_input: true,
      input_schema: [
        { name: 'source_pdf_ids', label: 'Source PDFs', type: 'pdf_picker', source: 'catalog_source_pdfs', required: true,
          hint: 'Pick one or more PDFs you uploaded earlier. Skip this step if you want a manual-build catalog.' },
      ],
    },
    { id: 'extract',    order: 3, title: 'Extract sections', icon: 'Sparkles', tool_id: 'extract_from_catalog_pdfs',
      description: 'Free-form Vision query over attached PDFs. Returns approval cards inline.',
      skippable: true,
    },
    { id: 'add_extra',  order: 4, title: 'Add extra materials', icon: 'Plus', tool_id: 'add_material_to_catalog',
      description: 'Add materials not in the source PDFs (existing catalog products, manual entries, price-monitoring lookups).',
      skippable: true,
    },
    { id: 'images',     order: 5, title: 'Find missing images', icon: 'ImageIcon', tool_id: 'find_image_for_material',
      description: 'For materials without images, search platform DB then web. Approve inline.',
      skippable: true, conditional: true,
    },
    { id: 'generate',   order: 6, title: 'Generate PDF', icon: 'FileDown', tool_id: 'generate_catalog_pdf',
      description: 'Render the catalog as an A4 PDF using the workspace-branded design (same as quotes).',
      awaits_user_input: true,
      input_schema: [
        { name: 'layout', label: 'Layout', type: 'select', defaultValue: 'list',
          hint: 'How materials are laid out in the PDF.',
          options: [
            { value: 'list', label: 'List / Table', description: 'Compact quote-style table with columns (best for offers & proformas).' },
            { value: 'grid', label: 'Grid / Cards', description: 'Large image card per material (best for visual presentation).' },
          ],
        },
        { name: 'proforma', label: 'Add totals (Προσφορά / offer)', type: 'checkbox', defaultValue: false,
          hint: 'Adds a subtotal → VAT → final block, computed from material prices. Shown only when materials are priced.' },
      ],
    },
    { id: 'publish',    order: 7, title: 'Publish', icon: 'Globe', tool_id: 'publish_catalog',
      description: 'Mint a public slug. Visitors land on the email-gated /c/<slug> page.',
      awaits_user_input: true,
      input_schema: [
        { name: 'desired_slug', label: 'Public slug (optional)', placeholder: 'spring-2026-porcelain',
          hint: 'Leave blank to auto-generate from the title. Becomes app.materialshub.gr/c/<slug>.' },
      ],
    },
    { id: 'send',       order: 8, title: 'Send to customers', icon: 'Send', tool_id: 'catalog-send-to-customers',
      description: 'Pick CRM categories → email each recipient with the catalog link.',
      skippable: true, awaits_user_input: true,
      input_schema: [
        { name: 'category_ids', label: 'Send to categories', type: 'category_picker', source: 'crm_categories', required: true },
        { name: 'subject',      label: 'Email subject', defaultValue: '' },
        { name: 'message_body', label: 'Personal message (optional)', type: 'textarea' },
      ],
    },
  ],
};

const CATALOG_TRANSLATE: WorkflowDefinition = {
  id: 'catalog-translate',
  name: 'Translate a PDF into a catalog',
  description: 'Mirror an uploaded manufacturer PDF as a brand-new catalog in one Vision pass.',
  icon: 'BookOpen',
  moduleSlug: 'presentation-catalogs',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'Translate one of my uploaded source PDFs into a brand-new catalog.',
  ],
  steps: [
    {
      id: 'translate',
      order: 1,
      title: 'Translate PDF',
      icon: 'BookOpen',
      tool_id: 'translate_pdf_to_catalog',
      description: 'Pick the source PDF, give the new catalog a title, and choose how to structure it.',
      awaits_user_input: true,
      input_schema: [
        {
          name: 'source_pdf_id', label: 'Source PDF', type: 'pdf_picker', source: 'catalog_source_pdfs',
          required: true, multi: false,
          hint: 'Pick a PDF you uploaded at /catalogs/sources. If the list is empty, upload one there first.',
        },
        {
          name: 'new_catalog_title', label: 'New catalog title', required: true,
          placeholder: 'e.g. "Spring 2026 Range — translated"',
        },
        {
          name: 'preserve_original_layout', label: 'Mirror page-by-page (slower, exact)',
          type: 'checkbox',
          hint: 'Off (default) restructures into clean category sections. On mirrors the manufacturer PDF page by page.',
          defaultValue: false,
        },
      ],
    },
    {
      id: 'review',
      order: 2,
      title: 'Generate PDF',
      icon: 'FileDown',
      tool_id: 'generate_catalog_pdf',
      description: 'Render the translated catalog as a PDF using the default template.',
    },
    {
      id: 'publish',
      order: 3,
      title: 'Publish (optional)',
      icon: 'Globe',
      tool_id: 'publish_catalog',
      description: 'Mint a public slug so visitors land on the email-gated page.',
      skippable: true,
      awaits_user_input: true,
      input_schema: [
        { name: 'desired_slug', label: 'Public slug (optional)', placeholder: 'spring-2026-translated',
          hint: 'Leave blank to auto-generate from the title. Becomes app.materialshub.gr/c/<slug>.' },
      ],
    },
  ],
};

const CATALOG_RESUME: WorkflowDefinition = {
  id: 'catalog-resume',
  name: 'Resume a draft catalog',
  description: 'Pick a draft catalog and continue building it.',
  icon: 'PencilLine',
  moduleSlug: 'presentation-catalogs',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'List my draft catalogs and let me pick one to continue.',
  ],
  steps: [
    {
      id: 'pick',
      order: 1,
      title: 'Pick draft',
      icon: 'PencilLine',
      tool_id: 'extract_from_catalog_pdfs', // any catalog tool — context routing on the agent side
      awaits_user_input: true,
      input_schema: [
        {
          name: 'catalog_id', label: 'Draft catalog', type: 'catalog_picker', source: 'presentation_catalogs',
          required: true, multi: false, status_filter: ['draft', 'ready', 'failed'],
          hint: 'Pick the catalog you want to keep working on.',
        },
        {
          name: 'next_action', label: 'What do you want to do?', type: 'select',
          required: true, defaultValue: 'extract_more',
          options: [
            { value: 'extract_more',     label: 'Extract more sections from PDFs' },
            { value: 'add_material',     label: 'Add a single material manually' },
            { value: 'find_image',       label: 'Find missing images' },
            { value: 'generate_pdf',     label: 'Re-generate the PDF' },
            { value: 'open_admin',       label: 'Open the admin builder UI' },
          ],
        },
      ],
    },
  ],
};

const CATALOG_SEND: WorkflowDefinition = {
  id: 'catalog-send',
  name: 'Send a catalog to customers',
  description: 'Pick a published catalog + CRM categories → email recipients.',
  icon: 'Send',
  moduleSlug: 'presentation-catalogs',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'Send a published catalog to selected CRM categories.',
  ],
  steps: [
    {
      id: 'pick_send',
      order: 1,
      title: 'Pick catalog + recipients',
      icon: 'Send',
      tool_id: 'catalog-send-to-customers',
      awaits_user_input: true,
      input_schema: [
        {
          name: 'catalog_id', label: 'Catalog', type: 'catalog_picker', source: 'presentation_catalogs',
          required: true, multi: false, status_filter: ['published'],
          hint: 'Only published catalogs can be sent.',
        },
        {
          name: 'category_ids', label: 'Send to which CRM categories?', type: 'category_picker',
          source: 'crm_categories', required: true, multi: true,
          hint: 'Manage at /crm?tab=categories. Recipients are the unique emails across all selected lists.',
        },
        { name: 'subject',      label: 'Subject (optional)' },
        { name: 'message_body', label: 'Personal note (optional)', type: 'textarea' },
      ],
    },
  ],
};

const SEO_ARTICLE: WorkflowDefinition = {
  id: 'seo-article',
  name: 'SEO Article pipeline',
  description: 'Keyword research → article plan → write → analyze with auto-fix iterations.',
  icon: 'Newspaper',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'Generate a complete SEO article for "recycled concrete aggregates" targeting the UK market',
    'Research keywords for "porcelain tile installation" and write a 2000-word article',
  ],
  steps: [
    { id: 'research', order: 1, title: 'Keyword research', icon: 'Search', tool_id: 'seo_keyword_research',
      description: 'Full DataForSEO research for one seed keyword. Returns volume, KD, intent, related, SERP context.',
      awaits_user_input: true,
      input_schema: [
        { name: 'keyword',  label: 'Seed keyword',     required: true, placeholder: 'porcelain tile installation' },
        { name: 'country',  label: 'Country',          defaultValue: 'United Kingdom' },
        { name: 'language', label: 'Language',         defaultValue: 'English' },
      ],
    },
    { id: 'plan',     order: 2, title: 'Article plan',     icon: 'ListTree', tool_id: 'seo_article_planner',
      description: 'Outline + heading structure + target word count + on-page entities.',
    },
    { id: 'write',    order: 3, title: 'Write article',    icon: 'PenLine',  tool_id: 'seo_article_writer',
      description: 'Generate the full article body from the plan.',
    },
    { id: 'analyze',  order: 4, title: 'Analyze + auto-fix', icon: 'BadgeCheck', tool_id: 'seo_content_analyzer',
      description: '21-check SEO + GEO scoring. Auto-applies fixes when below threshold.',
    },
  ],
};

const MENTION_MONITOR: WorkflowDefinition = {
  id: 'mention-monitor',
  name: 'Track product mentions',
  description: 'Enroll a product / brand / keyword in cross-channel mention monitoring (news + blogs + RSS + YouTube + LLM probes).',
  icon: 'Megaphone',
  moduleSlug: 'mention-monitoring',
  examples: [
    'Start tracking mentions for product 12345',
    'What\'s our LLM visibility for the Flobali brand?',
  ],
  steps: [
    { id: 'enroll',     order: 1, title: 'Enroll subject',     icon: 'Plus', tool_id: 'track_product_mentions',
      description: 'Pick the product / brand / keyword and which sources to monitor.',
      awaits_user_input: true,
      input_schema: [
        { name: 'subject_label', label: 'Brand or keyword', required: true, placeholder: 'Flobali' },
        { name: 'subject_type',  label: 'Subject type', type: 'select',
          options: [
            { value: 'product', label: 'Product (catalog row)' },
            { value: 'brand',   label: 'Brand' },
            { value: 'keyword', label: 'Keyword' },
          ],
          defaultValue: 'brand',
        },
      ],
    },
    { id: 'first_run',  order: 2, title: 'First refresh',     icon: 'RefreshCw', tool_id: 'track_product_mentions',
      description: 'Initial discovery across enabled sources. Populates the feed.',
    },
    { id: 'llm_probe',  order: 3, title: 'LLM visibility probe', icon: 'Bot', tool_id: 'check_llm_visibility',
      description: 'Run 16 cross-LLM probes (Haiku / GPT-4o-mini / Gemini Flash / Sonar). Returns share-of-voice + average position.',
      skippable: true,
    },
    { id: 'review',     order: 4, title: 'Review + tune',     icon: 'Settings2', tool_id: 'find_negative_mentions',
      description: 'Pull negative-sentiment mentions for triage. Configure alerts.',
      skippable: true,
    },
  ],
};

const PRESENTATION_SHEET: WorkflowDefinition = {
  id: 'presentation-sheet',
  name: 'Build a presentation sheet',
  description: 'A3 client-ready sheet attached to a moodboard. 8 sheet types — material board / color palette / lighting plan / annotated render / ...',
  icon: 'LayoutTemplate',
  examples: [
    'Generate a material board for moodboard "Modern Athens Loft" with these 6 products',
    'Build a color palette sheet from the moodboard images',
  ],
  steps: [
    { id: 'pick_type', order: 1, title: 'Pick sheet type', icon: 'Grid3x3', tool_id: 'generate_presentation_sheet',
      awaits_user_input: true,
      input_schema: [
        { name: 'moodboard_id', label: 'Moodboard',  type: 'select', source: 'moodboards', required: true,
          options: [], hint: 'Pick the moodboard this sheet attaches to.' },
        { name: 'sheet_type',   label: 'Sheet type', type: 'select', required: true,
          options: [
            { value: 'material_board',         label: 'Material Board' },
            { value: 'color_palette',          label: 'Color Palette' },
            { value: 'concept_board',          label: 'Concept Board' },
            { value: 'lighting_plan',          label: 'Lighting Plan (interactive)' },
            { value: 'plumbing_plan',          label: 'Plumbing Plan (interactive)' },
            { value: 'electrical_plan',        label: 'Electrical Plan (interactive)' },
            { value: 'annotated_render',       label: 'Annotated Render (interactive)' },
            { value: 'elevation_render_pair',  label: 'Elevation + Render Pair (interactive)' },
            { value: 'ffe_schedule',           label: 'FF&E Schedule' },
            { value: 'full_deck',              label: 'Full Deck' },
          ],
          defaultValue: 'material_board',
        },
        { name: 'title', label: 'Sheet title', required: true, placeholder: 'Bathroom Wall Sheet' },
      ],
    },
    { id: 'fill_inputs', order: 2, title: 'Fill inputs',  icon: 'PencilLine', tool_id: 'generate_presentation_sheet',
      description: 'Provide products / swatches / dimensions per the sheet type schema.',
    },
    { id: 'render',      order: 3, title: 'Render PDF',   icon: 'FileDown',   tool_id: 'generate_presentation_sheet',
      description: 'Build the A3 PDF. Interactive types open the canvas widget first.',
    },
  ],
};

const B2B_RESEARCH: WorkflowDefinition = {
  id: 'b2b-research',
  name: 'B2B manufacturer research',
  description: 'Find manufacturers in a target market → scrape websites → enrich → discover contacts → validate emails → save to CRM.',
  icon: 'Building2',
  adminOnly: true,
  agent_id: 'kai',
  examples: [
    'Find me 10 porcelain tile manufacturers in Spain and save the qualified ones to CRM',
    'Research kitchen-cabinet factories in Italy with verified email contacts',
  ],
  steps: [
    { id: 'search',    order: 1, title: 'Search manufacturers', icon: 'Search', tool_id: 'b2b_manufacturer_search',
      awaits_user_input: true,
      input_schema: [
        { name: 'industry', label: 'Industry / Product type', required: true, placeholder: 'porcelain tiles' },
        { name: 'country',  label: 'Country',                 required: true, placeholder: 'Spain' },
        { name: 'count',    label: 'How many results?', type: 'number', defaultValue: 10 },
      ],
    },
    { id: 'scrape',    order: 2, title: 'Scrape websites',     icon: 'Globe',   tool_id: 'company_website_scrape',
      description: 'Pull addresses, phones, emails from each domain.',
    },
    { id: 'enrich',    order: 3, title: 'Enrich companies',    icon: 'Building2', tool_id: 'company_enrichment',
      description: 'Apollo.io data — employee count, revenue, funding, tech stack.',
      skippable: true,
    },
    { id: 'contacts',  order: 4, title: 'Discover contacts',   icon: 'Users',  tool_id: 'contact_discovery',
      description: 'Find decision-maker emails per company.',
      skippable: true,
    },
    { id: 'validate',  order: 5, title: 'Validate emails',     icon: 'Mail',   tool_id: 'email_validate',
      description: 'ZeroBounce check — deliverability + role + disposable.',
      skippable: true,
    },
    { id: 'save',      order: 6, title: 'Save to CRM',         icon: 'Save',   tool_id: 'save_to_crm',
      description: 'Persist qualified rows to crm_companies + crm_contacts.',
    },
  ],
};

export const WORKFLOWS: WorkflowDefinition[] = [
  CATALOG_BUILD,
  CATALOG_TRANSLATE,
  CATALOG_RESUME,
  CATALOG_SEND,
  SEO_ARTICLE,
  MENTION_MONITOR,
  PRESENTATION_SHEET,
  B2B_RESEARCH,
];

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS.find((w) => w.id === id);
}

export function getWorkflowsForRole(role: 'viewer' | 'member' | 'admin' | 'owner', enabledModules: string[] = []): WorkflowDefinition[] {
  const isAdmin = role === 'admin' || role === 'owner';
  return WORKFLOWS.filter((w) => {
    if (w.adminOnly && !isAdmin) return false;
    if (w.moduleSlug && !enabledModules.includes(w.moduleSlug)) return false;
    return true;
  });
}
