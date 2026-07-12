/**
 * Email Template Builder — GrapesJS + grapesjs-preset-newsletter
 * Fully open-source, no paid plan required.
 * Features: 7 KAI custom blocks, device preview, test send, preheader, tag docs, save/load JSON.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import grapesjs, { Editor as GrapesEditor } from 'grapesjs';
// @ts-ignore — no official TS types for this plugin
import newsletterPlugin from 'grapesjs-preset-newsletter';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Monitor, Tablet, Smartphone, Send, Info } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getProductName, getMaterialCategory, getAvailableColors } from '@/utils/productMetadata';
import { getAllTriggerGroups } from '@/services/flows/triggerVariables';
import { humanizeLabel } from '@/utils/humanize';

// ── Types ──────────────────────────────────────────────────────────────────
type DeviceView = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceView, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

const BRAND = {
  primary: '#3E192A',
  font: "'Open Sans', Arial, sans-serif",
};

// ── Template tag documentation ─────────────────────────────────────────────
// Always-available recipient/platform tags (filled by the email send pipeline).
const TEMPLATE_TAGS = [
  { tag: '{{firstName}}',     label: 'First Name',       example: 'Jane',                          note: 'Populated from recipient contact data when sending a campaign, or passed explicitly in the send API call.' },
  { tag: '{{lastName}}',      label: 'Last Name',        example: 'Smith',                         note: 'Same as firstName — comes from the recipient record.' },
  { tag: '{{fullName}}',      label: 'Full Name',        example: 'Jane Smith',                    note: 'Concatenation of first + last. Falls back to email address if no name is available.' },
  { tag: '{{email}}',         label: 'Email Address',    example: 'jane@studio.com',               note: "The recipient's email address. Always available." },
  { tag: '{{companyName}}',   label: 'Company Name',     example: 'Materials Hub',                  note: 'Defaults to "Materials Hub". Can be overridden per send.' },
  { tag: '{{currentYear}}',   label: 'Current Year',     example: '2026',                          note: 'Injected at send time. Useful in footer copyright lines.' },
  { tag: '{{platformUrl}}',   label: 'Platform URL',     example: 'https://materialkai.com',       note: 'The main platform URL. Set in Email Settings.' },
  { tag: '{{unsubscribeUrl}}',label: 'Unsubscribe Link', example: 'https://…/unsubscribe?token=…', note: 'Required for marketing emails. Automatically generated.' },
];

// Platform/flow event tags: when this template is sent by a Flow's "Send Email"
// action, the flow maps these into the template's variables. Grouped by the
// event that triggers them so authors know which tags are available per source.
// Shows ALL documented event sources, derived from the shared catalog (single
// source of truth).
const FLOW_EVENT_TAG_GROUPS: Array<{ title: string; tags: Array<{ tag: string; label: string; note: string }> }> =
  getAllTriggerGroups().map((group) => ({
    title: group.title,
    tags: group.variables.map((v) => ({
      // In the template you reference the bare tag name; the flow's Send Email
      // "variables" field maps it (e.g. firstName ← {{trigger.data.client_name}}).
      tag: `{{${v.key}}}`,
      label: v.label,
      note: v.note,
    })),
  }));

// ── HTML email card helpers ─────────────────────────────────────────────────
function cardHtml(imageUrl: string, title: string, subtitle: string, linkUrl = '#') {
  const img = imageUrl
    ? `<img src="${imageUrl}" width="100%" style="display:block;max-height:160px;object-fit:cover;border-radius:8px 8px 0 0;" alt="${title}" />`
    : '<div style="height:120px;background:#e8e0d8;border-radius:8px 8px 0 0;text-align:center;padding:40px 0;font-size:28px;">🧱</div>';
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee;">' +
      `<tr><td>${img}</td></tr>` +
      '<tr><td style="padding:12px;">' +
        `<a href="${linkUrl}" style="text-decoration:none;">` +
          `<div style="font-family:${BRAND.font};font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:4px;">${title}</div>` +
          `<div style="font-family:${BRAND.font};font-size:12px;color:#888;">${subtitle}</div>` +
        '</a>' +
      '</td></tr>' +
    '</table>'
  );
}

function gridHtml(items: { image: string; title: string; subtitle: string; url?: string }[], cols: number): string {
  const pct = Math.floor(100 / cols);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += cols) {
    const cells = items.slice(i, i + cols).map(it =>
      `<td width="${pct}%" style="padding:6px;vertical-align:top;">${cardHtml(it.image, it.title, it.subtitle, it.url)}</td>`,
    );
    while (cells.length < cols) cells.push(`<td width="${pct}%" style="padding:6px;"></td>`);
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
}

function listHtml(items: { image: string; title: string; subtitle: string; url?: string }[]): string {
  const rows = items.map(it => {
    const img = it.image
      ? `<img src="${it.image}" width="80" height="64" style="display:block;object-fit:cover;border-radius:6px;" alt="${it.title}" />`
      : '<div style="width:80px;height:64px;background:#e8e0d8;border-radius:6px;"></div>';
    return (
      '<tr><td style="padding:8px 0;border-bottom:1px solid #f0eae6;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
          `<td width="88" style="vertical-align:top;">${img}</td>` +
          '<td style="padding-left:12px;vertical-align:top;">' +
            `<a href="${it.url || '#'}" style="text-decoration:none;">` +
              `<div style="font-family:${BRAND.font};font-weight:600;font-size:14px;color:#1a1a1a;">${it.title}</div>` +
              `<div style="font-family:${BRAND.font};font-size:12px;color:#888;margin-top:3px;">${it.subtitle}</div>` +
            '</a>' +
          '</td>' +
        '</tr></table>' +
      '</td></tr>'
    );
  });
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
}

// ── Live data fetcher + MH block renderer ──────────────────────────────────
async function renderKaiBlock(
  type: string,
  count: number,
  cols: number,
  layout: 'columns' | 'list',
  category = '',
  showDetails = true,
): Promise<string> {
  const now = new Date();
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    if (type === 'material_card' || type === 'top_week' || type === 'top_month') {
      let query = supabase.from('products').select('id, name, description, metadata, source_document_id')
        .order('created_at', { ascending: false }).limit(count);
      if (type === 'top_week')  query = query.gte('created_at', weekAgo);
      if (type === 'top_month') query = query.gte('created_at', monthAgo);
      if (category) query = query.filter('metadata->>material_category', 'eq', category);
      const { data: products } = await query;
      if (!products?.length) return `<!-- MH block: no ${type} data found -->`;

      const docIds = products.map(p => p.source_document_id).filter(Boolean);
      const imageMap: Record<string, string> = {};
      if (docIds.length) {
        const { data: imgs } = await supabase.from('document_images').select('document_id, image_url').in('document_id', docIds);
        imgs?.forEach(img => { if (!imageMap[img.document_id]) imageMap[img.document_id] = img.image_url; });
      }
      const items = products.map(p => {
        const cat = getMaterialCategory(p.metadata);
        const colors = getAvailableColors(p.metadata);
        return {
          image: p.source_document_id ? (imageMap[p.source_document_id] || '') : '',
          title: getProductName(p),
          subtitle: showDetails
            ? [cat?.replace(/_/g, ' '), colors.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Material'
            : '',
          url: '#',
        };
      });
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 4)));
    }

    if (type === 'moodboard') {
      const { data: boards } = await supabase.from('moodboards')
        .select('id, title, description, moodboard_items(media_url, position)')
        .eq('is_public', true).order('created_at', { ascending: false }).limit(count);
      if (!boards?.length) return '<!-- KAI block: no public moodboards found -->';
      const items = boards.map((b: any) => {
        const sorted = (b.moodboard_items || []).sort((a: any, z: any) => a.position - z.position);
        return { image: sorted.find((mi: any) => mi.media_url)?.media_url || '', title: b.title || 'Untitled Moodboard', subtitle: b.description || 'Curated collection', url: '#' };
      });
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 3)));
    }

    if (type === 'vr3d') {
      const { data: worlds } = await supabase.from('vr_worlds')
        .select('id, status, panorama_url, thumbnail_url').eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(count);
      if (!worlds?.length) return '<!-- KAI block: no completed 3D worlds found -->';
      const items = worlds.map(w => ({ image: w.panorama_url || w.thumbnail_url || '', title: 'Material World', subtitle: 'Explore in 3D', url: '#' }));
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 3)));
    }
  } catch (err) {
    console.error('MH block render error:', err);
  }
  return `<!-- MH block: failed to render ${type} -->`;
}

// ── Post-processes exported HTML: replaces data-kai-block placeholders ─────
async function processEmailHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.querySelectorAll('[data-kai-block]'));
  if (!blocks.length) return html;
  await Promise.all(blocks.map(async (el) => {
    const type        = el.getAttribute('data-kai-block') || '';
    const count       = parseInt(el.getAttribute('data-count') || '3');
    const cols        = parseInt(el.getAttribute('data-cols') || '3');
    const layout      = (el.getAttribute('data-layout') || 'columns') as 'columns' | 'list';
    const category    = el.getAttribute('data-category') || '';
    const showDetails = el.getAttribute('data-show-details') !== 'false';
    const replacement = await renderKaiBlock(type, count, cols, layout, category, showDetails);
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = replacement;
    el.replaceWith(...Array.from(wrapper.childNodes));
  }));
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

// ── Preheader injection ─────────────────────────────────────────────────────
function injectPreheader(html: string, text: string): string {
  if (!text.trim()) return html;
  const padding = '&zwnj;&nbsp;'.repeat(90);
  const snippet = `<span style="display:none;font-size:1px;color:#ffffff;max-height:0;overflow:hidden;mso-hide:all;">${text}${padding}</span>`;
  return html.replace(/(<body[^>]*>)/i, `$1${snippet}`);
}

// ── MH custom blocks for GrapesJS ──────────────────────────────────────────
// Async: fetches material categories from DB to populate the category trait.
//
// Visibility tiers (2026-07-12):
//   • Operator-only blocks carry the platform's own MaterialsHub / Material Kai
//     branding (the "MH · Brand" group). These are gated on `isPlatformOperator`
//     so tenant/dealer workspaces — whose emails go only to their own workspace
//     members from their own BYOK sender — never expose the operator's branding.
//   • Workspace blocks (materials, inspiration, generic content) are available to
//     every workspace user regardless of tier.
async function addMhBlocks(editor: GrapesEditor, isPlatformOperator: boolean) {

  // SVG line icon helper — matches GrapesJS panel style
  const svgIcon = (paths: string) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
    `style="display:block;margin:auto;width:22px;height:22px;">${paths}</svg>`;

  // Inline canvas preview SVG (larger, coloured for the block placeholder)
  const previewSvg = (paths: string) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3E192A" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
    `style="width:28px;height:28px;">${paths}</svg>`;

  // ── SVG icon paths ────────────────────────────────────────────────────────
  const ICONS = {
    grid:     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    image:    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    cube:     '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    header:   '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="14" y2="10"/><rect x="4" y="14" width="16" height="6" rx="1"/>',
    button:   '<rect x="2" y="8" width="20" height="8" rx="4"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="13 9 16 12 13 15"/>',
    contact:  '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/>',
    footer:   '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="16" y2="12"/><rect x="4" y="16" width="16" height="4" rx="1"/>',
    divider:  '<line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  };

  // ── Category groups ───────────────────────────────────────────────────────
  const CAT_MATERIALS   = { id: 'mh-materials',   label: 'MH · Materials',   open: true  };
  const CAT_INSPIRATION = { id: 'mh-inspiration', label: 'MH · Inspiration', open: false };
  const CAT_CONTENT     = { id: 'mh-content',     label: 'Content',          open: false };
  // Operator-only — carries the platform's MaterialsHub / Material Kai identity.
  const CAT_BRAND       = { id: 'mh-brand',       label: 'MH · Brand (operator)', open: false };

  // ── Fetch material categories from DB ─────────────────────────────────────
  let categoryOptions: { id: string; label: string }[] = [{ id: '', label: 'All Categories' }];
  try {
    const { data: rows } = await supabase
      .from('products').select('metadata').not('metadata', 'is', null).limit(300);
    const cats = [...new Set(
      (rows ?? []).map((r: any) => r.metadata?.material_category).filter(Boolean),
    )].sort() as string[];
    categoryOptions = [
      { id: '', label: 'All Categories' },
      ...cats.map(c => ({ id: c, label: c.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) })),
    ];
  } catch { /* use default */ }

  // ── Operator-only branded header — carries the Material Kai platform identity.
  // Registered ONLY for the platform operator so tenant workspaces (who email
  // their own members from their own BYOK sender) never expose operator branding.
  if (isPlatformOperator) {
    editor.BlockManager.add('mh-branded-header', {
      label: 'MH Brand Header',
      category: CAT_BRAND,
      media: svgIcon(ICONS.header),
      content:
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#3E192A;">' +
        '<tr><td align="center" style="padding:28px 24px;">' +
          '<div style="font-family:\'Open Sans\',Arial,sans-serif;color:#ffffff;font-size:28px;font-weight:300;letter-spacing:3px;">MATERIAL KAI</div>' +
          '<div style="font-family:\'Open Sans\',Arial,sans-serif;color:#ffffff;opacity:0.75;font-size:13px;margin-top:8px;letter-spacing:1px;">Your Weekly Materials Update</div>' +
        '</td></tr></table>',
    });
  }

  // ── Workspace content blocks (fully editable HTML, available to every tier) ──

  // Neutral header — a tenant fills in their own business name. The brand-locked
  // "MH Brand Header" above is operator-only; this is the tenant-safe counterpart.
  editor.BlockManager.add('mh-workspace-header', {
    label: 'Header',
    category: CAT_CONTENT,
    media: svgIcon(ICONS.header),
    content:
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-bottom:1px solid #eee;">' +
      '<tr><td align="center" style="padding:24px;">' +
        '<div style="font-family:\'Open Sans\',Arial,sans-serif;color:#1a1a1a;font-size:24px;font-weight:600;letter-spacing:1px;">{{companyName}}</div>' +
        '<div style="font-family:\'Open Sans\',Arial,sans-serif;color:#888;font-size:13px;margin-top:6px;">Add your tagline here</div>' +
      '</td></tr></table>',
  });

  editor.BlockManager.add('mh-cta-button', {
    label: 'CTA Button',
    category: CAT_CONTENT,
    media: svgIcon(ICONS.button),
    // Neutral default — editable link/label. (Was hardcoded to materialkai.com /
    // "Explore Materials"; neutralised now that this is a workspace-tier block.)
    content:
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="padding:24px;">' +
        '<a href="#" style="background:#3E192A;color:#ffffff;' +
        'font-family:\'Open Sans\',Arial,sans-serif;font-size:15px;font-weight:600;' +
        'text-decoration:none;padding:14px 40px;border-radius:50px;display:inline-block;">' +
          'View Details' +
        '</a></td></tr></table>',
  });

  // Business / contact info — for tenants sending from their own business identity.
  editor.BlockManager.add('mh-business-info', {
    label: 'Business Info',
    category: CAT_CONTENT,
    media: svgIcon(ICONS.contact),
    content:
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="padding:24px 16px;font-family:\'Open Sans\',Arial,sans-serif;color:#555;font-size:13px;line-height:1.7;">' +
        '<div style="font-weight:600;color:#1a1a1a;font-size:15px;margin-bottom:6px;">{{companyName}}</div>' +
        '<div>123 Example Street, City, Country</div>' +
        '<div>+30 210 000 0000 &nbsp;·&nbsp; <a href="mailto:hello@example.com" style="color:#3E192A;text-decoration:none;">hello@example.com</a></div>' +
      '</td></tr></table>',
  });

  // Divider — thin horizontal rule with breathing room.
  editor.BlockManager.add('mh-divider', {
    label: 'Divider',
    category: CAT_CONTENT,
    media: svgIcon(ICONS.divider),
    content:
      '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td style="padding:12px 24px;">' +
        '<div style="border-top:1px solid #e5ddd6;height:1px;line-height:1px;font-size:0;">&nbsp;</div>' +
      '</td></tr></table>',
  });

  // Footer with unsubscribe — required for marketing sends. Uses the recipient
  // tags filled by the send pipeline ({{companyName}}, {{currentYear}}, {{unsubscribeUrl}}).
  editor.BlockManager.add('mh-footer', {
    label: 'Footer',
    category: CAT_CONTENT,
    media: svgIcon(ICONS.footer),
    content:
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ee;">' +
      '<tr><td align="center" style="padding:24px 16px;font-family:\'Open Sans\',Arial,sans-serif;color:#999;font-size:12px;line-height:1.7;">' +
        '<div>© {{currentYear}} {{companyName}}. All rights reserved.</div>' +
        '<div style="margin-top:8px;">You are receiving this email because you are part of {{companyName}}.</div>' +
        '<div style="margin-top:8px;"><a href="{{unsubscribeUrl}}" style="color:#999;text-decoration:underline;">Unsubscribe</a></div>' +
      '</td></tr></table>',
  });

  // ── Shared layout traits (used by top_week, top_month, moodboard, vr3d) ──
  const layoutTraits = [
    { type: 'number', label: 'Items to show', name: 'data-count', min: 1, max: 12 },
    { type: 'select', label: 'Layout', name: 'data-layout',
      options: [{ id: 'columns', label: 'Grid' }, { id: 'list', label: 'List' }] },
    { type: 'select', label: 'Columns', name: 'data-cols',
      options: [{ id: '2', label: '2 columns' }, { id: '3', label: '3 columns' }] },
  ];

  // ── Dynamic MH data block definitions ────────────────────────────────────
  type MhBlock = {
    blockId: string;
    label: string;
    iconKey: keyof typeof ICONS;
    category: typeof CAT_MATERIALS | typeof CAT_INSPIRATION | typeof CAT_BRAND;
    defaultCount: number;
    defaultCols: number;
    defaultAttrs?: Record<string, string>;
    traits: object[];
  };

  const MH_BLOCKS: MhBlock[] = [
    {
      blockId: 'material_card',
      label: 'Material Cards',
      iconKey: 'grid',
      category: CAT_MATERIALS,
      defaultCount: 3,
      defaultCols: 3,
      defaultAttrs: { 'data-category': '', 'data-show-details': 'true' },
      traits: [
        { type: 'select',   label: 'Category',         name: 'data-category',    options: categoryOptions },
        { type: 'number',   label: 'Items to show',    name: 'data-count',       min: 1, max: 12 },
        { type: 'select',   label: 'Layout',           name: 'data-layout',
          options: [{ id: 'columns', label: 'Grid' }, { id: 'list', label: 'List' }] },
        { type: 'select',   label: 'Columns',          name: 'data-cols',
          options: [{ id: '2', label: '2 columns' }, { id: '3', label: '3 columns' }] },
        { type: 'checkbox', label: 'Show material details (color, type…)', name: 'data-show-details',
          valueTrue: 'true', valueFalse: 'false' },
      ],
    },
    {
      blockId: 'top_week',
      label: 'Top This Week',
      iconKey: 'trending',
      category: CAT_MATERIALS,
      defaultCount: 6,
      defaultCols: 3,
      traits: layoutTraits,
    },
    {
      blockId: 'top_month',
      label: 'Top This Month',
      iconKey: 'calendar',
      category: CAT_MATERIALS,
      defaultCount: 6,
      defaultCols: 3,
      traits: layoutTraits,
    },
    {
      blockId: 'moodboard',
      label: 'Latest Moodboards',
      iconKey: 'image',
      category: CAT_INSPIRATION,
      defaultCount: 3,
      defaultCols: 3,
      traits: layoutTraits,
    },
    {
      blockId: 'vr3d',
      label: 'Latest 3D Worlds',
      iconKey: 'cube',
      category: CAT_INSPIRATION,
      defaultCount: 3,
      defaultCols: 3,
      traits: layoutTraits,
    },
  ];

  // ── Register each block as a GrapesJS component type ─────────────────────
  MH_BLOCKS.forEach(({ blockId, label, iconKey, category, defaultCount, defaultCols, defaultAttrs, traits }) => {
    const typeId   = `mh-${blockId}`;
    const iconPaths = ICONS[iconKey];

    editor.DomComponents.addType(typeId, {
      // Used when loading saved design JSON — re-identifies blocks in HTML
      isComponent: (el: Element) =>
        el instanceof HTMLElement && el.getAttribute('data-kai-block') === blockId,

      model: {
        defaults: {
          tagName: 'div',
          editable: false,
          droppable: false,
          // Prevent ANY child from being edited (text click, double-click, etc.)
          propagate: ['editable', 'droppable'],
          // No GrapesJS child components — canvas display is handled by the view
          components: [],
          attributes: {
            'data-kai-block': blockId,
            'data-count': String(defaultCount),
            'data-cols': String(defaultCols),
            'data-layout': 'columns',
            ...defaultAttrs,
          },
          traits,
        },
      },

      view: {
        // Block all double-click-to-edit events
        events: { dblclick: 'onDblClick' } as any,
        onDblClick(e: Event) {
          e.stopPropagation();
          e.preventDefault();
        },

        // Called by GrapesJS after every render — paint the placeholder and attach
        // the attribute-change listener once (guarded by _mhBound flag).
        // NOTE: we intentionally do NOT override initialize() — doing so with
        // (this).__proto__.initialize causes infinite recursion because __proto__
        // resolves to the NewView prototype (our own methods), not ComponentView.
        onRender() {
          const self = this as any;
          if (!self._mhBound) {
            self._mhBound = true;
            // listenTo is Backbone's memory-safe listener — auto-removed on destroy
            self.listenTo(self.model, 'change:attributes', () => self._renderPreview());
          }
          self._renderPreview();
        },

        _renderPreview() {
          const el    = (this as any).el as HTMLElement;
          const attrs = (this as any).model.getAttributes();
          const count  = attrs['data-count'] || defaultCount;
          const layout = attrs['data-layout'] === 'list' ? 'List' : 'Grid';
          const cols   = attrs['data-cols'] || defaultCols;
          const rawCat = attrs['data-category'] || '';
          const cat    = rawCat
            ? rawCat.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
            : 'All Categories';

          const detailLine = blockId === 'material_card'
            ? `${cat} · ${count} items · ${layout}${layout === 'Grid' ? ` · ${cols} cols` : ''}`
            : `${count} items · ${layout}${layout === 'Grid' ? ` · ${cols} cols` : ''}`;

          el.style.cssText =
            'background:#f8f4f2;border:2px dashed #c4a0b0;border-radius:8px;' +
            "padding:20px 24px;text-align:center;font-family:'Open Sans',Arial,sans-serif;" +
            'margin:0;user-select:none;cursor:default;min-height:80px;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;';

          el.innerHTML =
            `<div style="pointer-events:none;margin-bottom:2px;">${previewSvg(iconPaths)}</div>` +
            `<div style="pointer-events:none;color:#3E192A;font-size:13px;font-weight:600;">${label}</div>` +
            `<div style="pointer-events:none;color:#888;font-size:11px;">${detailLine}</div>` +
            '<div style="pointer-events:none;color:#bbb;font-size:10px;margin-top:2px;">' +
              'Click to configure — live data on Save / Send' +
            '</div>';
        },
      } as any,
    });

    // Object-form content: GrapesJS instantiates the exact type directly on drop —
    // no HTML parsing, no isComponent detection needed at drag-drop time.
    editor.BlockManager.add(`mh-block-${blockId}`, {
      label,
      category,
      media: svgIcon(iconPaths),
      content: { type: typeId },
    });
  });
}

