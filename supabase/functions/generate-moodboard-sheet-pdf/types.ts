export type SheetType =
  | 'material_board'
  | 'color_palette'
  | 'concept_board'
  | 'lighting_plan'
  | 'plumbing_plan'
  | 'electrical_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
  | 'area_breakdown'
  | 'full_deck';

export interface SheetRow {
  id: string;
  /** Null for a project-owned technical plan. Exactly one parent is set. */
  moodboard_id: string | null;
  project_id?: string | null;
  created_by: string | null;
  sheet_type: SheetType;
  title: string;
  data: Record<string, any>;
}

export interface MoodboardRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  /** Owning project (nullable) — resolves which workspace's branding to render under. */
  project_id: string | null;
}

export interface SheetPdfRequest {
  // Render a single sheet / deck …
  sheet_id?: string;
  // … or render a project-level Client View (a deck assembled from sheets across
  // any of the project's moodboards). Exactly one of these is provided.
  client_view_id?: string;
  regenerate?: boolean;
}

export interface SheetPdfResponse {
  success: boolean;
  pdf_url?: string;
  pdf_storage_path?: string;
  page_count?: number;
  error?: string;
  // create-mode (action:'create') echoes:
  sheet_id?: string;
  sheet_type?: string;
  is_interactive?: boolean;
  status?: string;
  initial_data?: Record<string, any>;
  credits_charged?: number;
  validation_error?: boolean;
}

export interface ProductChip {
  product_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  hex?: string | null;
  category?: string | null;
}

export interface SwatchData {
  hex: string;
  name: string;
  source_image_id?: string;
}

export interface AnnotationData {
  x: number;
  y: number;
  line_endpoint_x: number;
  line_endpoint_y: number;
  label: string;
  product_id?: string;
  source: 'ai' | 'manual' | 'auto';
}

export interface DimensionData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: string;
  unit: string;
}

export interface FixtureSymbolData {
  /** Stable per-sheet identity. Absent on plans saved before ids existed. */
  id?: string;
  type: string;
  x: number;
  y: number;
  label?: string;
  /** Linked catalog product — what turns the plan into a bill of materials. */
  product_id?: string;
}

/** A pipe / cable / circuit joining two symbols. Coordinates normalized [0..1]. */
export interface FixtureRunData {
  id: string;
  kind: string;
  from: string;
  to: string;
  vertices?: Array<{ x: number; y: number }>;
  label?: string;
  props?: { current_a?: number; csa_mm2?: number; phases?: 1 | 3 };
}

export interface FfeItem {
  room: string | null;
  name: string;
  dimensions: string | null;
  install: string | null;
  delivery: string | null;
  qty: number;
  price?: number | null;
}

// area_breakdown — a single composited "design breakdown" board (one A3 page)
// combining a hero render, a dimensioned plan + elevation, a finishes column,
// fitting/accessory columns, a notes column, and a color-palette strip.
export interface AreaFinish {
  label: string;       // e.g. "Wall Tile"
  spec?: string;       // e.g. "Matt Stone Finish — Light Grey"
  hex?: string;        // swatch color when no image
  image_url?: string;  // swatch image when available
}

export interface AreaFittingColumn {
  title: string;                                  // e.g. "Sanitary Ware & Fittings"
  items: { label: string; note?: string }[];     // e.g. { label: "Wall Hung WC" }
}

export interface AreaBreakdownData {
  subtitle?: string;            // e.g. "Modern Bathroom Design"
  hero_image_url?: string;      // main render
  plan_image_url?: string;      // dimensions & layout
  elevation_image_url?: string; // elevation / front view
  finishes?: AreaFinish[];      // material & finishes column
  fitting_columns?: AreaFittingColumn[]; // sanitary ware / storage / etc (cap 3)
  palette?: { hex: string; name?: string }[]; // bottom color strip (cap 8)
  notes?: string[];             // notes column bullets
  features?: string[];          // optional key-feature chips
}
