import { z } from 'zod';

/**
 * Content Sanitization Utilities
 * 
 * Provides secure sanitization of markdown content to prevent XSS attacks
 * and malicious script injection while preserving legitimate markdown formatting.
 */

// Configuration for sanitization rules
export interface SanitizationConfig {
  allowedHtmlTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  removeScripts?: boolean;
  removeIframes?: boolean;
  removeObjects?: boolean;
  preserveCodeBlocks?: boolean;
  maxContentLength?: number;
}

// Default sanitization configuration
export const DEFAULT_SANITIZATION_CONFIG: Required<SanitizationConfig> = {
  allowedHtmlTags: ['b', 'i', 'em', 'strong', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'p', 'br', 'hr'],
  allowedAttributes: {
    'a': ['href', 'title'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'code': ['class'],
    'pre': ['class']
  },
  removeScripts: true,
  removeIframes: true,
  removeObjects: true,
  preserveCodeBlocks: true,
  maxContentLength: 1000000 // 1MB limit
};

// Validation schema for sanitization config
export const sanitizationConfigSchema = z.object({
  allowedHtmlTags: z.array(z.string()).optional(),
  allowedAttributes: z.record(z.array(z.string())).optional(),
  removeScripts: z.boolean().optional(),
  removeIframes: z.boolean().optional(),
  removeObjects: z.boolean().optional(),
  preserveCodeBlocks: z.boolean().optional(),
  maxContentLength: z.number().positive().max(10000000).optional() // 10MB max
});

/**
 * Sanitizes markdown content by removing dangerous HTML tags and scripts
 * while preserving legitimate markdown formatting.
 */
export class ContentSanitizer {
  private config: Required<SanitizationConfig>;

  constructor(config: SanitizationConfig = {}) {
    this.config = { ...DEFAULT_SANITIZATION_CONFIG, ...config };
  }

  /**
   * Sanitizes markdown content
   */
  sanitizeMarkdown(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // Check content length limit
    if (content.length > this.config.maxContentLength) {
      throw new Error(`Content exceeds maximum length of ${this.config.maxContentLength} characters`);
    }

    let sanitized = content;

    // Remove dangerous script tags and their content
    if (this.config.removeScripts) {
      sanitized = this.removeScriptTags(sanitized);
    }

    // Remove iframe tags
    if (this.config.removeIframes) {
      sanitized = this.removeIframeTags(sanitized);
    }

    // Remove object/embed tags
    if (this.config.removeObjects) {
      sanitized = this.removeObjectTags(sanitized);
    }

    // Sanitize HTML tags while preserving code blocks
    sanitized = this.sanitizeHtmlTags(sanitized);

    // Remove dangerous attributes
    sanitized = this.sanitizeAttributes(sanitized);

    // Remove javascript: and data: URLs
    sanitized = this.sanitizeUrls(sanitized);

    // Remove HTML comments that could contain malicious content
    sanitized = this.removeHtmlComments(sanitized);

    return sanitized.trim();
  }

  /**
   * Removes script tags and their content
   */
  private removeScriptTags(content: string): string {
    // Remove script tags (case insensitive, multiline)
    return content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gmi, '');
  }

  /**
   * Removes iframe tags
   */
  private removeIframeTags(content: string): string {
    return content.replace(/<iframe\b[^>]*>.*?<\/iframe>/gmi, '');
  }

  /**
   * Removes object and embed tags
   */
  private removeObjectTags(content: string): string {
    let result = content;
    result = result.replace(/<object\b[^>]*>.*?<\/object>/gmi, '');
    result = result.replace(/<embed\b[^>]*\/?>/gmi, '');
    return result;
  }

  /**
   * Sanitizes HTML tags, keeping only allowed ones
   */
  private sanitizeHtmlTags(content: string): string {
    if (this.config.preserveCodeBlocks) {
      // Temporarily replace code blocks to protect them
      const codeBlocks: string[] = [];
      let result = content.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
      });

      // Also protect inline code
      const inlineCode: string[] = [];
      result = result.replace(/`[^`]+`/g, (match) => {
        inlineCode.push(match);
        return `__INLINE_CODE_${inlineCode.length - 1}__`;
      });

      // Remove disallowed HTML tags
      result = this.removeDisallowedTags(result);

      // Restore inline code
      inlineCode.forEach((code, index) => {
        result = result.replace(`__INLINE_CODE_${index}__`, code);
      });

      // Restore code blocks
      codeBlocks.forEach((block, index) => {
        result = result.replace(`__CODE_BLOCK_${index}__`, block);
      });

      return result;
    } else {
      return this.removeDisallowedTags(content);
    }
  }

  /**
   * Removes HTML tags that are not in the allowed list
   */
  private removeDisallowedTags(content: string): string {
    const allowedTags = this.config.allowedHtmlTags.map(tag => tag.toLowerCase());
    
    return content.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName) => {
      const tag = tagName.toLowerCase();
      
      // If tag is allowed, keep it (but still sanitize attributes later)
      if (allowedTags.includes(tag)) {
        return match;
      }
      
      // Remove disallowed tags
      return '';
    });
  }

  /**
   * Sanitizes HTML attributes, keeping only allowed ones
   */
  private sanitizeAttributes(content: string): string {
    return content.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tagName, attributes) => {
      const tag = tagName.toLowerCase();
      const allowedAttrs = this.config.allowedAttributes[tag] || [];
      
      if (allowedAttrs.length === 0) {
        return `<${tagName}>`;
      }

      // Parse and filter attributes
      const sanitizedAttrs = attributes.replace(/\s*([a-zA-Z-]+)\s*=\s*["']([^"']*)["']/g, 
        (attrMatch: string, attrName: string, attrValue: string) => {
          if (allowedAttrs.includes(attrName.toLowerCase())) {
            // Additional sanitization for specific attributes
            const sanitizedValue = this.sanitizeAttributeValue(attrName, attrValue);
            return ` ${attrName}="${sanitizedValue}"`;
          }
          return '';
        });

      return `<${tagName}${sanitizedAttrs}>`;
    });
  }

  /**
   * Sanitizes attribute values
   */
  private sanitizeAttributeValue(attrName: string, value: string): string {
    const attr = attrName.toLowerCase();
    
    // For URL attributes, remove dangerous protocols
    if (['href', 'src'].includes(attr)) {
      return this.sanitizeUrl(value);
    }
    
    // For class attributes, remove potentially dangerous values
    if (attr === 'class') {
      return value.replace(/[^a-zA-Z0-9\s\-_]/g, '');
    }
    
    // For other attributes, basic sanitization
    return value.replace(/[<>"']/g, '');
  }

  /**
   * Sanitizes URLs to remove dangerous protocols
   */
  private sanitizeUrls(content: string): string {
    // Remove javascript: and data: URLs from markdown links and images
    return content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
      const sanitizedUrl = this.sanitizeUrl(url);
      return `[${text}](${sanitizedUrl})`;
    });
  }

  /**
   * Sanitizes a single URL
   */
  private sanitizeUrl(url: string): string {
    const trimmedUrl = url.trim();
    
    // Remove dangerous protocols
    if (/^(javascript|data|vbscript|file|about):/i.test(trimmedUrl)) {
      return '#';
    }
    
    // Allow relative URLs, http, https, mailto, tel
    if (/^(https?|mailto|tel):/i.test(trimmedUrl) || /^[/#]/.test(trimmedUrl)) {
      return trimmedUrl;
    }
    
    // For other cases, assume it's a relative URL
    return trimmedUrl;
  }

  /**
   * Removes HTML comments
   */
  private removeHtmlComments(content: string): string {
    return content.replace(/<!--[\s\S]*?-->/g, '');
  }

  /**
   * Validates that content is safe after sanitization
   */
  validateSanitizedContent(content: string): boolean {
    // Check for remaining script tags
    if (/<script\b/i.test(content)) {
      return false;
    }

    // Check for javascript: URLs
    if (/javascript:/i.test(content)) {
      return false;
    }

    // Check for data: URLs (except safe image data URLs)
    if (/data:(?!image\/(png|jpg|jpeg|gif|svg|webp);base64,)/i.test(content)) {
      return false;
    }

    // Check for event handlers
    if (/\bon\w+\s*=/i.test(content)) {
      return false;
    }

    return true;
  }
}

// Default sanitizer instance
export const defaultSanitizer = new ContentSanitizer();

/**
 * Quick sanitization function using default configuration
 */
export function sanitizeMarkdown(content: string, config?: SanitizationConfig): string {
  const sanitizer = config ? new ContentSanitizer(config) : defaultSanitizer;
  return sanitizer.sanitizeMarkdown(content);
}

/**
 * Validates sanitization configuration
 */
export function validateSanitizationConfig(config: unknown): SanitizationConfig {
  const validated = sanitizationConfigSchema.parse(config);
  return validated as SanitizationConfig;
}