// ── Tag info panel ─────────────────────────────────────────────────────────
function TagInfoPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Template Variables</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Use these tags in your subject line, preview text, and email body. Replaced with real values at send time.
          </p>
        </SheetHeader>
        <div className="space-y-4 mt-2">
          {TEMPLATE_TAGS.map(t => (
            <div key={t.tag} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-primary font-semibold">{t.tag}</code>
                <Badge variant="outline" className="text-xs">{t.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.note}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Example: </span><em>{t.example}</em>
              </p>
            </div>
          ))}
          <div className="border rounded-lg p-3 bg-muted/30 space-y-1.5">
            <p className="text-xs font-semibold">Custom variables</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Any key–value pair passed in the <code className="bg-muted px-1 rounded">variables</code> field
              of the send API call can be used as <code className="bg-muted px-1 rounded">{'{{variableName}}'}</code>.
            </p>
          </div>

          {/* Platform / flow event tags — available when this template is sent
              by a Flow's Send Email action (Admin → Flows). */}
          <div className="pt-2">
            <p className="text-xs font-semibold mb-1">Platform event tags</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
              When a <strong>Flow</strong> sends this template (Admin → Flows → Send Email action), it maps
              these into the template's <code className="bg-muted px-1 rounded">variables</code>. Grouped by the
              event that triggers the email — click an event to expand its tags.
            </p>
            <div className="space-y-2">
              {FLOW_EVENT_TAG_GROUPS.map((group) => (
                <details key={group.title} className="border rounded-lg bg-background/40">
                  <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{group.title}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{group.tags.length}</Badge>
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {group.tags.map((t) => (
                      <div key={t.tag} className="border rounded-md p-2 space-y-1">
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-primary font-semibold">{t.tag}</code>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <span className="text-foreground font-medium">{t.label}</span> — {t.note}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface EmailTemplateBuilderProps {
  /** Where "Back" navigates. Defaults to the admin email tab (transactional builder). */
  backPath?: string;
  /** #255 — when set, Send Test goes out via the workspace's own Resend (BYOK, strict) as a
   *  marketing send, matching how the campaign actually dispatches. */
  workspaceId?: string;
  marketing?: boolean;
}

export const EmailTemplateBuilder: React.FC<EmailTemplateBuilderProps> = ({ backPath, workspaceId, marketing }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Operator-only branded blocks (e.g. "MH Brand Header") are gated on this.
  // `wsLoading` gates editor init so the flag is settled before blocks register.
  const { isPlatformOperator, loading: wsLoading } = useWorkspace();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<GrapesEditor | null>(null);
  const initGuard    = useRef(false); // prevents StrictMode double-init
  const topBarRef    = useRef<HTMLDivElement>(null);

  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [sendingTest,  setSendingTest]  = useState(false);
  const [editorReady,  setEditorReady]  = useState(false);
  const [template,     setTemplate]     = useState<any>(null);
  const [subject,      setSubject]      = useState('');
  const [previewText,  setPreviewText]  = useState('');
  const [previewHtml,  setPreviewHtml]  = useState<string | null>(null);
  const [previewDevice,setPreviewDevice]= useState<DeviceView>('desktop');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTagInfo,    setShowTagInfo]    = useState(false);
  const [testEmail,      setTestEmail]      = useState('');

  // Load template metadata from Supabase
  useEffect(() => { if (id) loadTemplate(); }, [id]);

  const loadTemplate = async () => {
    try {
      const { data, error } = await supabase.from('email_templates').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Template not found');
      setTemplate(data);
      setSubject(data.subject_template || '');
      setPreviewText(data.preview_text || '');
    } catch {
      toast({ title: 'Error', description: 'Failed to load template', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Initialize GrapesJS once the container is mounted AND the workspace context
  // has resolved (so `isPlatformOperator` is settled before blocks register).
  useEffect(() => {
    if (wsLoading || !containerRef.current || initGuard.current) return;
    initGuard.current = true;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false, // we handle persistence ourselves
      plugins: [newsletterPlugin],
      pluginsOpts: {
        'grapesjs-preset-newsletter': { inlineCss: true },
      },
    });

    editorRef.current = editor;

    // addMhBlocks is async (fetches DB categories for the trait select)
    addMhBlocks(editor, isPlatformOperator).finally(() => setEditorReady(true));

    return () => {
      editor.destroy();
      editorRef.current = null;
      initGuard.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsLoading]);

  // Load saved design once both editor and template are ready
  useEffect(() => {
    if (editorReady && template && editorRef.current) {
      if (template.unlayer_design) {
        try { editorRef.current.loadProjectData(template.unlayer_design); } catch { /* ignore */ }
      }
    }
  }, [editorReady, template]);

  // Export HTML (with inlined CSS + preheader + KAI block replacement)
  const exportAndProcess = useCallback(async (): Promise<{ design: any; html: string }> => {
    const editor = editorRef.current;
    if (!editor) throw new Error('Editor not ready');

    // gjs-get-inlined-html is provided by grapesjs-preset-newsletter — returns CSS-inlined HTML
    const rawHtml = (editor.runCommand('gjs-get-inlined-html') as string) || '';
    const design  = editor.getProjectData();
    const html    = await processEmailHtml(injectPreheader(rawHtml, previewText));

    return { design, html };
  }, [previewText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { design, html } = await exportAndProcess();
      const { error } = await supabase.from('email_templates').update({
        subject_template: subject,
        preview_text:     previewText,
        html_template:    html,
        unlayer_design:   design, // column keeps its name; now stores GrapesJS JSON
        is_active:        true,
        updated_at:       new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Template saved successfully.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    try {
      const { html } = await exportAndProcess();
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          to: testEmail.trim(),
          subject: subject || `[Test] ${template?.name}`,
          html,
          emailType: marketing ? 'marketing' : 'transactional',
          // #255 marketing test sends use the workspace's own Resend (BYOK), strictly — same path
          // the campaign takes — so the test proves the real sender is configured.
          ...(marketing ? { workspace_id: workspaceId, requireWorkspaceSender: true } : {}),
          tags: { test: 'true', template_id: id },
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed to send');
      toast({ title: 'Test email sent', description: `Delivered to ${testEmail}` });
      setShowTestDialog(false);
      setTestEmail('');
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    } finally {
      setSendingTest(false);
    }
  };

  const handlePreview = (device: DeviceView) => {
    const editor = editorRef.current;
    if (!editor) return;
    setPreviewDevice(device);
    const rawHtml = (editor.runCommand('gjs-get-inlined-html') as string) || '';
    setPreviewHtml(injectPreheader(rawHtml, previewText));
  };

  // NOTE: we never early-return while loading because containerRef must stay in the DOM
  // so the GrapesJS useEffect (empty deps) can attach to it on first mount.

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Loading / not-found overlays — rendered on top of the (hidden) editor */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-50">
          <p className="text-muted-foreground">Loading template…</p>
        </div>
      )}
      {!loading && !template && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-50">
          <p className="text-muted-foreground">Template not found.</p>
        </div>
      )}

      {/* ── Top bar — hidden until template is ready ──────────────────────── */}
      <div ref={topBarRef} className="border-b bg-background shrink-0" style={{ display: (!loading && template) ? undefined : 'none' }}>

        {/* Row 1: nav + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate(backPath || '/admin?tab=email')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <div>
              <p className="font-semibold text-sm leading-tight">{template?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{humanizeLabel(template?.category)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              title="Template variable guide"
              onClick={() => setShowTagInfo(true)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Info className="h-4 w-4" />
            </button>

            {/* Device preview buttons */}
            <div className="flex items-center border rounded-full overflow-hidden divide-x">
              {(['desktop', 'tablet', 'mobile'] as DeviceView[]).map(d => (
                <button
                  key={d}
                  title={`${d} preview`}
                  disabled={!editorReady}
                  onClick={() => handlePreview(d)}
                  className="px-2.5 py-1.5 hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  {d === 'desktop' && <Monitor className="h-4 w-4" />}
                  {d === 'tablet'  && <Tablet  className="h-4 w-4" />}
                  {d === 'mobile'  && <Smartphone className="h-4 w-4" />}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" disabled={!editorReady} onClick={() => setShowTestDialog(true)}>
              <Send className="h-4 w-4 mr-1" />Send Test
            </Button>

            <Button size="sm" disabled={saving || !editorReady} onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Row 2: subject + preview text */}
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="subject" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">Subject</Label>
            <Input
              id="subject" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Welcome, {{firstName}}!" className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="preview-text" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">Preview text</Label>
            <Input
              id="preview-text" value={previewText} onChange={e => setPreviewText(e.target.value)}
              placeholder="Short teaser shown in Gmail, Outlook… (max ~90 chars)"
              className="h-7 text-xs flex-1" maxLength={150}
            />
          </div>
        </div>
      </div>

      {/* ── GrapesJS canvas — always in DOM so the init useEffect can attach ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ visibility: (!loading && template) ? 'visible' : 'hidden' }}
      />

      {/* ── Tag info sheet ───────────────────────────────────────────────── */}
      <TagInfoPanel open={showTagInfo} onClose={() => setShowTagInfo(false)} />

      {/* ── Send test dialog ─────────────────────────────────────────────── */}
      {showTestDialog && (
        <Dialog open onOpenChange={open => { if (!open) { setShowTestDialog(false); setTestEmail(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Sends the current design (with preheader + live data blocks) to an inbox before going live.
            </p>
            <div className="space-y-2 pt-1">
              <Label htmlFor="test-email" className="text-xs">Recipient email</Label>
              <Input
                id="test-email" type="email" value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={e => e.key === 'Enter' && handleSendTest()}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowTestDialog(false); setTestEmail(''); }}>Cancel</Button>
              <Button size="sm" disabled={!testEmail.trim() || sendingTest} onClick={handleSendTest}>
                <Send className="h-3.5 w-3.5 mr-1" />{sendingTest ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Responsive preview modal ─────────────────────────────────────── */}
      {previewHtml && (
        <Dialog open onOpenChange={() => setPreviewHtml(null)}>
          <DialogContent
            className="p-0 overflow-hidden flex flex-col"
            style={{ maxWidth: 'calc(100vw - 48px)', width: DEVICE_WIDTHS[previewDevice] + 48, maxHeight: '92vh' }}
          >
            <DialogHeader className="px-4 py-3 border-b shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-sm font-medium capitalize">
                  {previewDevice} preview — {DEVICE_WIDTHS[previewDevice]}px
                </DialogTitle>
                <div className="flex items-center border rounded-full overflow-hidden divide-x">
                  {(['desktop', 'tablet', 'mobile'] as DeviceView[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setPreviewDevice(d)}
                      className={`px-2.5 py-1.5 transition-colors ${previewDevice === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    >
                      {d === 'desktop' && <Monitor    className="h-3.5 w-3.5" />}
                      {d === 'tablet'  && <Tablet     className="h-3.5 w-3.5" />}
                      {d === 'mobile'  && <Smartphone className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-muted/30 p-4 flex justify-center">
              <div style={{ width: DEVICE_WIDTHS[previewDevice], flexShrink: 0 }} className="bg-white rounded shadow-sm overflow-hidden">
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: DEVICE_WIDTHS[previewDevice], height: 700 }}
                  sandbox="allow-same-origin"
                  title={`${previewDevice} email preview`}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EmailTemplateBuilder;
