/**
 * Research Agent - Admin Only
 * Advanced research and analysis capabilities for administrators
 */

import { Agent, Task } from 'praisonai';

export interface ResearchAgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ResearchQuery {
  topic: string;
  depth?: 'shallow' | 'medium' | 'deep';
  focusAreas?: string[];
  includeSourceAnalysis?: boolean;
}

export interface ResearchResult {
  topic: string;
  findings: string;
  sources: string[];
  confidence: number;
  executionTime: number;
  timestamp: string;
}

/**
 * Research Agent for admin-only research and analysis
 */
export class ResearchAgent {
  private agent: Agent;

  constructor(_config: ResearchAgentConfig = {}) {
    this.agent = new Agent({
      name: 'Research Agent',
      role: 'Senior Research Analyst',
      goal: 'Conduct comprehensive research and analysis on complex topics',
      backstory: `You are an expert research analyst with deep knowledge across multiple domains.
        Your role is to conduct thorough research, analyze information critically, and provide
        well-sourced insights. You excel at identifying patterns, synthesizing information,
        and providing actionable recommendations.`,
      verbose: true,
    });
  }

  /**
   * Execute a research query
   */
  async research(query: ResearchQuery): Promise<ResearchResult> {
    const startTime = Date.now();

    try {
      const depthInstructions = this.getDepthInstructions(query.depth || 'medium');
      const focusInstructions = query.focusAreas
        ? `Focus on these areas: ${query.focusAreas.join(', ')}`
        : '';

      const researchPrompt = `
        Research Topic: ${query.topic}
        
        ${depthInstructions}
        ${focusInstructions}
        
        ${query.includeSourceAnalysis ? 'Include analysis of source credibility and reliability.' : ''}
        
        Provide a comprehensive research report with:
        1. Key findings and insights
        2. Supporting evidence and sources
        3. Analysis and interpretation
        4. Recommendations or conclusions
      `;

      const task = new Task({
        name: 'Research Task',
        description: researchPrompt,
        expected_output: 'A comprehensive research report with findings, sources, and analysis',
        agent: this.agent,
      });

      const result = await this.agent.execute(task);
      const executionTime = Date.now() - startTime;

      return {
        topic: query.topic,
        findings: String(result),
        sources: this.extractSources(String(result)),
        confidence: this.calculateConfidence(String(result)),
        executionTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Research execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get depth-specific research instructions
   */
  private getDepthInstructions(depth: 'shallow' | 'medium' | 'deep'): string {
    switch (depth) {
      case 'shallow':
        return 'Provide a brief overview with key points (2-3 paragraphs).';
      case 'deep':
        return 'Conduct an in-depth analysis with multiple perspectives and detailed examination.';
      case 'medium':
      default:
        return 'Provide a balanced analysis with sufficient detail and multiple perspectives.';
    }
  }

  /**
   * Extract sources from research result
   */
  private extractSources(result: string): string[] {
    const sourcePattern = /(?:source|reference|from|according to)[:\s]+([^\n.]+)/gi;
    const matches = result.match(sourcePattern) || [];
    return matches.map(m => m.replace(/(?:source|reference|from|according to)[:\s]+/i, '').trim());
  }

  /**
   * Calculate confidence score based on result quality
   */
  private calculateConfidence(result: string): number {
    let confidence = 0.5;

    // Increase confidence if result contains citations
    if (/source|reference|according to|study|research/i.test(result)) {
      confidence += 0.2;
    }

    // Increase confidence if result is detailed
    if (result.length > 500) {
      confidence += 0.15;
    }

    // Increase confidence if result contains multiple perspectives
    if (/however|alternatively|on the other hand|conversely/i.test(result)) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1);
  }

  /**
   * Analyze a specific topic with predefined focus areas
   */
  async analyzeTopicDeep(topic: string, focusAreas: string[]): Promise<ResearchResult> {
    return this.research({
      topic,
      depth: 'deep',
      focusAreas,
      includeSourceAnalysis: true,
    });
  }

  /**
   * Quick research for rapid insights
   */
  async quickResearch(topic: string): Promise<ResearchResult> {
    return this.research({
      topic,
      depth: 'shallow',
      includeSourceAnalysis: false,
    });
  }
}

export const createResearchAgent = (config?: ResearchAgentConfig): ResearchAgent => {
  return new ResearchAgent(config);
};

