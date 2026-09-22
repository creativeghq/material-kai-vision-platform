// GENERATED — do not edit here. Regenerate: npm run rpc:catalog (part of gen:all).
//
// Derived reads a signed-in user's own token can call through PostgREST. Every entry is
// STABLE or IMMUTABLE, which is what keeps a writer out: a VOLATILE function of the same
// name shape is excluded by construction, not by anyone remembering to exclude it.

export interface PlatformRpcArg {
  name: string;
  type: string;
  required?: boolean;
}

export interface PlatformRpcEntry {
  name: string;
  subject: string;
  args: readonly PlatformRpcArg[];
}

export const PLATFORM_RPC_CATALOG: readonly PlatformRpcEntry[] = [
  {
    "name": "brand_overview",
    "subject": "brand overview",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "customer_360",
    "subject": "customer 360",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_ai_keyword_volumes",
    "subject": "ai keyword volumes",
    "args": [
      {
        "name": "p_keywords",
        "type": "text[]",
        "required": true
      },
      {
        "name": "p_language",
        "type": "text"
      }
    ]
  },
  {
    "name": "get_article_decay",
    "subject": "article decay",
    "args": [
      {
        "name": "p_article_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_assessment_snapshot",
    "subject": "assessment snapshot",
    "args": [
      {
        "name": "p_subject_type",
        "type": "text",
        "required": true
      },
      {
        "name": "p_subject_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_today",
        "type": "date"
      }
    ]
  },
  {
    "name": "get_asset_book_values",
    "subject": "asset book values",
    "args": [
      {
        "name": "p_asset_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_asset_tax_depreciation",
    "subject": "asset tax depreciation",
    "args": [
      {
        "name": "p_asset_ids",
        "type": "uuid[]",
        "required": true
      },
      {
        "name": "p_as_of",
        "type": "date"
      }
    ]
  },
  {
    "name": "get_brand_category_coverage",
    "subject": "brand category coverage",
    "args": [
      {
        "name": "p_brands",
        "type": "text[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_buyer_finance_limits",
    "subject": "buyer finance limits",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid"
      },
      {
        "name": "p_contact_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_cooccurring_products",
    "subject": "cooccurring products",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_customer_health",
    "subject": "customer health",
    "args": [
      {
        "name": "p_company_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_customer_prior_balance",
    "subject": "customer prior balance",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid"
      },
      {
        "name": "p_contact_id",
        "type": "uuid"
      },
      {
        "name": "p_exclude_invoice_id",
        "type": "uuid"
      },
      {
        "name": "p_as_of",
        "type": "timestamp with time zone"
      }
    ]
  },
  {
    "name": "get_deal_documents",
    "subject": "deal documents",
    "args": [
      {
        "name": "p_deal_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_deal_forecast",
    "subject": "deal forecast",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_deal_outcomes_by_month",
    "subject": "deal outcomes by month",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      },
      {
        "name": "p_months",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_deal_owner_stats",
    "subject": "deal owner stats",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_deal_stage_funnel",
    "subject": "deal stage funnel",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_deal_stage_totals",
    "subject": "deal stage totals",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_deal_velocity",
    "subject": "deal velocity",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_deal_type_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_embed_analytics_summary",
    "subject": "embed analytics summary",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_gsc_movers",
    "subject": "gsc movers",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_gsc_striking_distance",
    "subject": "gsc striking distance",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_gsc_summary",
    "subject": "gsc summary",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_inbound_document_correlations",
    "subject": "inbound document correlations",
    "args": [
      {
        "name": "p_doc_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_inbound_document_detail",
    "subject": "inbound document detail",
    "args": [
      {
        "name": "p_doc_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_inbound_link_summary",
    "subject": "inbound link summary",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_intrastat_lines",
    "subject": "intrastat lines",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_from",
        "type": "date",
        "required": true
      },
      {
        "name": "p_to",
        "type": "date",
        "required": true
      },
      {
        "name": "p_direction",
        "type": "text"
      }
    ]
  },
  {
    "name": "get_invoice_item_costs",
    "subject": "invoice item costs",
    "args": [
      {
        "name": "p_invoice_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_monthly_pnl",
    "subject": "monthly pnl",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_from",
        "type": "date",
        "required": true
      }
    ]
  },
  {
    "name": "get_order_customs_preview",
    "subject": "order customs preview",
    "args": [
      {
        "name": "p_order_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_order_item_costs",
    "subject": "order item costs",
    "args": [
      {
        "name": "p_order_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_order_profit_positions",
    "subject": "order profit positions",
    "args": [
      {
        "name": "p_order_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_order_settlements",
    "subject": "order settlements",
    "args": [
      {
        "name": "p_order_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_order_worklist",
    "subject": "order worklist",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_package_bid_comparison",
    "subject": "package bid comparison",
    "args": [
      {
        "name": "p_package_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_page_gsc_queries",
    "subject": "page gsc queries",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_page",
        "type": "text",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_party_profit_position",
    "subject": "party profit position",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid"
      },
      {
        "name": "p_contact_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "get_party_work",
    "subject": "party work",
    "args": [
      {
        "name": "p_party_kind",
        "type": "text",
        "required": true
      },
      {
        "name": "p_party_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_payment_remainders",
    "subject": "payment remainders",
    "args": [
      {
        "name": "p_payment_ids",
        "type": "uuid[]"
      }
    ]
  },
  {
    "name": "get_product_categories",
    "subject": "product categories",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_product_certificates",
    "subject": "product certificates",
    "args": [
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_today",
        "type": "date"
      }
    ]
  },
  {
    "name": "get_product_costs",
    "subject": "product costs",
    "args": [
      {
        "name": "p_product_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_product_detail",
    "subject": "product detail",
    "args": [
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_product_price_history",
    "subject": "product price history",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_product_provenance",
    "subject": "product provenance",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_products_by_brand",
    "subject": "products by brand",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_products_in_project",
    "subject": "products in project",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_profit_drawdown",
    "subject": "profit drawdown",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_from",
        "type": "date"
      },
      {
        "name": "p_to",
        "type": "date"
      }
    ]
  },
  {
    "name": "get_project_applications",
    "subject": "project applications",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_cost_by_code",
    "subject": "project cost by code",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_cvr",
    "subject": "project cvr",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_finance_summary",
    "subject": "project finance summary",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_inspections",
    "subject": "project inspections",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_labor",
    "subject": "project labor",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_pnl",
    "subject": "project pnl",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_retention",
    "subject": "project retention",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_project_stock_holds",
    "subject": "project stock holds",
    "args": [
      {
        "name": "p_project_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_projects_using_product",
    "subject": "projects using product",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_property_commercial_links",
    "subject": "property commercial links",
    "args": [
      {
        "name": "p_property_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_property_performance",
    "subject": "property performance",
    "args": [
      {
        "name": "p_property_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_property_projects",
    "subject": "property projects",
    "args": [
      {
        "name": "p_property_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_quote_billing_progress",
    "subject": "quote billing progress",
    "args": [
      {
        "name": "p_quote_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_quote_totals",
    "subject": "quote totals",
    "args": [
      {
        "name": "p_quote_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_related_products",
    "subject": "related products",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_types",
        "type": "text[]"
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_rent_charge_settlements",
    "subject": "rent charge settlements",
    "args": [
      {
        "name": "p_charge_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_sale_commission_splits",
    "subject": "sale commission splits",
    "args": [
      {
        "name": "p_sale_ids",
        "type": "uuid[]",
        "required": true
      }
    ]
  },
  {
    "name": "get_sourcing_board",
    "subject": "sourcing board",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_mine",
        "type": "boolean"
      }
    ]
  },
  {
    "name": "get_supplier_inbound_orders",
    "subject": "supplier inbound orders",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_tender_bid_analysis",
    "subject": "tender bid analysis",
    "args": [
      {
        "name": "p_package_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_tender_bid_summary",
    "subject": "tender bid summary",
    "args": [
      {
        "name": "p_package_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_vat_return_period",
    "subject": "vat return period",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_from",
        "type": "date",
        "required": true
      },
      {
        "name": "p_to",
        "type": "date",
        "required": true
      }
    ]
  },
  {
    "name": "get_website_ai_answers",
    "subject": "website ai answers",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_ai_citation_report",
    "subject": "website ai citation report",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_ai_monitoring_state",
    "subject": "website ai monitoring state",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_website_ai_visibility",
    "subject": "website ai visibility",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_cannibalisation",
    "subject": "website cannibalisation",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      },
      {
        "name": "p_min_impressions",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_citability_report",
    "subject": "website citability report",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_competitor_series",
    "subject": "website competitor series",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      },
      {
        "name": "p_metric",
        "type": "text"
      }
    ]
  },
  {
    "name": "get_website_crawl_report",
    "subject": "website crawl report",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_website_domain_intel",
    "subject": "website domain intel",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_health",
    "subject": "website health",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_website_llm_mentions",
    "subject": "website llm mentions",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_opportunities",
    "subject": "website opportunities",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_website_rank_summary",
    "subject": "website rank summary",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_search_metrics",
    "subject": "website search metrics",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "get_website_seo_overview",
    "subject": "website seo overview",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "get_workspace_capabilities",
    "subject": "workspace capabilities",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "inbound_issuers_summary",
    "subject": "inbound issuers summary",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "kb_retrieval_eval_summary",
    "subject": "kb retrieval eval summary",
    "args": [
      {
        "name": "p_batch_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "list_granted_catalog_products",
    "subject": "granted catalog products",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_query",
        "type": "text"
      },
      {
        "name": "p_factory",
        "type": "text"
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "list_supplier_products",
    "subject": "supplier products",
    "args": [
      {
        "name": "p_product_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "list_workspace_product_suppliers",
    "subject": "workspace product suppliers",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "my_customer_account_summary",
    "subject": "my customer account summary",
    "args": []
  },
  {
    "name": "search_catalogue",
    "subject": "catalogue",
    "args": [
      {
        "name": "p_query",
        "type": "text"
      },
      {
        "name": "p_category_id",
        "type": "uuid"
      },
      {
        "name": "p_limit",
        "type": "integer"
      },
      {
        "name": "p_offset",
        "type": "integer"
      },
      {
        "name": "p_product_id",
        "type": "uuid"
      }
    ]
  },
  {
    "name": "search_orders",
    "subject": "orders",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_order_type",
        "type": "text"
      },
      {
        "name": "p_status",
        "type": "text"
      },
      {
        "name": "p_company_id",
        "type": "uuid"
      },
      {
        "name": "p_contact_id",
        "type": "uuid"
      },
      {
        "name": "p_project_id",
        "type": "uuid"
      },
      {
        "name": "p_search",
        "type": "text"
      },
      {
        "name": "p_limit",
        "type": "integer"
      },
      {
        "name": "p_offset",
        "type": "integer"
      },
      {
        "name": "p_created_from",
        "type": "timestamp with time zone"
      },
      {
        "name": "p_created_to",
        "type": "timestamp with time zone"
      },
      {
        "name": "p_total_min",
        "type": "numeric"
      },
      {
        "name": "p_total_max",
        "type": "numeric"
      },
      {
        "name": "p_currency",
        "type": "text"
      },
      {
        "name": "p_payment_status",
        "type": "text"
      }
    ]
  },
  {
    "name": "search_products_by_specs",
    "subject": "products by specs",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_filters",
        "type": "jsonb"
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "search_products_fulltext",
    "subject": "products fulltext",
    "args": [
      {
        "name": "search_query",
        "type": "text",
        "required": true
      },
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "search_workspace_people",
    "subject": "workspace people",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_query",
        "type": "text",
        "required": true
      },
      {
        "name": "p_limit",
        "type": "integer"
      }
    ]
  },
  {
    "name": "seo_website_ga_summary",
    "subject": "seo website ga summary",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "seo_website_gsc_summary",
    "subject": "seo website gsc summary",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_days",
        "type": "integer"
      }
    ]
  },
  {
    "name": "seo_website_health_summary",
    "subject": "seo website health summary",
    "args": [
      {
        "name": "p_website_id",
        "type": "uuid",
        "required": true
      }
    ]
  },
  {
    "name": "supplier_360",
    "subject": "supplier 360",
    "args": [
      {
        "name": "p_workspace_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "p_company_id",
        "type": "uuid",
        "required": true
      }
    ]
  }
] as const;
