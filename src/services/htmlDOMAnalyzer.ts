import { supabase } from '@/integrations/supabase/client';

export interface DOMElement {
  id: string;
  tagName: string;
  className: string;
  textContent: string;
  innerHTML: string;
  attributes: Record<string, string>;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  hierarchy: number;
  elementType: 'heading' | 'paragraph' | 'table' | 'list' | 'image' | 'div' | 'span';
  confidence: number;
  parent?: string;
  children: string[];
}

export interface DocumentStructure {
  title: string;
  sections: DocumentSection[];
  readingOrder: string[];
  totalElements: number;
  pageCount: number;
  metadata: {
    processingDate: string;
    confidence: number;
    elementTypes: Record<string, number>;
  };
}

export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  elements: DOMElement[];
  subsections: DocumentSection[];
  pageNumber?: number;
}

export interface LayoutAnalysisResult {
  structure: DocumentStructure;
  elements: DOMElement[];
  images: ImageElement[];
  tables: TableElement[];
  textBlocks: TextBlock[];
  productCandidates: ProductCandidate[];
}

export interface ProductCandidate {
  id: string;
  name: string;
  confidence: number;
  pageNumber: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  contentType: 'product' | 'index' | 'sustainability' | 'technical' | 'moodboard' | 'unknown';
  patterns: {
    hasProductName: boolean;
    hasDimensions: boolean;
    hasDesignerAttribution: boolean;
    hasProductDescription: boolean;
  };
  extractedData: {
    productName?: string;
    dimensions?: string[];
    designer?: string;
    colors?: string[];
    materials?: string[];
  };
  associatedElements: string[]; // Element IDs
  qualityScore: number;
}

export interface ImageElement {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  bbox: { x: number; y: number; width: number; height: number };
  pageNumber: number;
  associatedTextIds: string[];
  imageType: 'material_sample' | 'diagram' | 'chart' | 'photo' | 'illustration';
}

export interface TableElement {
  id: string;
  caption?: string;
  headers: string[];
  rows: string[][];
  bbox: { x: number; y: number; width: number; height: number };
  pageNumber: number;
  tableType: 'specifications' | 'data' | 'comparison' | 'properties';
}

export interface TextBlock {
  id: string;
  text: string;
  blockType: 'heading' | 'paragraph' | 'list_item' | 'caption';
  hierarchy: number;
  bbox: { x: number; y: number; width: number; height: number };
  pageNumber: number;
  fontInfo?: {
    size: number;
    weight: string;
    family: string;
  };
  semanticTags: string[];
}

/**
 * HTML DOM Analyzer Service
 * Parses HTML documents and extracts structured layout information
 * for layout-aware chunking and content analysis
 */
export class HTMLDOMAnalyzer {
  private parser: DOMParser;
  private elementCounter: number = 0;

  constructor() {
    this.parser = new DOMParser();
  }

  /**
   * Analyze HTML content and extract structured layout information
   */
  async analyzeHTML(htmlContent: string, documentId?: string): Promise<LayoutAnalysisResult> {
    try {
      console.log('Starting HTML DOM analysis...');

      // Parse HTML content
      const doc = this.parser.parseFromString(htmlContent, 'text/html');

      // Extract document structure
      const structure = await this.extractDocumentStructure(doc);

      // Extract all elements with layout information
      const elements = await this.extractLayoutElements(doc);

      // Extract images with context
      const images = await this.extractImages(doc);

      // Extract tables with structure
      const tables = await this.extractTables(doc);

      // Extract text blocks with semantic information
      const textBlocks = await this.extractTextBlocks(doc);

      // ✅ NEW: Extract product candidates using layout-based detection
      const productCandidates = await this.extractProductCandidates(doc, elements, textBlocks);

      // Store analysis results if documentId provided
      if (documentId) {
        await this.storeAnalysisResults(documentId, {
          structure,
          elements,
          images,
          tables,
          textBlocks,
          productCandidates,
        });
      }

      console.log(`HTML analysis completed: ${elements.length} elements, ${images.length} images, ${tables.length} tables, ${productCandidates.length} product candidates`);

      return {
        structure,
        elements,
        images,
        tables,
        textBlocks,
        productCandidates,
      };

    } catch (error) {
      console.error('HTML DOM analysis error:', error);
      throw new Error(`HTML analysis failed: ${(error as any).message}`);
    }
  }

