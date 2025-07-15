import fs from 'fs/promises';
import path from 'path';

interface PromptTemplate {
  system: string;
  user: string;
  variables?: string[];
  customizations?: Record<string, any>;
}

interface PromptVariables {
  [key: string]: any;
}

interface PromptConfig {
  version: string;
  description: string;
  prompts: {
    [category: string]: {
      [type: string]: PromptTemplate;
    };
  };
  metadata?: {
    lastModified: string;
    modifiedBy: string;
    notes: string;
  };
}

export class PromptManager {
  private static loadedConfig: PromptConfig | null = null;
  private static configPath = path.join(process.cwd(), 'api', 'prompts.config.json');

  private static prompts = {
    // Intent Analysis Prompts
    intentAnalysis: {
      indices: {
        system: 'You are a helpful assistant for analyzing user intent for document analysis tasks.',
        user: `You are analyzing a user query for an indices creation agent. The agent will analyze PDF documents and create scoring indices based on the user's question.

User Query: "{{userQuery}}"

Please provide:
1. A clear analysis of what the users' intent. 
2. A concise, descriptive name for this indices creation task (max 50 characters)
3. A consistent index name that will be used for ALL documents analyzed in this task (max 40 characters, descriptive but concise)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what user wants to measure",
  "taskName": "concise task name", 
  "indexName": "consistent index name for all documents"
}`,
        variables: ['userQuery']
      },
      
      changeStatement: {
        system: 'You are a helpful assistant for analyzing user intent for research tasks.',
        user: `You are analyzing a user query for a change of statement agent. The agent will analyze PDF documents to answer research questions.

User Query: "{{userQuery}}"

Please provide:
1. A clear analysis of what the user wants to research and understand.
2. A concise, descriptive name for this research task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of research objective",
  "taskName": "concise task name"
}`,
        variables: ['userQuery']
      }
    },

    // Worker Prompts
    workers: {
      quantify: {
        system: 'You are a helpful assistant for document analysis. You are good at quantitative analysis and when you quantify values, you should always round to two decimal places.',
        user: `## Purpose

You will analyze an article and generate a score based on a specific user inquiry and intent.

## Context

This article is part of a sequential series addressing similar or related topics. Previous articles were reviewed by similar agents who provided:

* **Quotes**: Relevant excerpts from the articles.
* **Rationale**: Explanation of how the score was determined.
* **Scores**: Numeric representation of how closely each article aligns with user inquiries.

Your task is to perform this analysis for the current article, informed by previous analyses.

## Steps

1. **Review Historical Analyses (if available)**:
   Carefully examine prior analyses—quotes, rationales, and scores—to understand the logic behind historical scoring.

2. **Analyze Current and Previous Articles**:

   * Identify key differences related directly to the user inquiry.
   * Note changes in tone, emphasis, or specific statements between articles.

3. **Assign a Score**:

   * Score the current article based on the user inquiry.
   * Be consistent with historical scoring logic, but adapt appropriately if the current context has changed significantly.
   * Your score should be able to compare to historical and its delta vs. previous scores should reflect the change of tone or statement.
   * Scores outside the historical range are acceptable if clearly justified.

4. **Extract Supporting Quotes and Differences**:

   * Provide multiple quotes directly from the current article supporting your score.
   * Clearly highlight key differences from the previous article's statements or tone.
   * Include a concise, logical rationale explaining your scoring decision for future reference.

{{#if knowledge}}

## Knowledge

{{knowledge}}
{{/if}}

## Required Output Format

Your output must be a single valid JSON object following this exact format:

* All keys and string values must be double-quoted.
* Arrays must be enclosed in square brackets.
* Do **not** use markdown, YAML, or other formatting.
* IMPORTANT: You must use "{{indexName}}" as the score_name. Do not generate a different name.


Example output:

{
  "score_name": "{{indexName}}",
  "score_value": 0.7342,
  "article_id": "{{articleId}}",
  "quotes": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that declines in inflation had been slower than expected.",
    "Participants noted that economic activity expanded modestly, with signs of improving labor market balance."
  ],
  "key_differences": [
    {"last": "inflation remains high", "current": "inflation remains elevated"},
    {"last": "aaaaa", "current":"aaaaab"}
  ],
  "rationale": "The score of 0.7342 reflects moderately high concern, indicated by explicit mentions of elevated inflation and slower-than-expected improvements. The increase from the previous period is justified by these specific textual changes."
}


## Article

{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

## User Inquiry

{{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

## Historical Analyses

{{#if historicalScores}}{{historicalScores}}{{/if}}

{{#if previousArticle}}

## Previous Article

{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Consider this previous article when analyzing trends, changes, or differences.
{{else}}
Previous Article: No previous document available for comparison.
{{/if}}

Output only the required JSON object exactly as described. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['knowledge', 'indexName', 'articleId', 'article', 'timestamp', 'question', 'intent', 'historicalScores', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      research: {
        system: 'You are a helpful assistant for research and summarization.',
        user: `## Purpose

You will analyze a series of documents provided by a user to address their inquiry or research question, highlighting how key statements or perspectives evolve across documents.

## Context

The user has provided:

* A specific **research question or inquiry**.
* A chronological sequence of articles on related topics, potentially accompanied by historical summaries or analyses.

Your goal is to carefully examine these documents in chronological order, clearly identify relevant changes or developments, and succinctly summarize your findings.

## Steps

1. **Review Historical Context (if provided):**

   * Carefully read any available historical summaries or answers to understand prior analyses and context.

2. **Analyze Current vs. Previous Documents:**

   * Compare the current article with the immediately preceding one.
   * Identify clear differences related to the user's inquiry. Pay close attention to changes in wording, tone, emphasis, or policy statements.

3. **Summarize Key Developments:**

   * Write a concise and informative paragraph summarizing new developments or shifts in statements, directly referencing your comparative analysis.
   * Incorporate incremental insights from the current article relative to historical research context and previous documents.

4. **Extract Supporting Quotes and Differences:**

   * Select multiple direct quotes from the current article that clearly support your summary.
   * Explicitly document significant statement differences between the current and previous articles.

5. **Explain Your Rationale:**

   * Clearly and concisely justify your summary, highlighting how the identified differences inform your analysis and response.

## Required Output Format

Your output **must** be a single valid JSON object structured precisely as follows:

* All keys and string values must be double-quoted.
* Arrays must be enclosed in square brackets.
* Do **not** use markdown, YAML, or other formatting.

Example output:

{
  "answer": "The latest document reflects an escalation in user requirements, explicitly calling for the removal of statement A and increased emphasis on statement B.",
  "article_id": "{{articleId}}",
  "quotes": [
    "User requires to waive statement A.",
    "All participants agreed that premia should increase as inflation increases."
  ],
  "differences": [
    {"last": "User raised concern on statement A.", "current": "User requires statement A to be removed."}
  ],
  "rationale": "The shift from general concerns to explicit removal indicates stronger user sentiment on statement A. Additionally, increased emphasis on inflation-related premia suggests heightened awareness and urgency compared to previous discussions."
}

## Article

{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

## User Question

{{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

## Historical Research Context

{{historicalResearch}}

{{#if previousArticle}}

## Previous Article

{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Explicitly consider and highlight key developments, changes, or continuities when comparing with this previous article.
{{else}}
Previous Article: No previous document available for comparison.
{{/if}}

Output only the required JSON object exactly as described. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['articleId', 'timestamp', 'article', 'question', 'intent', 'historicalResearch', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      changeStatement: {
        system: 'You are a helpful assistant for analyzing changes in statements, language, tone, and messaging in documents.',
        user: `You are analyzing a document to identify changes in statements, language, tone, or messaging. Your task is to track qualitative changes in how concepts are discussed, framed, or presented.

1. Analyze the document for statements, language patterns, tone, and messaging related to the focus area.
2. Compare with historical analysis to identify changes, evolution, or shifts in approach.
3. If a previous article is available, pay special attention to direct comparisons between the current and previous documents.
4. Extract specific quotes that demonstrate these changes or continuities.
5. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

IMPORTANT: You must use "{{analysisName}}" as the analysis_name. Do not generate a different name.

Example output:
{
  "analysis_name": "{{analysisName}}",
  "change_type": "Increased dovish language and forward guidance clarity",
  "article_id": "{{articleId}}",
  "quotes": [
    "The Committee will continue to monitor the implications of incoming information for the economic outlook.",
    "The Committee is prepared to adjust the stance of monetary policy as appropriate if risks emerge that could impede the attainment of the Committee's goals.",
    "The Committee expects to maintain this target range until labor market conditions have reached levels consistent with the Committee's assessments."
  ],
  "change_description": "This document shows a notable shift toward more explicit forward guidance compared to earlier communications. The language has become more specific about conditions for policy changes, moving away from general statements to concrete economic indicators.",
  "comparison_context": "Previous documents used more general language about 'monitoring conditions' while this document provides specific criteria and expectations, indicating a strategic shift toward greater transparency in monetary policy communication."
}

Article:
{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

Question: {{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

Historical Analysis:
{{#if historicalAnalysis}}{{historicalAnalysis}}{{else}}No previous analysis available.{{/if}}

{{#if previousArticle}}
Previous Article for Direct Comparison:
{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Please analyze the current document in the context of this previous document, identifying specific changes in language, tone, statements, or messaging. Focus on how the approach, framing, or emphasis has evolved between these two documents.
{{else}}
Previous Article: No previous document available for direct comparison.
{{/if}}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['analysisName', 'articleId', 'timestamp', 'article', 'question', 'intent', 'historicalAnalysis', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      writingTitle: {
        system: 'You are a helpful assistant for generating professional research article titles.',
        user: `Based on this research question and intent, generate a clear, professional title for a research article:

Question: {{question}}
Intent: {{intent}}

Generate a concise, descriptive title (max 60 characters) that would be appropriate for a professional research article. 
Return only the title, no quotes or additional text.`,
        variables: ['question', 'intent']
      },

      writingArticle: {
        system: 'You are an expert research analyst and writer specializing in comprehensive, evidence-based research articles.',
        user: `You are an expert research analyst writing a comprehensive research article. Based on the provided research context from multiple documents, create a professional, well-structured markdown article.

Research Question: {{question}}
{{#if intent}}Research Intent: {{intent}}{{/if}}

ARTICLE REQUIREMENTS:
1. **Professional Structure**: Use a clear hierarchy with main sections and subsections
2. **Executive Summary**: Start with a brief overview of key findings
3. **Comprehensive Analysis**: Provide detailed analysis of the research question
4. **Evidence-Based**: Support all claims with specific citations from the documents
5. **Chronological Context**: When relevant, discuss developments over time
6. **Synthesis**: Connect findings across different documents to provide insights
7. **Citations**: Use [^article_id] format for all references
8. **References Section**: Include complete reference list with titles and timestamps

WRITING STYLE:
- Professional and authoritative tone
- Clear, accessible language while maintaining analytical depth
- Logical flow between sections
- Specific data points and quotes where relevant
- Balanced perspective acknowledging different viewpoints when present

STRUCTURE TEMPLATE:
# [Article Title]

## Executive Summary
[2-3 paragraph overview of key findings]

## Introduction
[Context and background]

## [Main Analysis Sections]
[Organize by themes, chronology, or key aspects of the research question]

## Key Findings
[Summarize main discoveries and insights]

## Conclusion
[Synthesis and implications]

## References
[Complete citation list]

---

Historical Research Context:
{{historicalResearch}}

Article ID Map (for citation):
{{articleIdMap}}

Timestamp Map (for chronological context):
{{timestampMap}}

Generate the complete markdown article following the structure and requirements above.`,
        variables: ['question', 'intent', 'historicalResearch', 'articleIdMap', 'timestampMap']
      }
    }
  };

  /**
   * Load prompts from configuration file if available
   */
  static async loadConfig(): Promise<void> {
    try {
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        this.loadedConfig = JSON.parse(configData);
        console.log(`[PROMPT MANAGER] Loaded configuration from: ${this.configPath}`);
        console.log(`[PROMPT MANAGER] Config version: ${this.loadedConfig?.version}`);
      } else {
        console.log(`[PROMPT MANAGER] No configuration file found at: ${this.configPath}`);
        console.log(`[PROMPT MANAGER] Using default prompts`);
      }
    } catch (error) {
      console.error(`[PROMPT MANAGER] Error loading configuration:`, error);
      console.log(`[PROMPT MANAGER] Falling back to default prompts`);
      this.loadedConfig = null;
    }
  }

  /**
   * Get a formatted prompt by category and type
   */
  static async getPrompt(category: 'intentAnalysis' | 'workers', type: string, variables: PromptVariables = {}): Promise<{ system: string; user: string }> {
    // Load config if not already loaded
    if (this.loadedConfig === null) {
      await this.loadConfig();
    }

    // Try to get prompt from config first, then fall back to defaults
    let promptTemplate: PromptTemplate | undefined;
    
    if (this.loadedConfig?.prompts?.[category]?.[type]) {
      promptTemplate = this.loadedConfig.prompts[category][type];
      console.log(`[PROMPT MANAGER] Using config prompt: ${category}.${type}`);
    } else {
      promptTemplate = (this.prompts as any)[category]?.[type];
      console.log(`[PROMPT MANAGER] Using default prompt: ${category}.${type}`);
    }
    
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${category}.${type}`);
    }

    return {
      system: this.formatTemplate(promptTemplate.system, variables),
      user: this.formatTemplate(promptTemplate.user, variables)
    };
  }

  /**
   * Format a template string with variables using Handlebars-like syntax
   */
  private static formatTemplate(template: string, variables: PromptVariables): string {
    let formatted = template;

    // Replace simple variables {{variable}}
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(regex, variables[key] || '');
    });

    // Handle conditional blocks {{#if variable}}...{{/if}}
    formatted = formatted.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, variable, content) => {
      return variables[variable] ? content : '';
    });

    // Handle conditional blocks with else {{#if variable}}...{{else}}...{{/if}}
    formatted = formatted.replace(/{{#if\s+(\w+)}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g, (match, variable, ifContent, elseContent) => {
      return variables[variable] ? ifContent : elseContent;
    });

    return formatted;
  }

  /**
   * Get available prompt categories and types
   */
  static async getAvailablePrompts(): Promise<{ [category: string]: string[] }> {
    await this.loadConfig();
    
    const result: { [category: string]: string[] } = {};
    const source = this.loadedConfig?.prompts || this.prompts;
    
    Object.keys(source).forEach(category => {
      result[category] = Object.keys((source as any)[category] || {});
    });
    
    return result;
  }

  /**
   * Get variables required for a specific prompt
   */
  static async getPromptVariables(category: 'intentAnalysis' | 'workers', type: string): Promise<string[]> {
    await this.loadConfig();
    
    const promptTemplate = this.loadedConfig?.prompts?.[category]?.[type] || (this.prompts as any)[category]?.[type];
    return promptTemplate?.variables || [];
  }

  /**
   * Validate that all required variables are provided
   */
  static async validateVariables(category: 'intentAnalysis' | 'workers', type: string, variables: PromptVariables): Promise<{ isValid: boolean; missing: string[] }> {
    const required = await this.getPromptVariables(category, type);
    const provided = Object.keys(variables);
    const missing = required.filter(req => !provided.includes(req));
    
    return {
      isValid: missing.length === 0,
      missing
    };
  }

  /**
   * Get prompt preview (first 200 chars) for debugging
   */
  static async getPromptPreview(category: 'intentAnalysis' | 'workers', type: string): Promise<{ system: string; user: string }> {
    const prompts = await this.getPrompt(category, type, {});
    
    return {
      system: prompts.system.substring(0, 200) + (prompts.system.length > 200 ? '...' : ''),
      user: prompts.user.substring(0, 200) + (prompts.user.length > 200 ? '...' : '')
    };
  }

  /**
   * Reload configuration from file
   */
  static async reloadConfig(): Promise<void> {
    this.loadedConfig = null;
    await this.loadConfig();
  }

  /**
   * Get configuration info
   */
  static getConfigInfo(): { usingConfig: boolean; version?: string; configPath: string } {
    return {
      usingConfig: this.loadedConfig !== null,
      version: this.loadedConfig?.version,
      configPath: this.configPath
    };
  }
} 

