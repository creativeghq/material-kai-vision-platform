/**
 * Tool Picker Modal
 *
 * Multi-select picker for restricting which agent tools the model sees on the
 * next message. When 1+ tools are selected, only those tools are bound to the
 * model — saves prompt tokens (each tool definition is 200-500 input tokens).
 * When nothing is selected, the agent uses its full default tool set.
 */

import React, { useState, useMemo } from 'react';
import { Wrench, X, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';

interface ToolEntry {
  id: string;
  name: string;
  desc: string;
  category: string;
  adminOnly: boolean;
}

const TOOL_CATALOG: Record<string, ToolEntry[]> = {
  kai: [
    { id: 'knowledge_base_search',  name: 'Knowledge Base',     desc: 'Search documents in the KB',                              category: 'Search',     adminOnly: false },
    { id: 'material_search',        name: 'Material Search',    desc: 'Find materials (text + spec + visual + style fusion)',    category: 'Search',     adminOnly: false },
    { id: 'visual_search',          name: 'Visual Search',      desc: 'Find similar materials from an attached image',           category: 'Search',     adminOnly: false },
    { id: 'analyze_inspiration_url',name: 'Inspiration URL',    desc: 'Extract design tokens from a webpage and match products', category: 'Search',     adminOnly: false },
    { id: 'research_analysis',      name: 'Research',           desc: 'Deep research sub-agent',                                 category: 'Sub-agents', adminOnly: true  },
    { id: 'analytics_analysis',     name: 'Analytics',          desc: 'Analytics sub-agent',                                     category: 'Sub-agents', adminOnly: true  },
    { id: 'business_analysis',      name: 'Business',           desc: 'Business sub-agent',                                      category: 'Sub-agents', adminOnly: true  },
    { id: 'product_analysis',       name: 'Product',            desc: 'Product sub-agent',                                       category: 'Sub-agents', adminOnly: true  },
    { id: 'b2b_manufacturer_search',name: 'Manufacturer Search',desc: 'Find manufacturers in markets via web search',            category: 'B2B',        adminOnly: true  },
    { id: 'company_website_scrape', name: 'Website Scrape',     desc: 'Scrape a company website',                                category: 'B2B',        adminOnly: true  },
    { id: 'company_enrichment',     name: 'Company Enrichment', desc: 'Apollo company data',                                     category: 'B2B',        adminOnly: true  },
    { id: 'contact_discovery',      name: 'Contact Discovery',  desc: 'Find & verify contact emails',                            category: 'B2B',        adminOnly: true  },
    { id: 'email_validate',         name: 'Email Validate',     desc: 'ZeroBounce email validation',                             category: 'B2B',        adminOnly: true  },
    { id: 'save_to_crm',            name: 'Save to CRM',        desc: 'Persist a company/contact to the CRM',                    category: 'B2B',        adminOnly: true  },
    { id: 'create_seo_article',     name: 'Full SEO Pipeline',  desc: 'Research → Plan → Write → Analyze',                       category: 'SEO',        adminOnly: true  },
    { id: 'seo_keyword_research',   name: 'Keyword Research',   desc: 'DataForSEO SERP + content analysis',                      category: 'SEO',        adminOnly: true  },
    { id: 'seo_article_planner',    name: 'Article Planner',    desc: 'Structured outline via Gemini',                           category: 'SEO',        adminOnly: true  },
    { id: 'seo_article_writer',     name: 'Article Writer',     desc: 'Long-form article generation',                            category: 'SEO',        adminOnly: true  },
    { id: 'seo_content_analyzer',   name: 'Content Analyzer',   desc: 'SEO + GEO scoring',                                       category: 'SEO',        adminOnly: true  },
    { id: 'dispatch_background_task',name:'Background Task',    desc: 'Dispatch a long-running task to MIVAA',                   category: 'Background', adminOnly: true  },
    { id: 'price_lookup',           name: 'Price Lookup',       desc: 'Pricing from the KB Pricing category',                    category: 'Pricing',    adminOnly: true  },
  ],
  'interior-designer': [
    { id: 'material_search',         name: 'Material Search',  desc: 'Find materials matching the design',           category: 'Search',     adminOnly: false },
    { id: 'generate_3d',             name: '3D Generation',    desc: 'Generate a render via Replicate or Gemini',    category: 'Generation', adminOnly: false },
    { id: 'analyze_inspiration_url', name: 'Inspiration URL',  desc: 'Pull design tokens from a webpage',            category: 'Inspiration',adminOnly: false },
  ],
  demo: [],
};

interface ToolPickerModalProps {
  agentId: string;
  isAdmin: boolean;
  selectedTools: string[];
  onChange: (toolIds: string[]) => void;
  onClose: () => void;
}

export function ToolPickerModal({
  agentId,
  isAdmin,
  selectedTools,
  onChange,
  onClose,
}: ToolPickerModalProps) {
  const [draft, setDraft] = useState<string[]>(selectedTools);

  const allowedTools = useMemo(() => {
    const catalog = TOOL_CATALOG[agentId] || [];
    return catalog.filter((t) => isAdmin || !t.adminOnly);
  }, [agentId, isAdmin]);

  const grouped = useMemo(() => {
    const out: Record<string, ToolEntry[]> = {};
    for (const t of allowedTools) {
      if (!out[t.category]) out[t.category] = [];
      out[t.category].push(t);
    }
    return out;
  }, [allowedTools]);

  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  const clear = () => {
    setDraft([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="dashboard-card w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Select tools for this message</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border">
          Pick one or more tools to attach to your next message. When nothing is
          selected, the agent uses its full default tool set.
        </div>

        {/* Tool list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {allowedTools.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              No tools available for this agent.
            </div>
          )}
          {Object.entries(grouped).map(([category, tools]) => (
            <div key={category}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {category}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tools.map((t) => {
                  const isOn = draft.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                        isOn
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card hover:bg-muted/60 text-foreground',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                          isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}
                      >
                        {isOn && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {draft.length === 0 ? (
              <span>Using full default tool set</span>
            ) : (
              <Badge variant="secondary" className="rounded-full">
                {draft.length} tool{draft.length === 1 ? '' : 's'} selected
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={clear} disabled={draft.length === 0}>
              Clear
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolPickerModal;