  /**
   * Extract hierarchical document structure
   */
  private async extractDocumentStructure(doc: Document): Promise<DocumentStructure> {
    const titleElement = doc.querySelector('title') || doc.querySelector('h1');
    const title = titleElement?.textContent?.trim() || 'Untitled Document';

    // Find all heading elements to build structure
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading-1, .heading-2, .heading-3'));

    const sections: DocumentSection[] = [];
    const readingOrder: string[] = [];
    let currentSection: DocumentSection | null = null;

    // Build hierarchical structure from headings
    for (const heading of headings) {
      const level = this.getHeadingLevel(heading);
      const sectionTitle = heading.textContent?.trim() || '';
      const sectionId = this.generateElementId();

      const section: DocumentSection = {
        id: sectionId,
        title: sectionTitle,
        level,
        elements: [],
        subsections: [],
        pageNumber: this.extractPageNumber(heading),
      };

      // Extract elements belonging to this section
      section.elements = await this.extractSectionElements(heading);

      // Add to reading order
      readingOrder.push(sectionId);
      section.elements.forEach(el => readingOrder.push(el.id));

      // Build hierarchy
      if (level === 1 || !currentSection) {
        sections.push(section);
        currentSection = section;
      } else if (level > currentSection.level) {
        currentSection.subsections.push(section);
      } else {
        // Find appropriate parent section
        const parentSection = this.findParentSection(sections, level);
        if (parentSection) {
          parentSection.subsections.push(section);
        } else {
          sections.push(section);
        }
        currentSection = section;
      }
    }

    // Count element types
    const allElements = await this.extractLayoutElements(doc);
    const elementTypes = allElements.reduce((acc, el) => {
      acc[el.elementType] = (acc[el.elementType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      title,
      sections,
      readingOrder,
      totalElements: allElements.length,
      pageCount: this.extractPageCount(doc),
      metadata: {
        processingDate: new Date().toISOString(),
        confidence: 0.92,
        elementTypes,
      },
    };
  }

  /**
   * Extract all layout elements with positioning and semantic information
   */
  private async extractLayoutElements(doc: Document): Promise<DOMElement[]> {
    const elements: DOMElement[] = [];

    // Target semantic elements
    const selectors = [
      'h1, h2, h3, h4, h5, h6',
      '.heading-1, .heading-2, .heading-3',
      'p, .paragraph',
      'table, .spec-table',
      'ul, ol, .property-list',
      'img, .material-image',
      'div.material-block',
      'div.layout-element',
    ];

    for (const selector of selectors) {
      const nodeList = doc.querySelectorAll(selector);

      for (const element of Array.from(nodeList)) {
        const domElement = await this.analyzeDOMElement(element as Element);
        if (domElement) {
          elements.push(domElement);
        }
      }
    }

    return elements;
  }

  /**
   * Analyze individual DOM element
   */
  private async analyzeDOMElement(element: Element): Promise<DOMElement | null> {
    try {
      const id = this.generateElementId();
      const tagName = element.tagName.toLowerCase();
      const className = element.className || '';
      const textContent = element.textContent?.trim() || '';
      const innerHTML = element.innerHTML;

      // Extract attributes
      const attributes: Record<string, string> = {};
      for (const attr of Array.from(element.attributes)) {
        attributes[attr.name] = attr.value;
      }

      // Extract bounding box from data attributes or estimate
      const bbox = this.extractBoundingBox(element);

      // Determine element type and hierarchy
      const elementType = this.determineElementType(element);
      const hierarchy = this.calculateHierarchy(element);

      // Calculate confidence based on semantic markers
      const confidence = this.calculateElementConfidence(element);

      // Find parent and children relationships
      const parent = element.parentElement ? this.generateElementId() : undefined;
      const children = Array.from(element.children).map(() => this.generateElementId());

      return {
        id,
        tagName,
        className,
        textContent,
        innerHTML,
        attributes,
        bbox,
        hierarchy,
        elementType,
        confidence,
        parent,
        children,
      };

    } catch (error) {
      console.warn('Error analyzing DOM element:', error);
      return null;
    }
  }

  /**
   * Extract images with contextual information
   */
  private async extractImages(doc: Document): Promise<ImageElement[]> {
    const images: ImageElement[] = [];
    const imgElements = doc.querySelectorAll('img, .material-image');

    for (const img of Array.from(imgElements)) {
      const id = this.generateElementId();
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';

      // Find caption
      const caption = this.findImageCaption(img);

      // Extract bounding box
      const bbox = this.extractBoundingBox(img);

      // Determine page number
      const pageNumber = this.extractPageNumber(img);

      // Find associated text elements
      const associatedTextIds = await this.findAssociatedText(img);

      // Determine image type
      const imageType = this.determineImageType(img);

      images.push({
        id,
        src,
        alt,
        caption,
        bbox,
        pageNumber,
        associatedTextIds,
        imageType,
      });
    }

    return images;
  }

  /**
   * Extract tables with structured data
   */
  private async extractTables(doc: Document): Promise<TableElement[]> {
    const tables: TableElement[] = [];
    const tableElements = doc.querySelectorAll('table, .spec-table');

    for (const table of Array.from(tableElements)) {
      const id = this.generateElementId();

      // Extract caption
      const captionElement = table.querySelector('caption');
      const caption = captionElement?.textContent?.trim();

      // Extract headers
      const headerElements = table.querySelectorAll('th');
      const headers = Array.from(headerElements).map(th => th.textContent?.trim() || '');

      // Extract rows
      const rowElements = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      const rows = Array.from(rowElements).map(row => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells).map(cell => cell.textContent?.trim() || '');
      });

      // Extract bounding box and page
      const bbox = this.extractBoundingBox(table);
      const pageNumber = this.extractPageNumber(table);

      // Determine table type
      const tableType = this.determineTableType(table);

      tables.push({
        id,
        caption,
        headers,
        rows,
        bbox,
        pageNumber,
        tableType,
      });
    }

    return tables;
  }

  /**
   * Extract text blocks with semantic information
   */
  private async extractTextBlocks(doc: Document): Promise<TextBlock[]> {
    const textBlocks: TextBlock[] = [];
    const textElements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, .paragraph, .heading-1, .heading-2, .heading-3');

    for (const element of Array.from(textElements)) {
      const id = this.generateElementId();
      const text = element.textContent?.trim() || '';

      if (text.length < 10) continue; // Skip very short text blocks

      const blockType = this.determineTextBlockType(element);
      const hierarchy = this.calculateHierarchy(element);
      const bbox = this.extractBoundingBox(element);
      const pageNumber = this.extractPageNumber(element);

      // Extract font information
      const fontInfo = this.extractFontInfo(element);

      // Generate semantic tags
      const semanticTags = this.generateSemanticTags(element, text);

      textBlocks.push({
        id,
        text,
        blockType,
        hierarchy,
        bbox,
        pageNumber,
        fontInfo,
        semanticTags,
      });
    }

    return textBlocks;
  }

  /**
   * Helper methods for element analysis
   */
  private generateElementId(): string {
    return `element_${++this.elementCounter}_${Date.now()}`;
  }

  private getHeadingLevel(element: Element): number {
    const tagName = element.tagName.toLowerCase();
    if (tagName.match(/^h[1-6]$/)) {
      return parseInt(tagName.charAt(1));
    }

    const className = element.className;
    if (className.includes('heading-1')) return 1;
    if (className.includes('heading-2')) return 2;
    if (className.includes('heading-3')) return 3;

    return 1;
  }

  private extractPageNumber(element: Element): number {
    // Look for page data attribute or parent page container
    const pageElement = element.closest('[data-page]');
    if (pageElement) {
      const pageAttr = pageElement.getAttribute('data-page');
      return pageAttr ? parseInt(pageAttr) : 1;
    }

    // Look for page class
    const pageContainer = element.closest('.page');
    if (pageContainer) {
      const pageText = pageContainer.textContent;
      const pageMatch = pageText?.match(/Page (\d+)/);
      return pageMatch ? parseInt(pageMatch[1]) : 1;
    }

    return 1;
  }

  private extractPageCount(doc: Document): number {
    const pageElements = doc.querySelectorAll('.page, [data-page]');
    return pageElements.length || 1;
  }

  private extractBoundingBox(element: Element): { x: number; y: number; width: number; height: number } {
    // Try to get bbox from data attribute
    const bboxAttr = element.getAttribute('data-bbox');
    if (bboxAttr) {
      const coords = bboxAttr.split(',').map(Number);
      if (coords.length === 4) {
        return {
          x: coords[0],
          y: coords[1],
          width: coords[2] - coords[0],
          height: coords[3] - coords[1],
        };
      }
    }

    // Estimate based on element type and position
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    // Default dimensions based on element type
    let width = 500;
    let height = 30;

    if (tagName.match(/^h[1-6]$/) || className.includes('heading')) {
      height = 40 + (6 - this.getHeadingLevel(element)) * 5;
    } else if (tagName === 'p' || className.includes('paragraph')) {
      height = Math.max(30, (element.textContent?.length || 0) / 80 * 20);
    } else if (tagName === 'table') {
      height = 150;
    } else if (tagName === 'img') {
      width = 200;
      height = 150;
    }

    return { x: 50, y: 100, width, height };
  }

  private determineElementType(element: Element): DOMElement['elementType'] {
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    if (tagName.match(/^h[1-6]$/) || className.includes('heading')) {
      return 'heading';
    } else if (tagName === 'p' || className.includes('paragraph')) {
      return 'paragraph';
    } else if (tagName === 'table') {
      return 'table';
    } else if (tagName.match(/^[uo]l$/) || className.includes('list')) {
      return 'list';
    } else if (tagName === 'img') {
      return 'image';
    } else if (tagName === 'span') {
      return 'span';
    } else {
      return 'div';
    }
  }

  private calculateHierarchy(element: Element): number {
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    if (tagName.match(/^h[1-6]$/)) {
      return parseInt(tagName.charAt(1));
    }

    if (className.includes('heading-1')) return 1;
    if (className.includes('heading-2')) return 2;
    if (className.includes('heading-3')) return 3;

    // Calculate based on DOM depth
    let depth = 0;
    let current = element.parentElement;
    while (current && depth < 10) {
      depth++;
      current = current.parentElement;
    }

    return Math.min(depth, 6);
  }

  private calculateElementConfidence(element: Element): number {
    let confidence = 0.8; // Base confidence

    // Increase confidence for semantic elements
    if (element.hasAttribute('data-type')) confidence += 0.1;
    if (element.hasAttribute('data-bbox')) confidence += 0.05;
    if (element.className.includes('layout-element')) confidence += 0.05;

    // Decrease confidence for generic elements
    if (element.tagName.toLowerCase() === 'div' && !element.className) {
      confidence -= 0.2;
    }

    return Math.max(0.5, Math.min(1.0, confidence));
  }

  private findImageCaption(img: Element): string | undefined {
    // Look for caption in various locations
    const captionSelectors = [
      '.image-caption',
      '.caption',
      'figcaption',
    ];

    for (const selector of captionSelectors) {
      const caption = img.parentElement?.querySelector(selector) ||
                     img.nextElementSibling?.matches(selector) ? img.nextElementSibling : null;
      if (caption) {
        return caption.textContent?.trim();
      }
    }

    return undefined;
  }

  private async findAssociatedText(img: Element): Promise<string[]> {
    // Find text elements near the image
    const associatedIds: string[] = [];

    // Look for text in the same container
    const container = img.closest('.material-block, .page, .section');
    if (container) {
      const textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
      textElements.forEach(() => {
        associatedIds.push(this.generateElementId());
      });
    }

    return associatedIds;
  }

  private determineImageType(img: Element): ImageElement['imageType'] {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const className = img.className;

    if (className.includes('material-image') || alt.includes('material')) {
      return 'material_sample';
    } else if (alt.includes('diagram') || src.includes('diagram')) {
      return 'diagram';
    } else if (alt.includes('chart') || src.includes('chart')) {
      return 'chart';
    } else if (alt.includes('photo')) {
      return 'photo';
    } else {
      return 'illustration';
    }
  }

  private determineTableType(table: Element): TableElement['tableType'] {
    const className = table.className;
    const caption = table.querySelector('caption')?.textContent?.toLowerCase() || '';

    if (className.includes('spec-table') || caption.includes('specification')) {
      return 'specifications';
    } else if (caption.includes('comparison')) {
      return 'comparison';
    } else if (caption.includes('properties')) {
      return 'properties';
    } else {
      return 'data';
    }
  }

  private determineTextBlockType(element: Element): TextBlock['blockType'] {
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    if (tagName.match(/^h[1-6]$/) || className.includes('heading')) {
      return 'heading';
    } else if (tagName === 'li') {
      return 'list_item';
    } else if (className.includes('caption')) {
      return 'caption';
    } else {
      return 'paragraph';
    }
  }

  private extractFontInfo(element: Element): TextBlock['fontInfo'] {
    // Extract font information from data attributes or estimate
    const dataSize = element.getAttribute('data-font-size');
    const dataWeight = element.getAttribute('data-font-weight');
    const dataFamily = element.getAttribute('data-font-family');

    if (dataSize || dataWeight || dataFamily) {
      return {
        size: dataSize ? parseInt(dataSize) : 12,
        weight: dataWeight || 'normal',
        family: dataFamily || 'Arial',
      };
    }

    // Estimate based on element type
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    let size = 12;
    let weight = 'normal';

    if (tagName.match(/^h[1-6]$/)) {
      const level = parseInt(tagName.charAt(1));
      size = 24 - (level * 2);
      weight = 'bold';
    } else if (className.includes('heading-1')) {
      size = 24;
      weight = 'bold';
    } else if (className.includes('heading-2')) {
      size = 20;
      weight = 'bold';
    }

    return { size, weight, family: 'Arial' };
  }

  private generateSemanticTags(element: Element, text: string): string[] {
    const tags: string[] = [];

    // Add tags based on element type
    const tagName = element.tagName.toLowerCase();
    const className = element.className;

    if (tagName.match(/^h[1-6]$/)) tags.push('heading');
    if (className.includes('material')) tags.push('material');
    if (className.includes('technical')) tags.push('technical');
    if (className.includes('specification')) tags.push('specification');

    // Add tags based on content
    const lowerText = text.toLowerCase();
    if (lowerText.includes('specification')) tags.push('specification');
    if (lowerText.includes('property')) tags.push('property');
    if (lowerText.includes('standard')) tags.push('standard');
    if (lowerText.includes('performance')) tags.push('performance');
    if (lowerText.includes('installation')) tags.push('installation');
    if (lowerText.includes('maintenance')) tags.push('maintenance');

    return [...new Set(tags)]; // Remove duplicates
  }

  private findParentSection(sections: DocumentSection[], level: number): DocumentSection | null {
    // Find the most recent section with a lower level
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].level < level) {
        return sections[i];
      }
    }
    return null;
  }

  private async extractSectionElements(heading: Element): Promise<DOMElement[]> {
    const elements: DOMElement[] = [];

    // Find all elements between this heading and the next heading of same or higher level
    let current = heading.nextElementSibling;
    const headingLevel = this.getHeadingLevel(heading);

    while (current) {
      if (current.tagName.match(/^H[1-6]$/)) {
        const currentLevel = this.getHeadingLevel(current);
        if (currentLevel <= headingLevel) {
          break; // Found next section
        }
      }

      const element = await this.analyzeDOMElement(current);
      if (element) {
        elements.push(element);
      }

      current = current.nextElementSibling;
    }

    return elements;
  }

  /**
   * Store analysis results in the database
   */
  private async storeAnalysisResults(documentId: string, results: LayoutAnalysisResult): Promise<void> {
    try {
      // Store layout analysis with product candidates
      await supabase
        .from('document_layout_analysis')
        .insert({
          document_id: documentId,
          page_number: 1, // Will be updated for multi-page documents
          layout_elements: results.elements as unknown,
          reading_order: results.structure.readingOrder as unknown,
          structure_confidence: results.structure.metadata.confidence,
          processing_version: '1.1.0', // Updated version for product candidate support
          analysis_metadata: {
            product_candidates: results.productCandidates,
            total_candidates: results.productCandidates.length,
            high_quality_candidates: results.productCandidates.filter(c => c.qualityScore > 0.7).length,
            analysis_timestamp: new Date().toISOString(),
            layout_analysis_version: '1.1.0'
          } as unknown,
        });

      console.log(`Layout analysis results stored successfully with ${results.productCandidates.length} product candidates`);
    } catch (error) {
      console.error('Error storing layout analysis results:', error);
    }
  }

  /**
   * Get analysis results for a document
   */
  async getAnalysisResults(documentId: string): Promise<LayoutAnalysisResult | null> {
    try {
      const { data, error } = await supabase
        .from('document_layout_analysis')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      // Reconstruct the analysis result from stored data
      return {
        structure: {
          title: 'Stored Document',
          sections: [],
          readingOrder: (data.reading_order as unknown as string[]) || [],
          totalElements: Array.isArray(data.layout_elements) ? data.layout_elements.length : 0,
          pageCount: 1,
          metadata: {
            processingDate: data.created_at,
            confidence: data.structure_confidence || 0.8,
            elementTypes: {},
          },
        },
        elements: (data.layout_elements as any) || [],
        images: [],
        tables: [],
        textBlocks: [],
      };

    } catch (error) {
      console.error('Error retrieving analysis results:', error);
      return null;
    }
  }

  /**
   * ✅ NEW: Extract product candidates using layout-based detection
   */
  async extractProductCandidates(
    doc: Document,
    elements: DOMElement[],
    textBlocks: TextBlock[]
  ): Promise<ProductCandidate[]> {
    const candidates: ProductCandidate[] = [];

    console.log('🔍 Starting layout-based product candidate detection...');

    // Analyze each text block for product patterns
    for (const textBlock of textBlocks) {
      const candidate = await this.analyzeTextBlockForProduct(textBlock, elements);
      if (candidate && candidate.confidence > 0.3) { // Minimum confidence threshold
        candidates.push(candidate);
      }
    }

    // Filter out non-product content (index, sustainability, technical)
    const filteredCandidates = candidates.filter(candidate =>
      candidate.contentType === 'product' && candidate.qualityScore > 0.5
    );

    console.log(`🎯 Found ${filteredCandidates.length} high-quality product candidates from ${candidates.length} total candidates`);

    return filteredCandidates;
  }

  /**
   * ✅ NEW: Analyze a text block for product patterns
   */
  private async analyzeTextBlockForProduct(
    textBlock: TextBlock,
    elements: DOMElement[]
  ): Promise<ProductCandidate | null> {
    const text = textBlock.text;
    const id = `product_candidate_${textBlock.id}`;

    // Skip very short text blocks
    if (text.length < 50) return null;

    // Detect content type first
    const contentType = this.classifyContentType(text);

    // Skip non-product content early
    if (contentType !== 'product' && contentType !== 'unknown') {
      return null;
    }

    // Extract product patterns
    const patterns = this.detectProductPatterns(text);
    const extractedData = this.extractProductData(text);

    // Calculate confidence based on patterns found
    let confidence = 0;
    if (patterns.hasProductName) confidence += 0.4;
    if (patterns.hasDimensions) confidence += 0.3;
    if (patterns.hasDesignerAttribution) confidence += 0.2;
    if (patterns.hasProductDescription) confidence += 0.1;

    // Calculate quality score
    const qualityScore = this.calculateProductQualityScore(text, patterns, extractedData);

    return {
      id,
      name: extractedData.productName || `Product Candidate ${textBlock.id}`,
      confidence,
      pageNumber: textBlock.pageNumber,
      boundingBox: textBlock.bbox,
      contentType: contentType as any,
      patterns,
      extractedData,
      associatedElements: [textBlock.id],
      qualityScore,
    };
  }

  /**
   * ✅ NEW: Classify content type based on text patterns
   */
  private classifyContentType(text: string): string {
    const lowerText = text.toLowerCase();

    // Index/Table of Contents patterns
    if (
      lowerText.includes('table of contents') ||
      lowerText.includes('index') ||
      lowerText.includes('contents') ||
      (lowerText.includes('page') && lowerText.match(/\d+/)) ||
      lowerText.match(/\.{3,}/) // Dotted lines typical in TOC
    ) {
      return 'index';
    }

    // Sustainability/Certification patterns
    if (
      lowerText.includes('sustainability') ||
      lowerText.includes('certification') ||
      lowerText.includes('environmental') ||
      lowerText.includes('eco-friendly') ||
      lowerText.includes('carbon footprint') ||
      lowerText.includes('recycled') ||
      lowerText.includes('leed') ||
      lowerText.includes('greenguard')
    ) {
      return 'sustainability';
    }

    // Technical specifications patterns
    if (
      lowerText.includes('technical characteristics') ||
      lowerText.includes('specifications') ||
      lowerText.includes('technical data') ||
      lowerText.includes('properties') ||
      (lowerText.includes('mm') && lowerText.includes('thickness')) ||
      lowerText.includes('weight per') ||
      lowerText.includes('fire rating')
    ) {
      return 'technical';
    }

    // Moodboard patterns
    if (
      lowerText.includes('moodboard') ||
      lowerText.includes('mood board') ||
      lowerText.includes('inspiration') ||
      lowerText.includes('collection overview') ||
      (lowerText.includes('contrast') && !lowerText.match(/[A-Z]{2,}/))
    ) {
      return 'moodboard';
    }

    // Product patterns (UPPERCASE names, dimensions)
    if (
      text.match(/[A-Z]{2,}/) && // Has uppercase words
      (text.match(/\d+\s*[×x]\s*\d+/) || text.match(/\d+\s*mm/)) // Has dimensions
    ) {
      return 'product';
    }

    return 'unknown';
  }

  /**
   * ✅ NEW: Detect product-specific patterns in text
   */
  private detectProductPatterns(text: string): ProductCandidate['patterns'] {
    return {
      hasProductName: this.hasProductNamePattern(text),
      hasDimensions: this.hasDimensionPattern(text),
      hasDesignerAttribution: this.hasDesignerPattern(text),
      hasProductDescription: this.hasProductDescriptionPattern(text),
    };
  }

  private hasProductNamePattern(text: string): boolean {
    // Look for UPPERCASE product names (2+ consecutive uppercase letters)
    return /[A-Z]{2,}/.test(text);
  }

  private hasDimensionPattern(text: string): boolean {
    // Look for dimension patterns: "12×45", "20x40", "15 x 38", "120mm"
    return /\d+\s*[×x]\s*\d+|\d+\s*mm|\d+\s*cm/.test(text);
  }

  private hasDesignerPattern(text: string): boolean {
    // Look for designer attribution patterns
    return /by\s+[A-Z][a-z]+|BY\s+[A-Z]+|designed\s+by|studio|estudi/i.test(text);
  }

  private hasProductDescriptionPattern(text: string): boolean {
    // Look for product description indicators
    return text.length > 100 && /material|texture|finish|color|collection/i.test(text);
  }

  /**
   * ✅ NEW: Extract structured product data from text
   */
  private extractProductData(text: string): ProductCandidate['extractedData'] {
    const data: ProductCandidate['extractedData'] = {};

    // Extract product name (UPPERCASE words)
    const productNameMatch = text.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/);
    if (productNameMatch) {
      data.productName = productNameMatch[0];
    }

    // Extract dimensions
    const dimensionMatches = text.match(/\d+\s*[×x]\s*\d+|\d+\s*mm|\d+\s*cm/g);
    if (dimensionMatches) {
      data.dimensions = dimensionMatches;
    }

    // Extract designer/studio
    const designerMatch = text.match(/(?:by|BY)\s+([A-Z][a-zA-Z\s{}]+)|(?:studio|estudi)\s*([A-Z][a-zA-Z\s{}]*)/i);
    if (designerMatch) {
      data.designer = (designerMatch[1] || designerMatch[2]).trim();
    }

    // Extract colors (common color names and patterns)
    const colorMatches = text.match(/\b(?:white|black|grey|gray|beige|taupe|sand|clay|anthracite|cream|ivory|brown|blue|green|red|yellow|orange|purple|pink)\b/gi);
    if (colorMatches) {
      data.colors = [...new Set(colorMatches.map(c => c.toLowerCase()))];
    }

    // Extract materials
    const materialMatches = text.match(/\b(?:ceramic|porcelain|stone|marble|granite|wood|metal|glass|concrete|tile|vinyl|laminate)\b/gi);
    if (materialMatches) {
      data.materials = [...new Set(materialMatches.map(m => m.toLowerCase()))];
    }

    return data;
  }

  /**
   * ✅ NEW: Calculate quality score for product candidate
   */
  private calculateProductQualityScore(
    text: string,
    patterns: ProductCandidate['patterns'],
    extractedData: ProductCandidate['extractedData']
  ): number {
    let score = 0;

    // Base score for having product patterns
    if (patterns.hasProductName) score += 0.3;
    if (patterns.hasDimensions) score += 0.25;
    if (patterns.hasDesignerAttribution) score += 0.2;
    if (patterns.hasProductDescription) score += 0.15;

    // Bonus for extracted data quality
    if (extractedData.productName && extractedData.productName.length > 2) score += 0.1;
    if (extractedData.dimensions && extractedData.dimensions.length > 0) score += 0.1;
    if (extractedData.designer) score += 0.1;
    if (extractedData.colors && extractedData.colors.length > 0) score += 0.05;
    if (extractedData.materials && extractedData.materials.length > 0) score += 0.05;

    // Penalty for very short content
    if (text.length < 100) score *= 0.5;

    // Penalty for index-like content
    if (text.toLowerCase().includes('page') && text.match(/\d+/)) score *= 0.3;

    return Math.min(1.0, score);
  }
}

// Export singleton instance
export const htmlDOMAnalyzer = new HTMLDOMAnalyzer();
