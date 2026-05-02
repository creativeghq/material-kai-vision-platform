export type SheetType =
  | 'material_board'
  | 'color_palette'
  | 'concept_board'
  | 'lighting_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
  | 'full_deck';

export interface SheetRow {
  id: string;
  moodboard_id: string;
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
}

export interface SheetPdfRequest {
  sheet_id: string;
}

export interface SheetPdfResponse {
  success: boolean;
  pdf_url?: string;
  pdf_storage_path?: string;
  page_count?: number;
  error?: string;
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
  type: string;
  x: number;
  y: number;
  label?: string;
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
