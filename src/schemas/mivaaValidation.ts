import { z } from 'zod';

/**
 * Validation schema for image position data
 */
const PositionSchema = z.object({
  page: z.number().int().min(1, 'Page number must be at least 1'),
  x: z.number().min(0, 'X coordinate must be non-negative'),
  y: z.number().min(0, 'Y coordinate must be non-negative'),
  width: z.number().min(0, 'Width must be non-negative'),
  height: z.number().min(0, 'Height must be non-negative'),
});

/**
 * Validation schema for table data extracted by Mivaa
 */
const TableDataSchema = z.object({
  id: z.string().min(1, 'Table ID is required'),
  caption: z.string().optional(),
  headers: z.array(z.string()).min(1, 'At least one header is required'),
  rows: z.array(z.array(z.string())).min(1, 'At least one row is required'),
  position: PositionSchema,
  confidence: z.number().min(0, 'Confidence must be non-negative').max(1, 'Confidence must not exceed 1'),
  format: z.enum(['csv', 'json', 'markdown']),
  rawData: z.string().optional(),
});

/**
 * Validation schema for image metadata from Mivaa extraction
 */
const ImageMetadataSchema = z.object({
  id: z.string().min(1, 'Image ID is required'),
  filename: z.string().min(1, 'Image filename is required'),
  caption: z.string().optional(),
  altText: z.string().optional(),
  position: PositionSchema,
  format: z.string().min(1, 'Image format is required'),
  size: z.number().int().min(0, 'Image size must be non-negative'),
  url: z.string().url('Invalid URL format').optional(),
  base64: z.string().optional(),
  extractedText: z.string().optional(),
  confidence: z.number().min(0, 'Confidence must be non-negative').max(1, 'Confidence must not exceed 1'),
});

/**
 * Validation schema for Mivaa document metadata
 */
const MivaaDocumentMetadataSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  creator: z.string().optional(),
  producer: z.string().optional(),
  creationDate: z.string().optional(),
  modificationDate: z.string().optional(),
  pages: z.number().int().min(1, 'Page count must be at least 1'),
  language: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  extractionMethod: z.string().min(1, 'Extraction method is required'),
  confidence: z.number().min(0, 'Confidence must be non-negative').max(1, 'Confidence must not exceed 1'),
  processingVersion: z.string().min(1, 'Processing version is required'),
});

/**
 * Validation schema for processing statistics
 */
const ProcessingStatsSchema = z.object({
  pages: z.number().int().min(1, 'Page count must be at least 1'),
  processingTime: z.number().min(0, 'Processing time must be non-negative'),
  extractionQuality: z.number().min(0, 'Extraction quality must be non-negative').max(1, 'Extraction quality must not exceed 1'),
});

/**
 * Main validation schema for MivaaDocument
 */
export const MivaaDocumentSchema = z.object({
  id: z.string().optional(),
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  markdown: z.string().min(1, 'Markdown content is required').max(10_000_000, 'Markdown content too large'), // 10MB limit
  tables: z.array(TableDataSchema).max(1000, 'Too many tables'), // Reasonable limit
  images: z.array(ImageMetadataSchema).max(1000, 'Too many images'), // Reasonable limit
  metadata: MivaaDocumentMetadataSchema,
  extractionTimestamp: z.string().datetime('Invalid extraction timestamp format'),
  processingStats: ProcessingStatsSchema.optional(),
}).refine(
  (data) => {
    // Custom validation: ensure tables have consistent row lengths
    return data.tables.every(table => {
      const headerCount = table.headers.length;
      return table.rows.every(row => row.length === headerCount);
    });
  },
  {
    message: 'All table rows must have the same number of columns as headers',
    path: ['tables'],
  },
).refine(
  (data) => {
    // Custom validation: ensure filename has valid extension
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const hasValidExtension = validExtensions.some(ext =>
      data.filename.toLowerCase().endsWith(ext),
    );
    return hasValidExtension;
  },
  {
    message: 'Filename must have a valid extension (.pdf, .docx, .doc, .txt)',
    path: ['filename'],
  },
).refine(
  (data) => {
    // Custom validation: ensure markdown content doesn't contain dangerous scripts
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // onclick, onload, etc.
      /<iframe\b/gi,
      /<object\b/gi,
      /<embed\b/gi,
    ];

    return !dangerousPatterns.some(pattern => pattern.test(data.markdown));
  },
  {
    message: 'Markdown content contains potentially dangerous scripts or HTML elements',
    path: ['markdown'],
  },
);

/**
 * Type inference from the schema
 */
export type ValidatedMivaaDocument = z.infer<typeof MivaaDocumentSchema>;

/**
 * Validation function with detailed error reporting
 */
export function validateMivaaDocument(data: unknown): {
  success: boolean;
  data?: ValidatedMivaaDocument;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  const result = MivaaDocumentSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.issues.map((error: z.ZodIssue) => ({
    path: error.path.join('.'),
    message: error.message,
    code: error.code,
  }));

  return {
    success: false,
    errors,
  };
}

/**
 * Base schema without refinements for partial validation
 */
const BaseMivaaDocumentSchema = z.object({
  id: z.string().optional(),
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  markdown: z.string().min(1, 'Markdown content is required').max(10_000_000, 'Markdown content too large'), // 10MB limit
  tables: z.array(TableDataSchema).max(1000, 'Too many tables'), // Reasonable limit
  images: z.array(ImageMetadataSchema).max(1000, 'Too many images'), // Reasonable limit
  metadata: MivaaDocumentMetadataSchema,
  extractionTimestamp: z.string().datetime('Invalid extraction timestamp format'),
  processingStats: ProcessingStatsSchema.optional(),
});

/**
 * Partial validation for updates (all fields optional)
 */
export const PartialMivaaDocumentSchema = BaseMivaaDocumentSchema.partial();

/**
 * Validation function for partial updates
 */
export function validatePartialMivaaDocument(data: unknown): {
  success: boolean;
  data?: z.infer<typeof PartialMivaaDocumentSchema>;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  const result = PartialMivaaDocumentSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.issues.map((error: z.ZodIssue) => ({
    path: error.path.join('.'),
    message: error.message,
    code: error.code,
  }));

  return {
    success: false,
    errors,
  };
}
