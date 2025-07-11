interface ValidationResult {
  score: number; // 0-1
  confidence: number;
  reasoning: string;
  issues: string[];
  suggestions: string[];
}

interface MaterialAnalysisResponse {
  material_name: string;
  category: string;
  confidence: number;
  properties: Record<string, any>;
  chemical_composition?: Record<string, any>;
  safety_considerations?: string[];
  standards?: string[];
}

export class ResponseValidator {
  // Validate material analysis response quality
  static validateMaterialAnalysis(response: MaterialAnalysisResponse, originalPrompt: string): ValidationResult {
    let score = 1.0;
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check material name quality
    if (!response.material_name || response.material_name.trim().length < 2) {
      score -= 0.3;
      issues.push('Material name missing or too short');
      suggestions.push('Provide specific material identification');
    }

    // Check category validity
    const validCategories = ['metals', 'plastics', 'ceramics', 'composites', 'textiles', 'wood', 'glass', 'rubber', 'concrete', 'other'];
    if (!response.category || !validCategories.includes(response.category)) {
      score -= 0.2;
      issues.push('Invalid or missing material category');
      suggestions.push('Use valid material categories');
    }

    // Check confidence score
    if (response.confidence < 0.6) {
      score -= 0.2;
      issues.push('Low confidence in material identification');
      suggestions.push('Provide more detailed analysis');
    }

    // Check properties completeness
    if (!response.properties || Object.keys(response.properties).length < 2) {
      score -= 0.2;
      issues.push('Insufficient material properties provided');
      suggestions.push('Include density, strength, thermal properties');
    }

    // Check for generic responses
    const genericTerms = ['unknown', 'generic', 'standard', 'typical', 'common'];
    const responseText = JSON.stringify(response).toLowerCase();
    const genericCount = genericTerms.filter(term => responseText.includes(term)).length;
    if (genericCount > 2) {
      score -= 0.1;
      issues.push('Response contains too many generic terms');
      suggestions.push('Provide more specific material details');
    }

    // Ensure score is between 0 and 1
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      confidence: response.confidence || 0,
      reasoning: this.generateReasoning(score, issues),
      issues,
      suggestions
    };
  }

  // Validate 3D generation response quality
  static validate3DGeneration(
    imageBase64: string, 
    originalPrompt: string, 
    parsedRequest: any,
    matchedMaterials: any[]
  ): ValidationResult {
    let score = 1.0;
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check if image was generated
    if (!imageBase64 || imageBase64.length < 1000) {
      score -= 0.5;
      issues.push('Image generation failed or produced invalid result');
      suggestions.push('Retry with different model or parameters');
    }

    // Check prompt parsing quality
    if (!parsedRequest.room_type || !parsedRequest.style) {
      score -= 0.2;
      issues.push('Failed to parse room type or style from prompt');
      suggestions.push('Improve prompt parsing accuracy');
    }

    // Check material matching
    if (matchedMaterials.length === 0 && originalPrompt.toLowerCase().includes('material')) {
      score -= 0.2;
      issues.push('No materials matched despite material mentions in prompt');
      suggestions.push('Improve material matching algorithms');
    }

    // Check for prompt adherence (basic heuristics)
    const promptKeywords = originalPrompt.toLowerCase().split(' ').filter(word => word.length > 3);
    const responseText = JSON.stringify(parsedRequest).toLowerCase();
    const matchedKeywords = promptKeywords.filter(keyword => responseText.includes(keyword));
    
    if (matchedKeywords.length < promptKeywords.length * 0.3) {
      score -= 0.15;
      issues.push('Generated content may not match original prompt well');
      suggestions.push('Improve prompt adherence');
    }

    score = Math.max(0, Math.min(1, score));

    return {
      score,
      confidence: score, // Use score as confidence for 3D generation
      reasoning: this.generateReasoning(score, issues),
      issues,
      suggestions
    };
  }

  // Validate text processing quality (OCR, extraction, etc.)
  static validateTextProcessing(extractedText: string, expectedLength?: number): ValidationResult {
    let score = 1.0;
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check if text was extracted
    if (!extractedText || extractedText.trim().length < 10) {
      score -= 0.6;
      issues.push('Text extraction failed or produced minimal content');
      suggestions.push('Check OCR quality and input document');
    }

    // Check for garbled text (high ratio of special characters)
    const specialCharRatio = (extractedText.match(/[^a-zA-Z0-9\s]/g) || []).length / extractedText.length;
    if (specialCharRatio > 0.3) {
      score -= 0.2;
      issues.push('Text contains many special characters, may be garbled');
      suggestions.push('Improve OCR preprocessing');
    }

    // Check expected length if provided
    if (expectedLength && extractedText.length < expectedLength * 0.5) {
      score -= 0.2;
      issues.push('Extracted text is significantly shorter than expected');
      suggestions.push('Check document processing completeness');
    }

    score = Math.max(0, Math.min(1, score));

    return {
      score,
      confidence: score,
      reasoning: this.generateReasoning(score, issues),
      issues,
      suggestions
    };
  }

  private static generateReasoning(score: number, issues: string[]): string {
    if (score >= 0.9) {
      return 'Excellent response quality with comprehensive and accurate information';
    } else if (score >= 0.7) {
      return 'Good response quality with minor issues';
    } else if (score >= 0.5) {
      return `Acceptable response quality but has concerns: ${issues.slice(0, 2).join(', ')}`;
    } else if (score >= 0.3) {
      return `Poor response quality with significant issues: ${issues.slice(0, 3).join(', ')}`;
    } else {
      return `Very poor response quality requiring retry: ${issues.join(', ')}`;
    }
  }

  // Combined scoring for multiple validation results
  static combineScores(validations: ValidationResult[]): ValidationResult {
    if (validations.length === 0) {
      return {
        score: 0,
        confidence: 0,
        reasoning: 'No validations provided',
        issues: ['No validation results'],
        suggestions: ['Provide validation data']
      };
    }

    const avgScore = validations.reduce((sum, v) => sum + v.score, 0) / validations.length;
    const avgConfidence = validations.reduce((sum, v) => sum + v.confidence, 0) / validations.length;
    const allIssues = validations.flatMap(v => v.issues);
    const allSuggestions = validations.flatMap(v => v.suggestions);

    return {
      score: avgScore,
      confidence: avgConfidence,
      reasoning: this.generateReasoning(avgScore, allIssues),
      issues: [...new Set(allIssues)], // Remove duplicates
      suggestions: [...new Set(allSuggestions)] // Remove duplicates
    };
  }
}